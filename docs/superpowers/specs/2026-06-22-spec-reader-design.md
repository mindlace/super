# spec_reader — Design Spec

## Context

The current workflow produces superpowers spec files (via the brainstorming skill) at
`docs/superpowers/specs/` inside each project and inside git worktrees under
`.claude/worktrees/`. Reading and iterating on these specs currently means opening VSCode,
navigating to the spec, opening it, and switching to preview mode — tedious, and VSCode CPU
usage grows as more worktrees accumulate inside a project.

`spec_reader` is a small **persistent local web app** (port 4510) that lists every project's
specs, renders them as well-formatted HTML, and allows light editing. It also accepts a
deep-link so a Claude Code agent can say *"I've written the spec at `<link>`"* and the user
can click straight through to that spec.

Intended outcome: replace the VSCode open-then-preview dance with a single always-running
browser tab.

## Stack

- **SvelteKit 2 / Svelte 5** (runes syntax), consistent with the rest of the workspace.
- **Tailwind CSS v4** for styling.
- **`@sveltejs/adapter-node`** — runs as a persistent local Node server (not Cloudflare;
  the app needs local filesystem access). Bound to `127.0.0.1:4510`.
- **`marked`** for markdown → HTML rendering, with **`DOMPurify`** sanitizing the output
  (we inject rendered HTML into the DOM).
- **Vitest** for unit tests.

Note: planafoot's milkdown WYSIWYG editor and its `renderMarkdown` renderer were considered
and deliberately **not** reused — milkdown is tangled into planafoot's bespoke app chrome, and
`renderMarkdown` is over-engineered for editor/render parity that this app does not need.

## Spec Discovery (server)

Pure filesystem + filename comparison — no git required.

- **Main specs:** glob `~/Projects/*/docs/superpowers/specs/*.md`, grouped per project.
- **Worktree-unique specs:** glob
  `~/Projects/*/.claude/worktrees/*/docs/superpowers/specs/*.md`, but include a file **only if
  its basename is not already present in that project's main set**. (The user always keeps the
  default checkout on `main`, so worktrees otherwise inherit the full main spec set — those
  inherited duplicates are filtered out.) Each surviving worktree-unique spec is tagged with
  its worktree name.
- **Sort:** newest-first by the filename date prefix `YYYY-MM-DD` or `YYYY-MM-DD-HHMM`.

## UI

- **Sidebar:** projects listed (collapsible), with each project's specs newest-first beneath
  it. Worktree-unique specs display a small badge naming their worktree. Clicking a spec
  selects it.
- **Split pane:**
  - Left: monospace `<textarea>` holding the raw markdown.
  - Right: rendered, well-formatted HTML (marked + DOMPurify).
  - **Bidirectional scroll-sync** by scroll-percentage, so editing pane and preview track
    together.
- Tailwind styling, consistent with the workspace look.

## Saving — Debounced Autosave

- Roughly 1 second after the user stops typing, `PUT` the textarea content to disk. A small
  status indicator shows `saving…` / `saved`.
- **External-change handling** (important for the brainstorm → read → iterate loop, where an
  agent may rewrite the file while it is open):
  - The server returns the file `mtime`; the client polls it periodically.
  - If the on-disk file changed, **always reload** the content from disk and show a toast
    (e.g. *"Reloaded — file changed on disk"*). No conflict prompt and no "keep mine" path:
    a second's worth of in-flight edits isn't worth preserving, and the user does not edit
    docs that aren't quiescent.

## Server Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/specs` | Grouped, sorted spec list (with worktree badges). |
| `GET /api/spec?path=…` | Returns `{ content, mtime }` for one spec. |
| `PUT /api/spec?path=…` | Writes content to disk (autosave). |
| `GET /open?path=…` | Opens the app with that spec selected; triggers a fresh scan so a brand-new spec appears in the sidebar. |

**Path validation (all endpoints):** every `path` parameter must resolve to a real path
**under `~/Projects/`**, must match the `…/docs/superpowers/specs/…` segment, and must end in
`.md`. Reject anything else. The server binds to localhost only. This is hygiene for an app
that writes to disk.

## Running It

- **Dev:** `npm run dev` (Vite dev server on port 4510).
- **Prod / always-on:** `npm run build` → `PORT=4510 HOST=127.0.0.1 node build`.
- The README documents the agent link format:
  `http://localhost:4510/open?path=<absolute-spec-path>`
  so an agent can hand the user a clickable link to a spec it just wrote.
- **Out of scope for v1:** a launchd plist for auto-start across reboots (the app is assumed
  to already be running). Noted as a possible later addition.

## Testing

- **Vitest unit tests** for the discovery logic — specifically the worktree-unique filtering
  (inherited duplicates removed, genuinely-new worktree specs kept and badged) and the
  newest-first date sort.
- **Manual end-to-end:** start the server → see projects in the sidebar → open a spec → edit
  it → confirm the file on disk changed → follow an `/open?path=…` deep-link → verify
  scroll-sync and the external-change banner behavior.

## Out of Scope (v1)

- Full WYSIWYG / milkdown editing (split-pane raw markdown is sufficient for now).
- Creating or deleting specs from the app.
- Authentication (localhost-only, single user).
- launchd auto-start.
