# Live List via FS Events + Persisted Selection

## Context

The sidebar currently fetches `/api/specs` once on mount and never refreshes, so a spec
created/edited/removed elsewhere (e.g. an agent writing a new spec in a worktree) doesn't appear
until the user reloads the page. The open file already self-updates via a 3s mtime poll, but the
*list* is static.

This round adds **live list updates** driven by a server-side filesystem watcher pushed to the
browser over Server-Sent Events (SSE), and **persists the chosen file** so reopening the app
restores the last-viewed spec. The existing 3s open-file content poll is intentionally left in
place (we'll revisit retiring it once the watcher is proven).

The app runs as a single long-lived `adapter-node` process (and a single Node process under Vite
in dev), so a module-level watcher is a clean fit. The user is on macOS, where
`fs.watch(dir, { recursive: true })` uses FSEvents efficiently — no watch dependency needed.

## 1. Watcher (`src/lib/server/watcher.ts`)

- A single `fs.watch(PROJECTS_ROOT, { recursive: true })`.
- A pure, exported predicate **`isRelevantChange(relPath: string | null): boolean`** — `true` when
  the path contains `docs/superpowers/` and ends in `.md`; also returns `true` for `null`
  (`fs.watch` occasionally emits a null filename → treat conservatively as "something changed").
  This filters out `node_modules`/`.git`/build churn.
- **Debounce ~300ms**: a burst (git checkout, branch switch) collapses into one notification.
- **Singleton** stored on `globalThis` with a subscriber `Set`, plus a dev-HMR guard so Vite
  hot-reloads reuse (not duplicate) the watcher. The watch starts lazily on the first subscriber.
- API: `subscribe(cb: () => void): () => void` (returns an unsubscribe fn) and an internal
  `ensureWatching()`.
- **Failure handling:** if `fs.watch` throws (unsupported FS), log once and no-op — subscribers
  simply never fire; the app degrades to "reload to refresh" rather than crashing.

## 2. SSE endpoint (`src/routes/api/events/+server.ts`)

- `GET` returns a `text/event-stream` `ReadableStream` (headers: `content-type: text/event-stream`,
  `cache-control: no-store`, `connection: keep-alive`).
- On open: `subscribe()` a callback that enqueues `data: changed\n\n` on each watcher notification.
- A ~30s heartbeat comment (`: ping\n\n`) keeps the connection alive through proxies/idle.
- On request abort / stream cancel: unsubscribe and clear the heartbeat interval.

## 3. Client (`src/routes/+page.svelte`)

- `onMount`: open `new EventSource('/api/events')`; on each `message`, call `loadSpecs()` to
  refresh the list. `EventSource` auto-reconnects on drop. Close it in the unmount cleanup
  (alongside the existing interval clear).
- Re-fetching recomputes `visible = withinWindow(specs, Date.now())`, so the 24h window also
  refreshes on every fs event. (A fully-idle tab with zero fs activity still wouldn't re-tick; a
  60s timer remains an optional later add-on, out of scope here.)
- Selection/editor are untouched by list updates: if the open file vanishes from the list, its
  already-loaded content stays in the editor; only the sidebar changes.

## 4. Persisted selection (`src/routes/+page.svelte`)

- On a successful `selectSpec(path)`, store the path in `localStorage` key **`sr:selectedPath`**.
- On `onMount`, resolve the file to open with precedence: **`?path=` query (deep-link) → else
  stored `sr:selectedPath`**. A deep-link always wins and overwrites the stored value.
- If the restored path fails to load (`GET /api/spec` 404 — file deleted/moved), clear
  `sr:selectedPath` and fall back to the empty "Select a spec." state. No crash. (This requires
  `selectSpec` to handle a non-OK response gracefully rather than assuming success.)
- `localStorage` survives both a page reload and a server restart, satisfying "the chosen file
  survives a restart."

## 5. Edge cases

- **Multiple tabs:** each gets its own SSE subscriber; the single watcher fans out to all.
- **Watcher start failure:** SSE still connects and just sends nothing (degrade gracefully).
- **Selected file deleted while open:** content remains in the editor; the item disappears from
  the sidebar on the next refresh; stored selection is only cleared if a later reload fails to
  load it.

## 6. Testing & Verification

- **Unit (Vitest):**
  - `isRelevantChange`: matches `…/docs/superpowers/specs/x.md` and `…/plans/x.md`; rejects
    `node_modules/...`, `.git/...`, and non-`.md` paths; returns `true` for `null`.
  - Debounce coalescing: multiple rapid notifications collapse to a single subscriber call (fake
    timers).
- **Manual end-to-end (real browser):**
  - Run the app; in another terminal create a new `…/docs/superpowers/specs/2026-…-x.md` → it
    appears in the sidebar within ~300ms without reload; edit it → title/order updates; delete it
    → it disappears.
  - Add a spec inside a worktree → appears (worktree-tagged).
  - `git checkout` in a project → a single coalesced refresh, no event spam.
  - Select a spec, reload the page → the same spec reopens (persisted). Stop and restart the
    server, reload → still reopens. Delete the persisted spec then reload → falls back to empty
    state, no error.
  - A `?path=` deep-link still wins over the persisted selection.

## Out of Scope (future)

- Retiring the 3s open-file content poll in favor of fs events (deferred; decide after the
  watcher is proven).
- A periodic clock tick to age items out of the 24h list with zero fs activity.
- launchd / permanent auto-start.
