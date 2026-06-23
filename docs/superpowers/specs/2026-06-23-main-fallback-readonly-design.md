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
   and reload all then target a path that exists. No silent worktree→main
   redirection that leaves the client holding a nonexistent path.

2. **Anything served from main is read-only.** Rather than special-casing the
   fallback, the rule is general: if the file being viewed lives in a project's
   main checkout (not a worktree), the editor is read-only and writes are
   refused. This also covers the existing `onMain` re-surfaced specs, which are
   currently editable and silently write to main — a latent footgun this closes.

## Core concept: main vs. worktree paths

A spec path is a **worktree path** iff it contains a `/.claude/worktrees/<wt>/`
segment. Otherwise it is a **main path** (directly under
`<root>/<project>/docs/superpowers/...`). The main equivalent of a worktree path
is that path with the `.claude/worktrees/<wt>/` segment removed:

```
~/Projects/p/.claude/worktrees/wt/docs/superpowers/specs/x.md
  → ~/Projects/p/docs/superpowers/specs/x.md
```

## Architecture

### New pure helpers — `src/lib/server/paths.ts`

Co-locate with the existing path-safety logic, since these are
path-shape predicates over the same `PROJECTS_ROOT`/segment vocabulary.

- `isMainPath(p: string, root = PROJECTS_ROOT): boolean` — true when the resolved
  path is a valid spec path (passes the `assertSpecPath` shape checks) and does
  **not** contain a `.claude/worktrees/<wt>/` segment.
- `mainEquivalent(p: string, root = PROJECTS_ROOT): string | null` — given a
  worktree path, return its main equivalent (segment stripped), re-validated
  through `assertSpecPath`. Returns `null` if `p` is not a worktree path.

Both are pure string functions (no FS access) — easy to unit-test against a
passed-in `root`.

### Resolution with fallback — `src/routes/api/spec/+server.ts`

`GET` becomes:

1. `path = safePath(url)` (unchanged validation).
2. Try to `stat`/`readFile` `path`.
3. On ENOENT, if `path` is a worktree path, compute `mainEquivalent(path)`; if
   that exists on disk, read it instead and set `effectivePath` to it.
4. If neither exists → 404 (unchanged).
5. Respond `{ content, mtime, path: effectivePath, readOnly: isMainPath(effectivePath) }`.

`readOnly` is `true` whenever the served file is on main — whether reached by
fallback or selected directly (the `onMain` case).

`PUT` refuses writes to main paths: if `isMainPath(path)`, return `403`
(`'main checkout is read-only'`) before touching the filesystem. This is the
server-side guard backing the client's read-only UI. (No worktree→main fallback
on write: a missing worktree write target is a genuine error.)

### Resolve survives a vanished worktree — `src/lib/server/resolve.ts`

So a persisted opened tab can be re-resolved across a reload that happens
*before* the user clicks it (path not yet adopted): in `resolveDoc`, if the
query is a worktree path and yields no candidate match, retry matching with
`mainEquivalent(query)`. The main candidate is already collected, so this is a
second match pass, not new IO. The returned group's `parent.path` is then the
main path, and `parent.onMain`/read-only behavior follows from the path.

### Client adopts the path and goes read-only — `src/routes/+page.svelte`

- New state: `let readOnly = $state(false)`.
- `selectSpec(path)`: on success, read `data.path` as the **effective** path.
  - Set `content`, `knownMtime`, `readOnly = data.readOnly`.
  - Set `selectedPath = data.path` (not the requested `path`).
  - If `data.path !== path`, **adopt**: rewrite the matching `openedGroups`
    entry's `parent.path` to `data.path`, `persistOpened()`, update
    `lastSelectedGroup` if it matched, and write `data.path` to `SELECTED_KEY`.
    Otherwise persist `data.path` to `SELECTED_KEY` as today.
- `handleInput` / `save`: no-op when `readOnly` (don't arm the autosave timer,
  don't PUT). Guarding `save` as well as `handleInput` is belt-and-suspenders.
- `pollExternalChange`: a read-only file still polls and reloads on external
  change (you want to see main updates), but never autosaves — already covered
  by the `save`/`handleInput` guards.
- Header: when `readOnly`, show a small `read-only` marker next to the path so
  the disabled editor isn't mistaken for a bug.

### Editor honors read-only — `src/lib/components/Editor.svelte`

- New prop `readOnly: boolean`.
- Add a CodeMirror `Compartment` for editability, configured from `readOnly`:
  `EditorState.readOnly.of(readOnly)` + `EditorView.editable.of(!readOnly)`.
- Reconfigure the compartment in a `$effect` when `readOnly` changes (switching
  between a worktree spec and a main spec without remounting the editor).

## Data flow (the reported scenario)

1. Tab in `openedGroups` holds the worktree path; user clicks it.
2. `selectSpec(worktreePath)` → `GET /api/spec?path=worktreePath`.
3. Server: worktree file ENOENT → `mainEquivalent` exists → reads main, responds
   `{ content, mtime, path: mainPath, readOnly: true }`.
4. Client adopts `mainPath`: rewrites the opened tab + `localStorage`, sets
   `selectedPath = mainPath`, `readOnly = true`. Tab is now switchable and shows
   the landed spec, read-only.
5. On the next discovery refresh, if the main spec is also surfaced (`onMain`),
   `openedRendered` dedupes it by the now-main path — no duplicate tab.

## Error handling

- Worktree gone **and** no main equivalent → 404 (genuinely missing).
- `mainEquivalent` is re-validated through `assertSpecPath`; a computed path that
  somehow fails validation is treated as no-fallback (→ 404), never read.
- `PUT` to a main path → 403, surfaced as `save failed` if it ever fires (it
  shouldn't, given the client guard).

## Testing

Pure-unit, colocated, following the existing `root`-injection style:

- `paths.test.ts`: `isMainPath` (worktree vs main vs outside-root vs
  non-`.md`); `mainEquivalent` (strips the right segment, returns `null` for
  main/non-worktree input, re-validates).
- `resolve.test.ts`: a worktree query whose file is absent but whose main
  equivalent exists resolves to the main group; absent in both → `null`.
- Endpoint behavior (`/api/spec` fallback + `readOnly` flag, `PUT` 403 on main)
  covered by extracting the decision into the pure helpers and asserting those;
  the route wiring stays thin.

## Out of scope

- No UI to *promote* a main spec back into an editable worktree.
- No change to discovery's 24 h window or culling rules.
- No migration of already-persisted `localStorage` paths beyond the natural
  adopt-on-next-click behavior.
