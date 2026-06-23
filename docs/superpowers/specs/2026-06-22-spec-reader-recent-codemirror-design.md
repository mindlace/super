# spec_reader — Flat Recent View + CodeMirror Editor

## Context

The first version of spec_reader (see `2026-06-22-spec-reader-design.md`) shipped and works: it
lists specs per project in a dark split-pane (raw markdown + rendered preview) with synced
scrolling, autosave, and an `/open` deep-link.

Real use clarified the actual mental model and surfaced three changes. The tool is **"a view of
my workspace's superpowers docs for reading and small edits"** — a virtual flat folder that is
the union of every `~/Projects/**/docs/superpowers/*/*.md`, with where each file comes from
(project / worktree / subdir) used only as display metadata. The dominant use case is **"what
have I been working on in the last 24 hours"**; older docs are out of scope for now (a
filter-search will come later).

This round: (1) replace project grouping with a flat, recency-ordered, last-24h list whose items
show the document's own title; (2) swap the panes so the preview is on the left and the editor on
the right; (3) replace the raw `<textarea>` with a CodeMirror 6 editor that syntax-highlights
markdown.

## 1. Discovery → flat list (server)

`scanSpecs` changes from returning `ProjectGroup[]` to a **flat `SpecEntry[]`**, broadened to all
subdirectories under `docs/superpowers`:

- **Glob:** `~/Projects/*/docs/superpowers/*/*.md` (main) and
  `~/Projects/*/.claude/worktrees/*/docs/superpowers/*/*.md` (worktrees). The subdir (`specs`,
  `plans`, or any future one) is captured, not hardcoded.
- **Worktree-unique dedup stays** (without it, every worktree re-lists all of main): a worktree
  file is included only if its `(subdir, filename)` pair is NOT present on the project's main
  branch. All main files are included.

Each `SpecEntry` carries:

| Field | Meaning |
| --- | --- |
| `path` | absolute path on disk |
| `filename` | basename |
| `title` | first markdown heading in the file (`#`/`##`… stripped, trimmed); fallback to first non-empty line; final fallback to `filename` |
| `project` | project directory name |
| `worktree` | worktree name, or `null` if the file is on main |
| `type` | subdir name mapped for display: `specs`→`spec`, `plans`→`plan`, otherwise the raw subdir name |
| `mtime` | file mtime in ms (from `stat`) |
| `recency` | `max(mtime, filenameDateMs)` — the `YYYY-MM-DD[-HHMM]` filename prefix parsed to ms, whichever is newer |

Title extraction reads each file (specs are small). The result list is sorted by `recency`
descending. `recency` is used for ordering and the 24h window only — **dates are never displayed.**

`SPECS_SEGMENT`/discovery internals generalize from the fixed `docs/superpowers/specs` to
`docs/superpowers/<subdir>`; path validation (below) widens correspondingly.

## 2. Sidebar: flat, recency-ordered, last 24h

**No grouping.** A single flat list:

- Filtered to the **last 24 hours** by a pure, unit-tested helper
  `withinWindow(specs, nowMs, windowMs = 24h)` → `SpecEntry[]` (keeps entries with
  `recency >= nowMs - windowMs`). Nothing older is shown.
- Ordered by `recency` descending (already sorted by the server; the helper preserves order).

Each list item renders:

- the **title** (prominent), shown **in full** — it wraps onto multiple lines as needed and is
  never truncated or ellipsized, and
- a small muted caption beneath it (furigana-style): `project · worktree · type`
  (e.g. *planafoot · recurrence-ai · spec*). Main-branch items omit the worktree segment
  (*planafoot · spec*).

Selection is still by `path`. No dates appear anywhere in the UI.

### Resizable width

The sidebar (title list) is **resizable**: a draggable vertical divider between the sidebar and
the main split-pane lets the user widen or narrow the list. The chosen width is **persisted to
`localStorage`** so it survives reloads, with a sensible default (~20rem) and clamped to a
reasonable min/max so the sidebar can't be dragged to zero or swallow the editor. This replaces
the current fixed `grid-cols-[20rem_1fr]` layout.

## 3. Editor: preview left, CodeMirror right

- **Layout swap & asymmetric split:** the rendered preview moves to the **left** column, the
  editor to the **right**. The split is **not** 50/50: raw markdown reads best at a fixed,
  bounded width, while the rendered preview benefits from more room. So the editor column is
  **capped at a maximum width** (default ~`48rem`, tunable) and the **preview absorbs all surplus
  horizontal space** once the editor hits that cap. On narrower viewports the two share space down
  to a sensible editor **min width** (~`22rem`) before the editor stops shrinking. (Implementation:
  flex layout — preview `flex-1`; editor `flex-1` with `max-width`/`min-width` — rather than a
  fixed two-column grid.) CodeMirror **line-wrapping is on**, so long lines wrap within the capped
  width instead of scrolling horizontally.
- **CodeMirror 6** replaces the `<textarea>`: an `EditorView` mounted into a div, with
  `@codemirror/lang-markdown` for highlighting and a **dark theme matching the app**
  (`EditorView.theme` over a neutral-900 background, not the default one-dark grey).
- **Autosave:** an `updateListener` fires the existing `onInput(doc)` on user edits → the current
  debounced PUT/`saveStatus` flow is unchanged.
- **External content changes** (selecting a spec, external-change reload): when the `content` prop
  changes and differs from the view's current doc, dispatch a transaction to replace the doc, so
  reloads/selections update the editor without disturbing the cursor mid-type.
- **Scroll-sync preserved:** the bidirectional scroll-percentage sync is wired to the editor's
  `view.scrollDOM` (`.cm-scroller`) ↔ the preview div, replacing the old textarea scroll handler.

`renderMarkdown` (marked + DOMPurify), the debounced autosave, the mtime poll + reload toast, and
the `/open` deep-link are all unchanged.

## 4. API

- `GET /api/specs` → flat `SpecEntry[]`, recency-sorted (replaces the previous `ProjectGroup[]`).
- `GET /api/spec?path=…`, `PUT /api/spec?path=…`, `GET /open?path=…` — unchanged.
- **Path validation** widens from the fixed `docs/superpowers/specs` segment to any
  `docs/superpowers/<subdir>` segment (still under `~/Projects/`, still `.md`). Worktree paths
  already pass since they contain the segment.

## 5. Testing & Verification

- **Unit (Vitest):**
  - discovery: flat output shape; title extraction (heading, no-heading fallback to first line,
    empty-file fallback to filename); worktree-unique dedup across multiple subdirs (a `plans`
    file and a `specs` file with the same basename are independent); `recency = max(mtime,
    filenameDate)`; inclusion of `plans` alongside `specs`.
  - `withinWindow`: keeps entries at/after the boundary, drops older ones, exact-24h boundary,
    empty input.
- **Manual end-to-end (real browser):** the list shows titles with captions, only last-24h
  entries, newest first; long titles wrap to multiple lines (no truncation); the sidebar divider
  drags to resize and the width persists across reload; selecting opens preview-left /
  CodeMirror-right; at wide widths the editor stops growing at its cap and the preview takes the
  surplus; CodeMirror highlights markdown in the dark theme; scroll-sync still tracks
  both ways; editing autosaves (`saving…`→`saved`); an external change still reloads with a toast;
  an `/open?path=` deep-link opens the right doc.

## Out of Scope (future)

- **Filter/search** across the full union (the eventual way to reach anything older than 24h).
- Anything older than 24 hours.
- launchd / permanent auto-start (deferred until the tool is feature-complete).
- WYSIWYG editing, creating/deleting docs, authentication.
