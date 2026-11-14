# Worktree→main path fallback, with main as read-only

## Problem

When a worktree is merged to main and its directory is removed, any tab still
pointing at the old worktree path becomes a dead link. Concretely: the open tab
*"Plans-rail slot sizing — make the persistent rail size by slots again"* lives
in `openedGroups` with a path like
`~/Projects/<proj>/.claude/worktrees/<wt>/docs/superpowers/specs/<file>.md`.
That worktree was merged and deleted, so the file now exists **only** on main at
`~/Projects/<proj>/docs/superpowers/specs/<file>.md`. Clicking the tab hits
`/api/spec?path=<worktree path>`, `readFile` throws ENOENT → 404 → `selectSpec`
returns `false` → the tab can't be switched to.

`assertSpecPath()` is not the blocker: it *validates* the worktree path fine
(under root, has the `docs/superpowers` segment, ends in `.md`). The path is
simply gone from disk. We need resolution to fall back to the main checkout when
the worktree copy has disappeared.

## Decisions (from brainstorming)

1. **Adopt the main path.** When we fall back, the server reports the path it
   actually read, and the client updates its state (selection, the opened tab,
   `localStorage`) to that real main path. Saves, the 3 s external-change poll,
   and reload all then target a path that exists.

2. **Anything on main is read-only.** The rule is general: if the file being
   viewed lives in a project's main checkout (not a worktree), the editor is
   read-only and writes are refused. This also covers the existing `onMain`
   re-surfaced specs, which are currently editable and silently write to main —
   a latent footgun this closes.

3. **The tab says where it lives; that *is* the read-only signal.** No header
   marker. The tab caption gains a `main` location label (so a main file reads
   `main · <project>`, the way a worktree file reads `<worktree> · <project>`).
   "main" in the caption tells you it's read-only. The header keeps showing the
   selected path — which, after adoption, is correctly the main path.

## Core concept: main vs. worktree paths

A spec path is a **worktree path** iff it contains a `/.claude/worktrees/<wt>/`
segment. Otherwise it is a **main path** (directly under
`<root>/<project>/docs/superpowers/...`). The main equivalent of a worktree path
is that path with the `.claude/worktrees/<wt>/` segment removed:

```
~/Projects/p/.claude/worktrees/wt/docs/superpowers/specs/x.md
  → ~/Projects/p/docs/superpowers/specs/x.md
```

Both the client (tab caption, read-only state) and the server (fallback, write
guard) need this distinction, so it lives in one shared, FS-free helper.

## Architecture

### New shared helper — `src/lib/mainpath.ts`

Pure string functions over the absolute POSIX paths this local-only app deals
in (darwin, `/` separator) — no `node:path`, no FS, no `PROJECTS_ROOT`, so it
imports cleanly into both client and server code.

- `isWorktreePath(p: string): boolean` — `p.includes('/.claude/worktrees/')`.
- `isMainPath(p: string): boolean` — `!isWorktreePath(p)`. (Callers only ever
  pass already-validated spec paths, so the worktree-segment check alone is the
  main/worktree discriminator.)
- `mainEquivalent(p: string): string | null` — strip the
  `/.claude/worktrees/<wt>/` segment (`p.replace(/\/\.claude\/worktrees\/[^/]+\//, '/')`);
  return `null` if `p` is not a worktree path (no segment to strip).

The server still re-validates any computed main path through `assertSpecPath`
(the root/segment/`.md` safety checks stay in `paths.ts`); these helpers only
classify shape.

### Resolution with fallback — `src/routes/api/spec/+server.ts`

`GET`:

1. `path = safePath(url)` (unchanged validation).
2. Try to read `path`.
3. On ENOENT, if `isWorktreePath(path)`, compute `mainEquivalent(path)`,
   re-validate it through `assertSpecPath`, and if it exists on disk read it
   instead, setting `effectivePath` to it.
4. If neither exists → 404 (unchanged).
5. Respond `{ content, mtime, path: effectivePath }`.

The response carries the **effective path**; read-only-ness is not a separate
field — the client derives it with `isMainPath(effectivePath)`, the same check
that drives the tab caption. One source of truth.

`PUT` refuses writes to main paths: if `isMainPath(path)`, return `403`
(`'main checkout is read-only'`) before touching the filesystem. This is the
server-side guard behind the client's read-only UI. No worktree→main fallback on
write — a missing worktree write target is a genuine error.

### Resolve survives a vanished worktree — `src/lib/server/resolve.ts`

