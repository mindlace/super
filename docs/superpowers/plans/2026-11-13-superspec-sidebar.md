# superspec read-only sidebar reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn superspec into a read-only reader with a left sidebar ordered by real spec creation time, an "updated since you opened it" highlight, close on every entry, and open-by-absolute-path for any `.md`/`.html` under a project's `docs/`.

**Architecture:** The server replaces the single filename-date `recency` with per-file `created`/`updated` times taken from one `git log --name-status` per checkout (plus the existing `git status`), falling back to the filesystem. `DisplayGroup` carries `created` (spec's) and `updated` (max over spec and plans); the client sorts by `created`, windows by `updated`, and keeps per-viewer seen/closed times in `localStorage` through a small pure module. All editing code is deleted, the read guard is relaxed to project `docs/` folders with realpath resolution, and a `Host` check is added in `hooks.server.ts`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, adapter-node, Tailwind 4, vitest (node + jsdom), git CLI via `execFile`.

**Spec:** `docs/superpowers/specs/2026-11-13-superspec-sidebar-design.md`

All commands run from `superspec/` (cd there as its own command first; never `cd … && cmd`). Commits use Conventional Commits, no attribution trailers.

## Global Constraints

- Read-only: no endpoint, component or module may write a file. `PUT /api/spec` is removed.
- Allowed `Host` headers, exactly: `127.0.0.1:4510`, `localhost:4510`. Anything else gets 403.
- Absolute-path opens: `.md` or `.html` regular files under `~/Projects/<project>/docs/**` or `~/Projects/<project>/.claude/worktrees/<wt>/docs/**` (`<wt>` may be nested, e.g. `support/foo`, up to `MAX_WORKTREE_DEPTH` = 3 segments, `src/lib/server/fswalk.ts:8`). Symlinks resolved with `realpath` before the check.
- The asset route stays limited to `docs/superpowers/<type>/assets/` (`assertAssetPath`, `src/lib/server/paths.ts:26-45`, unchanged).
- Sidebar order: group `created` desc; equal `created` breaks by parent path ascending. Plan activity never reorders.
- 24h window (`DAY_MS`, `src/lib/recency.ts:1`) applies to group `updated`.
- Times are epoch milliseconds everywhere (git `%ct` seconds × 1000).
- `localStorage` keys: existing `sr:openedPaths`, `sr:selectedPath`; new `sr:seen`, `sr:closed`. Every new read/write wrapped in try/catch.
- Body font in `static/spec.css` is `var(--sans)`; the `--serif` variable is removed.
- Keep the ~30ms-per-checkout git budget in mind: one `git status` + one `git log` per checkout, run concurrently.

## Review Focus

1. **File names with spaces or non-ASCII in git output** — the log must be read with `core.quotePath=false` and tab-split, so `two words.md` and `café.md` still get git times (test in Task 1).
2. **Git answers but its paths don't match the files on disk** (checkout isn't the repo top level, shallow history, gitignored doc) — the entry must fall back to mtime, never vanish or get `NaN`/0 (test in Task 2).
3. **The open spec is edited by an agent while you read it** — it should not light up as "updated" the moment you click elsewhere; the selected group is re-marked as opened on every list refresh (test in Task 6).
4. **A symlink inside a `docs/` folder pointing outside `~/Projects`** (or to a non-doc file) — must be refused, not served (test in Task 4).
5. **`localStorage` unavailable, throwing, or holding corrupt JSON** — the sidebar still renders, nothing is highlighted spuriously, nothing throws (test in Task 6).

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/server/gittimes.ts` | create | Parse `git log --name-status` into per-file created/updated; `gitTopLevel` |
| `src/lib/server/gitdirty.ts` | modify | Export `runGit`; `listDirtyDocs` takes a pathspec |
| `src/lib/server/discovery.ts` | modify | `GitView`, `readGitView`, `entryTimes`; `makeEntry`/`scanSpecs` use them; `entryRecency` deleted |
| `src/lib/types.ts` | modify | `SpecEntry.recency` → `created`, `updated`; optional `caption` |
| `src/lib/pairing.ts` | modify | `DisplayGroup` `created`/`updated`; `byCreatedDesc`, `soloGroup` |
| `src/lib/server/resolve.ts` | modify | Git-backed entries; absolute-path fallback to a loose `doc` entry |
| `src/lib/server/paths.ts` | modify | `assertDocPathShape`, `locateDoc` replace `assertSpecPath` |
| `src/routes/api/spec/+server.ts`, `src/routes/open/+server.ts` | modify | Use `locateDoc`; PUT removed |
| `src/lib/server/host.ts`, `src/hooks.server.ts` | create | Host-header guard |
| `src/lib/caption.ts` | modify | Prefer `entry.caption` |
| `src/lib/renderview.ts` | modify | Gains `noticeSummary(removed, problems)` |
| `src/lib/components/DocPane.svelte` | modify | Rendered view only |
| `src/lib/seen.ts` | create | Seen/closed state: first sight, open, close, hidden, highlighted, load/save/prune |
| `src/lib/sidebar.ts` | create (replaces `tabs.ts`, deleted in Task 7) | Visible group list + `SidebarEntry` view model |
| `src/lib/components/Sidebar.svelte` | create (replaces `TabStrip.svelte`) | Left column UI |
| `src/routes/+page.svelte` | modify | Wiring; editing state removed |
| delete | — | `Editor.svelte`, `TabStrip.svelte`, `inplace.ts`, `inplaceDom.ts`, `diffRange.ts`, `tabs.ts` and their tests; `EDITABLE_TAGS` in `subset.ts` |
| `static/spec.css`, `CLAUDE.md`, `README.md`, `package.json` | modify | Sans body font; docs; drop CodeMirror/lezer/parse5 deps |

---

### Task 1: Per-file git times from `git log`

**Files:**
- Create: `src/lib/server/gittimes.ts`, `src/lib/server/gittimes.test.ts`
- Modify: `src/lib/server/gitdirty.ts:11,52-66`, `src/lib/server/gitdirty.test.ts`

**Interfaces:**
- Consumes: `GitRunner` (`gitdirty.ts:9`), `SUPERPOWERS_SEGMENT` (`config.ts:5`).
- Produces:
  - `gitdirty.ts`: `export const runGit: GitRunner`; `listDirtyDocs(repoRoot: string, run: GitRunner = runGit, pathspec: string = SUPERPOWERS_SEGMENT): Promise<Set<string> | null>` (absolute paths, as today).
  - `gittimes.ts`: `export interface GitFileTimes { created: number; updated: number }` (ms); `parseNameStatusLog(raw: string): Map<string, GitFileTimes>` (keys repo-relative, as git prints them); `listDocTimes(repoRoot: string, pathspec: string = SUPERPOWERS_SEGMENT, run: GitRunner = runGit): Promise<Map<string, GitFileTimes> | null>` (keys `join(repoRoot, rel)`; null when git can't answer); `gitTopLevel(dir: string, run: GitRunner = runGit): Promise<string | null>` (trimmed `rev-parse --show-toplevel`).

- [ ] **Step 1: Write the failing tests** in `gittimes.test.ts` (`SOH = '\x01'`; log text is newest commit first, as git prints it):

```ts
const log = [
  `${SOH}300`, '', 'M\tdocs/superpowers/specs/a.md', 'R100\tdocs/superpowers/specs/old.md\tdocs/superpowers/specs/new.md',
  `${SOH}250`,                                   // merge commit: no files
  `${SOH}200`, '', 'A\tdocs/superpowers/specs/old.md', 'D\tdocs/superpowers/specs/gone.md',
  `${SOH}100`, '', 'A\tdocs/superpowers/specs/a.md', 'A\tdocs/superpowers/specs/gone.md',
  'A\tdocs/superpowers/specs/two words.md', 'A\tdocs/superpowers/specs/café.md'
].join('\n');

