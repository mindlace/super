# superspec: read-only sidebar reader

## Why

superspec is now mostly used to review the newest spec an agent has asked about. The tab strip has outgrown that job: with ~16 docs a day it scrolls sideways, hiding the "choose a doc" box, and the order is meaningless (every committed doc ties at midnight on its filename date, so the strip is really alphabetical). Editing and the Source view aren't used. Plans are mostly approved without reading; the plan link is there to show that implementation has started and to check on it if things go sideways.

## Goals

- Newest spec, by creation date, at the top of a left sidebar, always visible.
- Anything that changed since you last opened it is marked until you click it.
- Every entry can be closed.
- "Choose a doc" is always reachable.
- Body text in a sans face, not the current serif.

## Non-goals

- Editing of any kind (in-place HTML editing, autosave, Source view, CodeMirror). Dropped for now; git keeps the code if it comes back.
- Reordering on plan activity. A plan landing never moves its spec.

## Design

### Times (server, `discovery.ts` / `gitdirty.ts`)

Each entry gets two times instead of the single `recency`:

- **created**: when the doc first appeared. For a committed file, the commit that added it (`git log --diff-filter=A`). For an uncommitted new file, its birth time (a checkout can't have stamped a file git doesn't track).
- **updated**: when the doc last changed. Uncommitted changes → mtime. Otherwise the file's last commit time.

Both come from one `git log --name-status --format=%ct -- docs/superpowers` per checkout, replacing the filename-date fallback. If git can't answer, fall back to mtime for both (today's behaviour). Filename dates are used only when neither git nor the filesystem gives a usable time.

A group's **created** is its spec's created time (or the standalone doc's). A group's **updated** is the latest updated time across the spec and its plans. The 24h window uses **updated**, so a spec stays listed while its plan is active.

### Sidebar (client, replaces `TabStrip.svelte`)

```
┌──────────────────────┬───────────────────────────────────┐
│ [doc name or path  ] │                                   │
│──────────────────────│                                   │
│ ● HTML spec writers ×│   rendered spec                   │
│   html-spec-writers  │                                   │
│   · super      plan  │                                   │
│ World score: from…  ×│                                   │
│   sim-step-engine    │                                   │
│   · sfhousing  plan  │                                   │
│ …                    │                                   │
└──────────────────────┴───────────────────────────────────┘
```

- Fixed-width left column that scrolls vertically, with the "choose a doc" input pinned at its top.
- Entries sorted by group **created**, newest first. Ties (same second) break by path for a stable order.
- Each entry: title, the existing caption (worktree · project), and plan links as today (boxed when that plan is open).
- The open entry is shown as selected.
- **Updated highlight**: an entry is highlighted when its group **updated** is later than the time you last opened that entry or one of its plans. Opening it clears the highlight. "Last opened" times live in `localStorage`, keyed by spec path. An entry seen for the first time is recorded as seen at that moment, unless it was created after the page loaded, in which case it starts highlighted. So installing this doesn't light up the whole list, and genuinely new docs do get noticed.
- **Close (×)** on every entry. Closing a discovered entry hides it until its group's **updated** moves past the close time; closing a hand-opened entry removes it, as today. Hidden paths and their close times are persisted in `localStorage`.

### Opening any file by absolute path

"Choose a doc" also accepts an absolute path to any `.md` or `.html` file on disk, not just files under `~/Projects/*/docs/superpowers/`. Name and partial-path lookups keep searching the discovered docs as today; an absolute path that isn't one of them opens directly.

- The read guard (`assertSpecPath`, used by `GET /api/spec` and `/open`) splits in two. Paths inside the search roots keep today's rules. An absolute path outside them must exist, be a regular file, and end in `.md` or `.html`. That's acceptable only because the app no longer writes anything; nothing can be written through either guard.
- Because reads now reach the whole disk, the server rejects requests whose `Host` header isn't `127.0.0.1:4510` or `localhost:4510`. Otherwise a web page could use DNS rebinding to read local files through superspec.
- Such a file opens as a hand-opened entry. Its caption is its parent folder, it has no plans, and it's persisted, reloaded on outside changes and closeable like any other hand-opened entry. Its times come from git if it's in a repo, otherwise from the filesystem.
- Its relative images and other assets are **not** served; the asset route stays limited to `docs/superpowers/<type>/assets/`.

### Document pane

- `DocPane` shows only the rendered view; the Rendered/Source toggle, in-place editing, `Editor.svelte`, autosave and the save-status text are removed. The path header stays.
- External changes still reload the open doc (the 3s poll and the toast).
- `PUT /api/spec` and the in-place modules (`inplace*.ts`, `diffRange.ts` if only they use it) are deleted along with their tests.
- `static/spec.css`: the body font becomes the sans stack the headings already use; the `--serif` variable goes.

## Builder's calls

- Sidebar width (around 18rem) and highlight colour (a blue accent bar or dot that fits the existing neutral/blue palette).
- Whether the sidebar is resizable. The old sidebar-width persistence can be reused if that's cheap; otherwise fixed.
- Exactly which now-unused modules to delete; confirm with a search before removing.