So a persisted opened tab can be re-resolved across a reload that happens
*before* the user clicks it: in `resolveDoc`, if the query is a worktree path and
the first match pass finds nothing, retry the match with `mainEquivalent(query)`.
The main candidate is already collected, so this is a second match over existing
data, not new IO. The returned group's `parent.path` is then the main path.

### Tab caption gains a `main` label — `src/lib/caption.ts`

Today `captionFor` derives the location from `p.worktree`, falling back to the
distinct worktree names of the child plans, and shows nothing when both are
empty — so a main file currently reads just `<project>`. Add `main` as the
final fallback:

```
const branch = p.worktree ?? (childBranches(group) || (isMainPath(p.path) ? 'main' : ''));
```

- Live worktree spec → its worktree name (unchanged).
- `onMain` spec re-surfaced because a live worktree plan references it → still
  shows that plan's worktree name (its work is live there) — unchanged.
- Pure main spec with no worktree children (the fallback case) → `main`.

### Client adopts the path and goes read-only — `src/routes/+page.svelte`

- New state: `let readOnly = $state(false)`.
- `selectSpec(path)`: on success, treat `data.path` as the **effective** path.
  - Set `content`, `knownMtime`, `readOnly = isMainPath(data.path)`,
    `selectedPath = data.path`, and write `data.path` to `SELECTED_KEY`.
  - **Adopt** when `data.path !== path` (a fallback happened): re-resolve the
    canonical group via `/api/resolve?q=<data.path>` and swap it into
    `openedGroups` (replacing the entry whose old worktree path was clicked) and
    into `lastSelectedGroup`, then `persistOpened()`. This yields an internally
    consistent group — parent on main, caption `main · <project>`, accurate
    children — without hand-patching fields. One extra request, only in the rare
    fallback case.
- `handleInput` / `save`: no-op when `readOnly` (don't arm the autosave timer,
  don't PUT). Guarding both is belt-and-suspenders.
- `pollExternalChange`: a read-only file still polls and reloads on external
  change (you want to see main updates); it just never autosaves — already
  covered by the guards above.
- Header: **unchanged** — keeps showing `selectedPath` (now the adopted main
  path) with its tooltip.

### Editor honors read-only — `src/lib/components/Editor.svelte`

- New prop `readOnly: boolean`.
- A CodeMirror `Compartment` for editability, configured from `readOnly`:
  `EditorState.readOnly.of(readOnly)` + `EditorView.editable.of(!readOnly)`.
- Reconfigure the compartment in a `$effect` when `readOnly` changes, so
  switching between a worktree spec and a main spec needs no remount.

## Data flow (the reported scenario)

1. Tab in `openedGroups` holds the worktree path; user clicks it.
2. `selectSpec(worktreePath)` → `GET /api/spec?path=worktreePath`.
3. Server: worktree file ENOENT → `mainEquivalent` exists → reads main, responds
   `{ content, mtime, path: mainPath }`.
4. Client: `data.path !== worktreePath` → re-resolves the group for `mainPath`,
   swaps it into the opened tabs + `localStorage`, sets `selectedPath = mainPath`,
   `readOnly = true`. Tab is now switchable, captioned `main · <project>`, and
   read-only.
5. On the next discovery refresh, if the main spec is also surfaced (`onMain`),
   `openedRendered` dedupes it by the now-main path — no duplicate tab.

## Error handling

- Worktree gone **and** no main equivalent → 404 (genuinely missing).
- A computed main equivalent that fails `assertSpecPath` is treated as
  no-fallback (→ 404), never read.
- `PUT` to a main path → 403, surfaced as `save failed` if it ever fires (it
  shouldn't, given the client guard).

## Testing

Pure-unit, colocated, following the existing `root`-injection / pure-input style:

- `mainpath.test.ts`: `isWorktreePath` / `isMainPath` (worktree vs main paths);
  `mainEquivalent` (strips the right segment, returns `null` for a main/
  non-worktree input).
- `caption.test.ts`: extend — a main-path parent with no worktree children
  yields a `main` location label; the worktree and `onMain`-with-worktree-child
  cases are unchanged.
- `resolve.test.ts`: a worktree query whose file is absent but whose main
  equivalent exists resolves to the main group; absent in both → `null`.
- Endpoint behavior (`/api/spec` fallback path, `PUT` 403 on main) rests on the
  pure helpers asserted above; the route wiring stays thin.

## Out of scope

- No UI to *promote* a main spec back into an editable worktree.
- No change to discovery's 24 h window or culling rules.
- No migration of already-persisted `localStorage` paths beyond the natural
  adopt-on-next-click behavior.
