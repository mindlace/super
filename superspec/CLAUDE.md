# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`superspec` is a **local-only** SvelteKit app for reading and lightly editing superpowers spec/plan markdown files across all projects under `~/Projects/`. It runs on `127.0.0.1:4510`, reads/writes the real filesystem via the Node adapter, and is not deployed anywhere (no Cloudflare, no D1 — unlike the other projects in this workspace).

## Commands

Run all commands from `superspec/`. The app's own specs and plans live in `../docs/superpowers/`.

```bash
npm run dev      # Vite dev server (port 4510, host 127.0.0.1)
npm run build    # build with @sveltejs/adapter-node → ./build
npm start        # run the built server: PORT=4510 HOST=127.0.0.1 node build
npm test         # vitest run (all src/**/*.test.ts)
npm run check    # svelte-check type checking
```

Run a single test file: `npx vitest run src/lib/pairing.test.ts`
Watch one file: `npx vitest src/lib/server/discovery.test.ts`

Node engine is pinned (`engine-strict=true`); use a current Node 22+.

## Architecture

The app is a thin client over server endpoints that walk the filesystem. The client renders `ssr = false` (`src/routes/+page.ts`) — everything happens in the browser against the local API.

**Discovery (the core logic) — `src/lib/server/discovery.ts`:**
`scanSpecs()` walks `~/Projects/*/.claude/worktrees/**/docs/superpowers/*/` — *every* immediate subdir, so `observations/` and `evidence/` are listed too, not just `specs/` and `plans/`. Worktrees are *not* always direct children of `.claude/worktrees/` — a slashed branch name (`support/foo`) nests one level deeper — so `listWorktrees()` descends until it hits a dir holding a `.git` link or a superpowers dir, and the `worktree` field carries the whole relative name (`support/foo`). The key rule: **only worktree specs are listed.** Specs in a project's *main* checkout (`~/Projects/<proj>/docs/superpowers/`) are recorded into a `mainSet` but never shown — and a worktree spec is suppressed once an identically-named file appears on main (i.e. the work landed).

**Times — `entryTimes()` + `src/lib/server/gitdirty.ts` + `gittimes.ts`:**
Each `SpecEntry` carries `created` (when the doc first appeared) and `updated` (when it last changed). **mtime alone cannot be trusted**: `git worktree add` stamps every file with the checkout time, and a filename date is only a day, so same-day docs used to tie and sort alphabetically. So `scanSpecs()` runs one `git status` (dirty set, `gitdirty.ts`) and one `git log --name-status -M` (per-file commit times, `gittimes.ts`) per checkout, concurrently (`readGitView`), and `entryTimes` combines them (`dirty: null` = git couldn't answer):

| case | created | updated |
|---|---|---|
| git unknown | mtime | mtime |
| dirty (modified or untracked) | `git?.created ?? birthtime` | mtime |
| clean | `git?.created ?? mtime` | `git?.updated ?? mtime` |

`created` is the file's first add in history; a rename (`-M`) carries the origin's creation time, deleted files are dropped. Any result <= 0 (e.g. Linux `birthtime` 0) falls back to mtime, then to the filename date (`parseFilenameDateMs`). Git paths that match no file on disk just mean mtime for that file. Entries sort by `created` desc, then path. Measured cost on `~/Projects` (dev server, `/api/specs`): ~0.22s warm vs ~0.09s before the log was added.

**Pairing — `src/lib/pairing.ts`:**
`pairAndGroup()` nests `plan` entries under their matching `spec` entry to form `DisplayGroup`s. Matching is by normalized slug (date prefix, `.md`, and `-design` suffix stripped) scoped to the same project, with a title-equality fallback — also project-scoped. Groups carry `created` (the parent's, so a plan edit never reorders the list) and `updated` (max over parent and children). Groups sort by `created` desc (`byCreatedDesc`); on slug collisions the newest-created spec wins. The UI filters groups to `updated >= now - 24h` (`src/lib/recency.ts`, `DAY_MS`).

**Live updates — `src/lib/server/watcher.ts` + `src/routes/api/events/+server.ts`:**
A set of ~115 **non-recursive** `fs.watch` handles feeds a debounced hub (300ms). Targets come from `listWatchTargets()` (`src/lib/server/watchtargets.ts`) — the root, each `.claude/worktrees` container, and each `docs/superpowers` dir plus its `specs`/`plans` leaves — enumerated from the same `listSuperpowersLocations()` that `scanSpecs()` uses, so the watcher and scanner cannot drift apart. `createWatchRegistry` (`watcher.ts`) diffs that set on each reconcile, which runs after every flush and on a 30s `.unref()`'d interval; that is how new projects and worktrees get picked up. **Never watch `PROJECTS_ROOT` recursively** — it is ~127GB, and doing so floods macOS `fseventsd` with events that are then discarded. The hub and registry are stored on `globalThis` so Vite HMR reuses rather than duplicates them. `/api/events` is an SSE stream; on any relevant `.md` change under `docs/superpowers/` the client re-fetches `/api/specs`. The client *also* polls the open file every 3s (`pollExternalChange`) to detect external edits and reload.

**Path safety — `src/lib/server/paths.ts`:**
Every read/write path goes through `assertSpecPath()`, which rejects anything outside `PROJECTS_ROOT`, not inside a `docs/superpowers/` segment, or not ending in `.md`. All endpoints touching the filesystem (`/api/spec`, `/open`) must use it.

**Endpoints — `src/routes/`:**
- `api/specs` GET → `scanSpecs()` list
- `api/spec` GET/PUT → read/write one file by `?path=`; PUT returns new mtime for the autosave/conflict flow
- `api/events` GET → SSE change stream
- `open` GET → validates `?path=` then 302-redirects to `/?path=…` (the agent deep-link entry point)

**Client — `src/routes/+page.svelte`:**
Owns all state (Svelte 5 runes). Autosave debounces 1s after input; tracks `knownMtime` to reconcile against on-disk changes; persists selected path and sidebar width to `localStorage`. A single `DocPane` shows the open file with a Rendered/Source toggle (no side-by-side preview). `Editor.svelte` is a source-only CodeMirror 6 editor in markdown or HTML mode, used by the Source view. `render.ts` renders `.md` via `marked` + `DOMPurify` and `.html` specs (a semantic-HTML subset, see `../docs/spec-format.md`) via `renderSpecHtml`. `.html` specs in a worktree are also editable in place in the rendered view; `.md` files are rendered and source-edited only.

## Conventions

- Config constants (`PROJECTS_ROOT`, `SUPERPOWERS_SEGMENT`) live in `src/lib/server/config.ts` — change roots there, not inline.
- Tests are colocated (`*.test.ts`) and pure-unit: discovery/pairing/paths/watcher are written to be testable against a passed-in `root` or plain inputs rather than mocking the FS globally.
- Svelte 5 runes (`$state`, `$derived`), 2-space indent, single quotes.
- Specs/plans this app's own work generates live in `../docs/superpowers/{specs,plans}/`.