it('created is the adding commit, updated the last commit', () => {
  expect(parseNameStatusLog(log).get('docs/superpowers/specs/a.md')).toEqual({ created: 100_000, updated: 300_000 });
});
it('a rename keeps the original creation time', () => {
  const m = parseNameStatusLog(log);
  expect(m.get('docs/superpowers/specs/new.md')).toEqual({ created: 200_000, updated: 300_000 });
  expect(m.has('docs/superpowers/specs/old.md')).toBe(false);
});
it('drops deleted files', () => expect(parseNameStatusLog(log).has('docs/superpowers/specs/gone.md')).toBe(false));
it('keeps spaces and non-ASCII names intact', () => {
  const m = parseNameStatusLog(log);
  expect(m.get('docs/superpowers/specs/two words.md')?.created).toBe(100_000);
  expect(m.get('docs/superpowers/specs/café.md')?.created).toBe(100_000);
});
it('returns an empty map for empty output', () => expect(parseNameStatusLog('').size).toBe(0));
it('listDocTimes asks for an unquoted, rename-detecting name-status log of the pathspec', async () => {
  let args: string[] = [];
  await listDocTimes('/r', 'docs/x', async (_r, a) => ((args = a), ''));
  expect(args).toEqual(expect.arrayContaining(['-c', 'core.quotePath=false', 'log', '--name-status', '-M', '--format=%x01%ct']));
  expect(args.at(-1)).toBe('docs/x');
});
it('listDocTimes keys by absolute path', async () => {
  const m = await listDocTimes('/r', undefined, async () => `${SOH}5\n\nA\tdocs/superpowers/specs/a.md`);
  expect(m?.get('/r/docs/superpowers/specs/a.md')).toEqual({ created: 5000, updated: 5000 });
});
it('listDocTimes returns null when git cannot answer', async () => expect(await listDocTimes('/r', undefined, async () => null)).toBeNull());
it('gitTopLevel trims output and passes null through', async () => {
  expect(await gitTopLevel('/r/a', async () => '/r\n')).toBe('/r');
  expect(await gitTopLevel('/r/a', async () => null)).toBeNull();
});
```

In `gitdirty.test.ts` add: `listDirtyDocs passes a custom pathspec last` (`seen.at(-1) === 'docs/notes/x.md'`).

- [ ] **Step 2: Run** `npx vitest run src/lib/server/gittimes.test.ts src/lib/server/gitdirty.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** `listDocTimes` args, in order: `['-c', 'core.quotePath=false', 'log', '--format=%x01%ct', '--name-status', '-M', '--', pathspec]` (runGit prepends `-C repoRoot`). `parseNameStatusLog` algorithm (a body the tests don't fully pin):

```
chunks = raw.split('\x01') minus empties; each: first line = seconds, rest = tab-separated status lines
walk chunks oldest-first (reverse); t = seconds * 1000; skip a chunk whose seconds aren't finite
  status A or C<n> (path = last field): set { created: t, updated: t }
  status M or T:                      updated = t; created = existing ?? t
  status R<n> old new:                set new = { created: map(old)?.created ?? t, updated: t }; delete old
  status D:                           delete path
```

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** `feat(superspec): read per-file created/updated times from git log`.

---

### Task 2: Replace `recency` with `created`/`updated`

**Files:**
- Modify: `src/lib/types.ts:18-19`, `src/lib/server/discovery.ts:76-111,149-235`, `src/lib/pairing.ts`, `src/lib/server/resolve.ts`, `src/routes/+page.svelte:26-28`, `CLAUDE.md` (Recency + Pairing sections)
- Test: `src/lib/server/discovery.test.ts`, `src/lib/pairing.test.ts`, `src/lib/server/resolve.test.ts`; fixture helpers in `src/lib/openTabs.test.ts`, `src/lib/tabs.test.ts`, `src/lib/caption.test.ts` (swap `recency` for `created`/`updated`)

**Interfaces:**
- Consumes: Task 1 (`GitFileTimes`, `listDocTimes`, `listDirtyDocs`, `GitRunner`).
- Produces:
  - `SpecEntry`: `recency` removed; `created: number` (when the doc first appeared) and `updated: number` (when it last changed). `mtime` kept.
  - `discovery.ts`: `export interface GitView { dirty: Set<string> | null; times: Map<string, GitFileTimes> | null }`; `export const NO_GIT: GitView` (both null); `readGitView(repoRoot: string, pathspec: string = SUPERPOWERS_SEGMENT, run?: GitRunner): Promise<GitView>` (status and log concurrently); `entryTimes(i: { filename: string; mtime: number; birthtime: number; dirty: boolean | null; git: GitFileTimes | undefined }): { created: number; updated: number }`; `makeEntry(dir, filename, project, worktree, subdir, git: GitView = NO_GIT): Promise<SpecEntry>` (looks git maps up by `join(dir, filename)`). `entryRecency` deleted; `parseFilenameDateMs` kept as last resort.
  - `pairing.ts`: `DisplayGroup { parent; children; created: number; updated: number }` (`recency` removed); `byCreatedDesc(a: DisplayGroup, b: DisplayGroup): number` (created desc, then `parent.path` asc); `soloGroup(e: SpecEntry): DisplayGroup`.
  - `resolve.ts`: `resolveDoc(query: string, root: string = PROJECTS_ROOT, run?: GitRunner): Promise<DisplayGroup | null>`.

`entryTimes` rules (`dirty: null` means git couldn't answer for that checkout, i.e. `dirty` or `times` was null):

| case | created | updated |
|---|---|---|
| git unknown | mtime | mtime |
| dirty (modified or untracked) | `git?.created ?? birthtime` | mtime |
| clean | `git?.created ?? mtime` | `git?.updated ?? mtime` |

Any result ≤ 0 (e.g. Linux `birthtime` 0) falls back to mtime, then to `parseFilenameDateMs(filename)`.

- [ ] **Step 1: Write failing tests.**
  - `discovery.test.ts`: `entryTimes` table tests, one per row plus `birthtime 0 falls back to mtime`. Replace the `scanSpecs recency vs. checkout mtime` block with `scanSpecs times` using a fake runner that dispatches on `args.includes('log')` vs `args.includes('status')`:
    - `orders same-day committed specs by commit time, not name` — `2026-11-13-aaa-design.md` added at 100s, `2026-11-13-zzz-design.md` at 200s, clean → `list[0].filename` is the `zzz` one; `created` = 200_000.
    - `takes created from git and updated from mtime for a modified file`.
    - `uses birthtime as created for an untracked file` — status `?? …`, empty log → `created === (await stat(p)).birthtimeMs || mtime`.
    - `falls back to mtime when git paths don't match any file` (Review Focus 2) — log names `other/x.md` → both times equal the entry's `mtime`, entry still listed.
    - `uses mtime for both when git cannot answer` (runner → null).
    - Replace the old `recency takes the max…` / `sorted by recency` tests with `sorted by created descending`.
  - `pairing.test.ts`: entry helper takes `created`/`updated`; tests `group created is the spec's even when its plan is newer`, `group updated is the max over spec and plans`, `a plan update never reorders groups` (spec A created 10 with plan updated 999, spec B created 20 → B first), `equal created breaks by parent path`, `newest-created spec wins a slug collision`, `children sort by created desc`.
  - `resolve.test.ts`: the `dupe.md` test keeps passing with "newest = greatest `updated`" (tmp dirs aren't repos, so mtime).

- [ ] **Step 2: Run** `npx vitest run src/lib/server/discovery.test.ts src/lib/pairing.test.ts src/lib/server/resolve.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** `scanSpecs` replaces `dirtyByDir` with a `Map<dir, GitView>` from `readGitView(loc.checkout, SUPERPOWERS_SEGMENT, run)` and sorts `b.created - a.created || a.path.localeCompare(b.path)`. `pairAndGroup` indexes collisions by `created` (tie: `updated`), sorts children by `created` desc, groups with `byCreatedDesc`. `resolveDoc` adds `checkout` to `Candidate`, builds entries with one `readGitView` per distinct checkout among the candidates it materialises, picks the winner by greatest `updated`, and uses `soloGroup` for its two fallbacks. `+page.svelte` filters on `g.updated`. Update the fixture helpers in `openTabs.test.ts`, `tabs.test.ts`, `caption.test.ts`.

- [ ] **Step 4: Run** `npm test` then `npm run check` — Expected: all pass, 0 errors. Then `grep -rn "recency" src` — Expected: only `src/lib/recency.ts` (the `DAY_MS` module) and import lines of it.

- [ ] **Step 5: Measure.** With `npm run dev` running in the background: `time curl -s -H 'Host: 127.0.0.1:4510' http://127.0.0.1:4510/api/specs >/dev/null` three times; compare with the same on `main` (CLAUDE.md quotes ~2.6s). Expected: within ~1s of baseline. Record the numbers in the commit body.

- [ ] **Step 6: Update `CLAUDE.md`** — rewrite "Recency" as "Times": `created`/`updated`, the status+log pair per checkout, the table above, the rename rule, mtime fallback, the measured cost; in "Pairing" say groups carry `created`/`updated`, sort by `created`, window on `updated`.

- [ ] **Step 7: Commit** `fix(superspec): order docs by git creation time instead of filename date`.

---

### Task 3: Remove editing; sans body font

**Files:**
- Modify: `src/lib/components/DocPane.svelte`, `src/routes/+page.svelte`, `src/routes/api/spec/+server.ts:57-64`, `src/lib/renderview.ts`, `src/lib/renderview.test.ts`, `src/lib/subset.ts:36-53`, `static/spec.css:6,12`, `package.json`, `package-lock.json`, `CLAUDE.md`, `README.md`
- Delete: `src/lib/components/Editor.svelte`, `src/lib/inplace.ts`, `src/lib/inplace.test.ts`, `src/lib/inplaceDom.ts`, `src/lib/inplaceDom.test.ts`, `src/lib/diffRange.ts`, `src/lib/diffRange.test.ts`

**Interfaces:**
- Produces: `DocPane` props `{ path: string; content: string }`; `renderview.ts`: `noticeSummary(removed: readonly string[], problems: readonly string[]): string` (today's `inplaceDom.ts:237` without the `editingOff` argument, same wording and `NAMED_REMOVED_MAX`). `/api/spec` exports `GET` only. `+page.svelte` loses `saveStatus`, `saveTimer`, `readOnly`, `save`, `handleInput`, the save-status header text, the `isMainPath` import; keeps `knownMtime` and `pollExternalChange` (poll no longer checks `saveStatus`).

- [ ] **Step 1: Move the `noticeSummary` tests** from `inplaceDom.test.ts` into `renderview.test.ts`, dropping the `editingOff` cases and argument. Run `npx vitest run src/lib/renderview.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 2: Implement** `noticeSummary` in `renderview.ts`; run the same command — Expected: PASS.

- [ ] **Step 3: Strip DocPane** to the render effect (version guard, same-file scroll keep via `scrollratio`), the notices `<details>` (no editing-off items), and the `.spec-doc` container without input/keydown/paste/drop handlers. No view toggle, no `sessionStorage`. Strip `+page.svelte` as listed above and delete `PUT` from `api/spec/+server.ts` (drop `writeFile`, `isMainPath` imports).

- [ ] **Step 4: Delete** the seven files listed; remove `EDITABLE_TAGS` from `subset.ts`. Run `npm uninstall @codemirror/commands @codemirror/lang-html @codemirror/lang-markdown @codemirror/language @codemirror/language-data @codemirror/state @codemirror/view @lezer/highlight parse5`.

- [ ] **Step 5: Font.** In `static/spec.css` delete the `--serif` line and set `.spec-doc { font: 17px/1.6 var(--sans); }`.

- [ ] **Step 6: Confirm by search.** `grep -rnE "inplace|diffRange|Editor|codemirror|lezer|parse5|EDITABLE_TAGS|saveStatus|readOnly|handleInput|--serif|sr:view" src static package.json` — Expected: no output. (`data-sr-added` in `render.ts` stays: it marks heading anchors and `render.test.ts:21` pins it.)

- [ ] **Step 7: Run** `npm test`, `npm run check`, `npm run build` — Expected: pass, 0 errors, build succeeds.

- [ ] **Step 8: Docs.** `CLAUDE.md`: "reading and lightly editing" → "reading"; Endpoints `api/spec` GET only; Client paragraph: no autosave/Source/Editor, DocPane is rendered-only. `README.md` lines 3-6: same.

- [ ] **Step 9: Commit** `refactor(superspec)!: drop editing, source view and CodeMirror; sans body font`.

---

### Task 4: Open any project `docs/` file by absolute path

**Files:**
- Modify: `src/lib/server/paths.ts:12-24`, `src/lib/server/paths.test.ts`, `src/routes/api/spec/+server.ts`, `src/routes/open/+server.ts`, `src/lib/server/resolve.ts`, `src/lib/server/resolve.test.ts`, `src/lib/types.ts`, `src/lib/caption.ts`, `src/lib/caption.test.ts`, `CLAUDE.md` (Path safety, Endpoints)

**Interfaces:**
- Consumes: `readGitView`, `makeEntry`, `NO_GIT` (Task 2); `gitTopLevel` (Task 1); `isWorktreePath`, `mainEquivalent` (`mainpath.ts:8,21`); `MAX_WORKTREE_DEPTH` (`fswalk.ts:8`).
- Produces:
  - `paths.ts`: `assertDocPathShape(p: string, root: string = PROJECTS_ROOT): string` (sync, lexical; returns `resolve(p)`; throws `Error & { status: 400 }`); `locateDoc(p: string, root: string = PROJECTS_ROOT): Promise<{ path: string; real: string }>` (`path` = lexical path the client keys on, `real` = what to read; throws status 400 on bad shape, 404 when missing or not a regular file). `assertSpecPath` deleted.
  - `SpecEntry.caption?: string` — set only for loose docs; `captionFor` returns it when present.
  - `resolveDoc` returns a loose group for an absolute path that matches no candidate: `type: 'doc'`, `children: []`, `caption` = parent folder relative to the projects root (e.g. `proj/docs/notes`), `project` = first segment, `worktree` = the `<wt>` segments joined by `/` or null.

Shape rule (on `segs = relative(root, resolve(p)).split(sep)`; reject `..`-leading or empty): main = `segs[1] === 'docs'` and `segs.length >= 3`; worktree = `segs[1..2]` are `.claude`,`worktrees`, `k` = first index ≥ 4 with `segs[k] === 'docs'`, `1 <= k - 3 <= MAX_WORKTREE_DEPTH`, `k < segs.length - 1`. Plus `isSpecFile`. `locateDoc`: shape → `realpath(p)` and `realpath(root)` → shape again on the real path against the real root → `stat().isFile()`. If the file is missing and `isWorktreePath(p)`, retry once with `mainEquivalent(p)` and return that as `path`.

- [ ] **Step 1: Write failing tests.**
  - `paths.test.ts` (`assertDocPathShape`, pure strings): accepts `p/docs/x.md`, `p/docs/sub/y.html`, `p/docs/superpowers/specs/z.md`, `p/.claude/worktrees/wt/docs/x.md`, `p/.claude/worktrees/support/foo/docs/x.md`; rejects `p/README.md`, `p/src/docs/x.md`, `p/docs/x.txt`, `p/docs/x.htm`, `p/.claude/worktrees/a/b/c/d/docs/x.md` (depth 4), `p/.claude/worktrees/docs/x.md` (no wt), `/etc/passwd`, traversal `ROOT/../../etc/docs/x.md`. Keep the `assertAssetPath` tests unchanged.
  - `paths.test.ts` (`locateDoc`, `makeTree` + `symlink`): returns `{path, real}` for `p/docs/a.md`; `rejects a symlink in docs pointing outside the root` (400, Review Focus 4); `rejects a symlink in docs pointing at a .txt inside the root` (400); `404 for a directory named x.md`; `404 for a missing file`; `falls back to the main copy when the worktree copy is gone` (`path` is the main path).
  - `resolve.test.ts`: `opens an undiscovered absolute docs path as a loose doc` (`type 'doc'`, `caption 'projL/docs/notes'`, `children []`, `worktree null`); `a loose doc in a nested worktree records the worktree` (`support/foo`); `a bare name does not find a loose doc` (null); `an absolute path outside docs resolves to null`.
  - `caption.test.ts`: `uses an entry's own caption when set`.

- [ ] **Step 2: Run** `npx vitest run src/lib/server/paths.test.ts src/lib/server/resolve.test.ts src/lib/caption.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `assertDocPathShape`, `locateDoc`, the `caption` field and `captionFor` change.

- [ ] **Step 4: Implement the loose fallback** in `resolveDoc`: after the candidate and `mainEquivalent` passes, if `isAbsolute(q) && isSpecFile(q)`, `locateDoc(q, root)` (catch → null); `top = await gitTopLevel(dirname(real), run)`; `git = top ? await readGitView(top, relative(top, real), run) : NO_GIT`; `makeEntry(dirname(real), basename(real), …, 'doc'-subdir, git)` so git keys (real paths) match, then set `path`/`filename` back to the lexical path and add `caption`. (Builder's call: `type: 'doc'` via `typeLabel`'s passthrough of the subdir name.)

- [ ] **Step 5: Routes.** `GET /api/spec`: `const { path, real } = await locateDoc(raw)` (map thrown `status` to `error(status, message)`), read `real`, return `{ content, mtime, path }`; the inline main-fallback block goes (now inside `locateDoc`). `/open`: `await locateDoc(raw)` then redirect as today.

- [ ] **Step 6: Run** `npm test`, `npm run check` — Expected: pass, 0 errors. `grep -rn assertSpecPath src` — Expected: no output.

- [ ] **Step 7: Docs.** CLAUDE.md "Path safety": `locateDoc`/`assertDocPathShape`, the shape rule, realpath, read-only, asset route unchanged.

- [ ] **Step 8: Commit** `feat(superspec): open any project docs/ file by absolute path`.

---

### Task 5: Host-header guard

**Files:**
- Create: `src/lib/server/host.ts`, `src/lib/server/host.test.ts`, `src/hooks.server.ts`
- Modify: `CLAUDE.md` (Path safety)

**Interfaces:**
- Produces: `ALLOWED_HOSTS: readonly string[]` = `['127.0.0.1:4510', 'localhost:4510']`; `isAllowedHost(host: string | null): boolean` (exact match after lower-casing); `hooks.server.ts` `export const handle: Handle` returning `new Response('Forbidden host', { status: 403 })` when `!isAllowedHost(event.request.headers.get('host'))`, else `resolve(event)`.

- [ ] **Step 1: Write failing tests**: accepts `127.0.0.1:4510`, `localhost:4510`, `LOCALHOST:4510`; rejects `null`, `''`, `127.0.0.1`, `localhost`, `127.0.0.1:4511`, `evil.example:4510`, `127.0.0.1:4510.evil.example`, `[::1]:4510`.
- [ ] **Step 2: Run** `npx vitest run src/lib/server/host.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `host.ts` and `hooks.server.ts`.
- [ ] **Step 4: Run** the test — PASS; `npm run check` — 0 errors.
- [ ] **Step 5: Verify live.** Start `npm run dev` in the background, then `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4510/api/specs` → `200`; same with `-H 'Host: evil.example:4510'` → `403`; `http://localhost:4510/api/specs` → `200`. Stop the server.
- [ ] **Step 6: Docs + commit.** One CLAUDE.md line (DNS-rebinding defence, the two hosts; a port change needs `host.ts` too). Commit `feat(superspec): reject requests with an unexpected Host header`.

---

### Task 6: Sidebar model — seen/closed state and entry list

**Files:**
- Create: `src/lib/seen.ts`, `src/lib/seen.test.ts`, `src/lib/sidebar.ts`, `src/lib/sidebar.test.ts` (port the `planLabel`/plan-link cases from `tabs.test.ts`; `tabs.ts` itself is deleted in Task 7 with its last consumer)

**Interfaces:**
- Consumes: `DisplayGroup`, `byCreatedDesc` (Task 2); `captionFor` (Task 4); `DAY_MS`.
- Produces:
  - `seen.ts`: `interface SeenState { seen: Record<string, number>; closed: Record<string, number> }` keyed by group parent path; `SEEN_KEY = 'sr:seen'`, `CLOSED_KEY = 'sr:closed'`; `loadSeenState(storage: Pick<Storage, 'getItem'> | null): SeenState`; `saveSeenState(storage: Pick<Storage, 'setItem'> | null, s: SeenState): void`; `pruneSeenState(s: SeenState, now: number): SeenState`; `recordFirstSight(groups: DisplayGroup[], s: SeenState, pageLoadedAt: number, now: number): SeenState`; `markOpened(s: SeenState, groupPath: string, now: number): SeenState`; `markClosed(s: SeenState, groupPath: string, now: number): SeenState`; `isHidden(g: DisplayGroup, s: SeenState): boolean`; `isHighlighted(g: DisplayGroup, s: SeenState): boolean`. All state functions are pure and return the *same object* when nothing changed (so a `$effect` can compare by reference and not loop).
  - `sidebar.ts`: `planLabel(i: number): string` (unchanged wording); `interface PlanLink { label: string; path: string; boxed: boolean }`; `interface SidebarEntry { title: string; caption: string; path: string; active: boolean; highlighted: boolean; plans: PlanLink[] }`; `listGroups(discovered: DisplayGroup[], opened: DisplayGroup[], s: SeenState, now: number): DisplayGroup[]` (discovered with `updated >= now - DAY_MS` and not hidden, plus opened groups whose parent path isn't among those, sorted `byCreatedDesc`); `buildEntries(groups: DisplayGroup[], selectedPath: string | null, s: SeenState): SidebarEntry[]`.

Semantics: `recordFirstSight` adds only paths with no `seen` record: `now` when `g.created <= pageLoadedAt`, else `g.created - 1` (a real timestamp, so it prunes normally, and highlighted because `updated >= created`). `isHighlighted` = `s.seen[path] !== undefined && g.updated > s.seen[path]`. `markOpened` sets `seen[path] = now` and deletes `closed[path]`. `isHidden` = `closed[path] !== undefined && g.updated <= closed[path]`. `pruneSeenState` drops `closed` older than `DAY_MS` (a visible group is always newer, so it would be unhidden anyway) and `seen` older than 30 days (builder's call: bounds storage; a spec untouched for 30 days is out of the window). `buildEntries`: `highlighted = !active && isHighlighted(g, s)`; `active` / `boxed` as `tabs.ts:28-42`.

- [ ] **Step 1: Write failing tests.**
  - `seen.test.ts`: `first sight before page load is recorded as seen now, not highlighted`; `a doc created after page load starts highlighted`; `first sight never overwrites an existing record`; `returns the same object when nothing is new`; `markOpened clears the highlight and any close`; `isHidden while updated <= closedAt, visible once updated passes it`; `loadSeenState returns empty for corrupt JSON, wrong shapes, a throwing getItem, and null storage` (Review Focus 5); `saveSeenState swallows a throwing setItem`; `prune drops closes older than a day and seen records older than 30 days`.
  - `sidebar.test.ts`: `sorts by created desc, ties by path`; `drops discovered groups not updated within 24h`; `drops hidden groups until updated passes the close`; `keeps opened groups not shown by discovery and dedupes the rest`; `opened groups sort in with discovered ones by created`; `the active entry is never highlighted` and, for Review Focus 3, `re-marking the selected group on refresh keeps it unhighlighted after deselect` (updated bumps, `markOpened` at refresh time, then `buildEntries(…, null, s)` → `highlighted false`); `plan links are labelled plan, plan 2 and boxed when open`; `caption comes from captionFor`.
- [ ] **Step 2: Run** `npx vitest run src/lib/seen.test.ts src/lib/sidebar.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** the two tests — PASS; `npm run check` — 0 errors.
- [ ] **Step 5: Commit** `feat(superspec): sidebar model with seen and closed state`.

---

### Task 7: Sidebar component and page wiring

**Files:**
- Create: `src/lib/components/Sidebar.svelte`
- Delete: `src/lib/components/TabStrip.svelte`, `src/lib/tabs.ts`, `src/lib/tabs.test.ts`
- Modify: `src/routes/+page.svelte`, `CLAUDE.md` (Client section)

**Interfaces:**
- Consumes: Task 6 (`listGroups`, `buildEntries`, `SidebarEntry`, `seen.ts` functions); `pairAndGroup`, `findSelectedGroup`, `groupToPromote` (`openTabs.ts`).
- Produces: `Sidebar` props `{ entries: SidebarEntry[]; onSelect: (path: string) => void; onPick: (query: string) => Promise<boolean>; onClose: (path: string) => void }`.

Builder's calls: fixed width `w-72` (18rem), not resizable — the old width persistence was removed with the old sidebar in `8910062`, so there's nothing cheap to reuse; highlight = `border-l-2 border-blue-500` plus a small blue dot before the title; selected = `bg-neutral-800` with `aria-current="page"`; titles clamp to two lines with the full title in `title=`.

- [ ] **Step 1: Build `Sidebar.svelte`.** `<aside>` full height, `w-72 shrink-0 flex flex-col border-r border-neutral-800 bg-neutral-950`; the "choose a doc" input (label, placeholder `doc name or path`, Enter → `onPick`, clear, shake on failure — carried over from `TabStrip.svelte:23-41` with its `.shake` styling) pinned at the top (`shrink-0`); below it a `flex-1 overflow-y-auto` list. Each entry: title button (`onSelect(entry.path)`), `×` button (`aria-label="Close"`, `onClose(entry.path)`) on every entry, caption, plan links (boxed when open).

- [ ] **Step 2: Wire `+page.svelte`.**
  - `const pageLoadedAt = Date.now()`; `let seenState = $state(pruneSeenState(loadSeenState(storageOrNull()), Date.now()))`, where `storageOrNull` returns `localStorage` or null inside try/catch; a `persistSeen(next)` helper assigns and calls `saveSeenState` only when `next !== seenState`.
  - `discovered = $derived(pairAndGroup(specs))`; `groups = $derived(listGroups(discovered, openedGroups, seenState, Date.now()))` replaces `tabGroups`; `entries = $derived(buildEntries(groups, selectedPath, seenState))`.
  - Effect on `specs` (when `specsLoaded`): `recordFirstSight(discovered, …, pageLoadedAt, Date.now())`, then if a doc is selected, `markOpened` its group's parent path (`findSelectedGroup([...discovered, ...openedGroups], selectedPath)?.parent.path ?? selectedPath`).
  - `selectSpec` on success: the same `markOpened` for the effective path.
  - `pickDoc`: unchanged except it checks `groups` for `known`.
  - `closeEntry(path)` replaces `closeOpened`: remove from `openedGroups` if present (persist); `markClosed` if `discovered` contains it; clear the selection when the selected path is the parent or one of its plans (as `closeOpened` does today, minus `saveStatus`/`readOnly`).
  - Retention effect keeps using `findSelectedGroup`/`groupToPromote`, against `groups`.
  - Layout: `<div class="flex h-screen bg-neutral-900 text-neutral-200"><Sidebar …/><main class="flex min-w-0 flex-1 flex-col overflow-hidden">…</main></div>`; path header stays; empty text `No specs in the last 24 hours.` keyed on `groups.length === 0`.
- [ ] **Step 3: Delete `TabStrip.svelte`, `tabs.ts`, `tabs.test.ts`.** `grep -rnE "TabStrip|buildTabs|tabGroups|closeOpened|\\\$lib/tabs" src` — Expected: no output.
- [ ] **Step 4: Run** `npm test`, `npm run check`, `npm run build` — Expected: all pass, 0 errors, build succeeds.
- [ ] **Step 5: Smoke test in the browser** (`npm run dev`, open `http://127.0.0.1:4510`, or use the `run` skill). Check each and note results in the commit body:
  1. Newest-created spec is on top; today's specs are not alphabetical.
  2. Long list scrolls vertically; the input stays visible.
  3. `touch` + edit a listed spec's plan in a worktree (append a line) → its entry highlights without moving; clicking it clears the highlight.
  4. × on a discovered entry hides it; editing that spec brings it back highlighted.
  5. × on the open entry clears the pane.
  6. Pasting `/Users/…/Projects/super/.claude/worktrees/superspec-sidebar/docs/spec-format.md` opens it, caption `super/.claude/worktrees/superspec-sidebar/docs`; reload keeps it; × removes it.
  7. No Source toggle, no save text; body text is sans.
  8. Reloading the page doesn't light up the whole list.
- [ ] **Step 6: Docs.** CLAUDE.md Client paragraph: `Sidebar.svelte`, `sidebar.ts`/`seen.ts`, `sr:seen`/`sr:closed`, highlight and close rules, ordering by `created`, window on `updated`; remove the stale "persists … sidebar width" claim.
- [ ] **Step 7: Commit** `feat(superspec): left sidebar ordered by creation with update highlight and close`.

---

## Open questions

None blocking. One judgement settled here that the user may want to revisit: a loose doc's caption is its parent folder relative to `~/Projects` (e.g. `super/docs` or `super/.claude/worktrees/x/docs/notes`); the spec says only "its parent folder".
