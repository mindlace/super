# Semantic HTML specs

## Intent

Specs are read by two audiences: Ethan, in this app, and agents, as raw text.
Markdown serves neither as well as it could:

- Large tables are tedious to copy out, and their pipe-and-dash source is noise
  for an agent reading the file.
- Diagrams are ASCII or Mermaid: weak visually, and loose semantically.
- Mixed media (screenshots, recordings) has no comfortable home.
- Typography is whatever the preview pane happens to do.

This project lets a spec be written as a small, controlled subset of semantic
HTML, rendered by spec_reader with one shared stylesheet and one shared script.
The file stays in the worktree's `docs/superpowers/` directory, so the existing
rule is untouched: a spec belongs to its worktree and becomes canon on merge.

A second project, not covered here, adds a feedback loop (comments anchored to
parts of a spec that the agent can read). This project must leave the anchors
that one will need.

## Goals

1. An `.html` spec in any `docs/superpowers/*/` directory is discovered, listed,
   paired, watched, opened, edited and saved exactly as an `.md` spec is today.
2. The rendered spec is typographically clear in light and dark themes, with no
   styling in the spec file itself.
3. Tables can be copied in one click in a form that pastes cleanly into a
   spreadsheet or a chat.
4. Diagrams are inline SVG that an agent can read and write as structure
   (named nodes, edges that say what they connect) and that take all of their
   appearance from the shared stylesheet.
5. A spec can embed images and video stored beside it in the worktree.
6. The raw file is at least as clear to an agent as the markdown it replaces.
7. Existing markdown specs keep working, and get the same stylesheet.

## Non-goals

- The feedback loop (next project).
- Publishing to Claude artifacts. The format should not rule it out: the
  stylesheet and script are standalone files so a spec can later be wrapped
  and published.
- Converting existing markdown specs.
- WYSIWYG editing. Light edits are made in the HTML source.
- Rendering Mermaid.
- Moving plans to HTML. The reader renders any `.html` file it finds, but only
  specs are *written* in HTML for now (see Open questions).

## Anti-goals

- Per-spec styling. If a spec can carry its own CSS, the format has failed.
- Markup that exists for layout: wrapper `div`s, `span`s with classes, inline
  `style`.
- The reader running anything a spec supplies. Specs are written by agents in
  every project under `~/Projects`; they are untrusted input.
- Any change to which specs are listed, or when one counts as landed.

## Approaches

**A. Better markdown.** Keep `.md`; upgrade the preview's styles, render
Mermaid, add a table copy button. Cheapest, and no change for the skills that
write specs. Rejected because it leaves the source as it is: agents still read
pipe tables, diagrams stay Mermaid, and media stays awkward.

**B. Semantic HTML files in the worktree, rendered by spec_reader.** Chosen.
Git remains the only authority on worktree versus canon, the reader's discovery
logic barely changes, and every part of a spec gets a stable id that feedback
can attach to later.

**C. Claude artifacts as the reading surface.** The same files, published to
claude.ai. Gains hosted comments and reading from any device. Rejected as the
primary surface because every edit needs a republish, the hosted copy can drift
from the file, and the reader would shrink to an index of links. It can be
added on top of B.

## The format

A spec file is one HTML **fragment** whose root is a single `<article>`. No
doctype, `html`, `head`, `body`, `style`, `script` or `link`.

```html
<article>
  <header>
    <h1>Targeted watches</h1>
    <p>One-line summary.</p>
  </header>
  <section id="goals">
    <h2>Goals</h2>
    …
  </section>
</article>
```

### Allowed elements

| Purpose | Elements |
|---|---|
| Structure | `article`, `header`, `section`, `h1`–`h4`, `hr` |
| Prose | `p`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `blockquote`, `details`, `summary` |
| Inline | `a`, `em`, `strong`, `code`, `kbd`, `mark`, `sub`, `sup`, `br` |
| Callouts | `aside` with `data-kind` = `note`, `warning`, `decision` or `question` |
| Code | `pre` > `code`, language in `data-lang` |
| Tables | `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td` |
| Figures | `figure`, `figcaption`, `img`, `video` |
| Diagrams | `svg` and `g`, `rect`, `circle`, `ellipse`, `line`, `path`, `polyline`, `polygon`, `text`, `tspan`, `title`, `desc`, `defs`, `marker` |

### Allowed attributes

`id`, `class` (SVG only), `data-*`, `href`, `src`, `alt`, `controls`, `scope`,
`colspan`, `rowspan`, `open`, `role`, `aria-*`, and SVG geometry and reference
attributes (`viewBox`, `x`, `y`, `width`, `height`, `d`, `points`, `cx`, `cy`,
`r`, `rx`, `ry`, `x1`…`y2`, `transform`, `marker-end`, `marker-start`, and
`refX`/`refY`/`markerWidth`/`markerHeight`/`orient` on `marker`).

Never: `style`, any `on*` handler, presentation attributes that set colour or
font (`fill`, `stroke`, `font-*`).

### Rules that make it semantic

- Exactly one `h1`, inside `header`. It is the spec's title.
- Every `section`, `figure` and `table` has an `id`, unique in the file and
  stable across edits. Sections nest; heading level follows nesting depth.
- A table has a `caption`, and header cells use `th` with `scope`.
- A diagram sits in a `figure` with a `figcaption`, and its `svg` has a
  `title`.

### Diagrams

The SVG carries structure and geometry; the stylesheet carries all paint, from
the same theme variables as the text.

- A node is `<g class="node" id="n-…">` containing a shape and a `text`.
- An edge is `<g class="edge" data-from="n-…" data-to="n-…">` containing a
  `path` and an optional `text` label.
- A grouping box is `<g class="group">`.
- A small fixed set of modifier classes marks state: `missing`, `result`,
  `external`, `muted`.

An agent reading the file gets the graph from ids and `data-from`/`data-to`
without interpreting coordinates.

### Media

`img` and `video` use a `src` relative to the spec file, and the files live in
an `assets/` directory beside it:

```
docs/superpowers/specs/2026-11-13-foo-design.html
docs/superpowers/specs/assets/2026-11-13-foo-design/screenshot.png
```

Remote `src` URLs are not allowed.

## The reader

### One predicate for "is this a spec file"

`.md` is currently assumed in five places: `paths.ts:18`, `watcher.ts:8`,
`pairing.ts:14`, `fswalk.ts:30` (`listMarkdown`, the real discovery filter) and
`resolve.ts:48` (which appends `.md` to a query, and backs `/api/resolve` and
the `/open` deep link). Replace all five with one shared, FS-free helper that
answers for `.md` and `.html`, so they cannot drift. The doc comments in
`types.ts` get updated too.

- **Discovery:** list both extensions. `extractTitle` (`discovery.ts:38`) is
  markdown-only and would title an HTML spec `<article>`. Discovery runs on the
  server, where there is no DOM, so the title of an `.html` spec comes from a
  small regex-and-tag-strip over the first `h1`, falling back to the filename
  as today.
- **Pairing:** slug normalisation strips either extension.
- **Landed check:** a worktree spec is suppressed when main has a file with the
  same name *ignoring the extension*, so converting a landed spec does not
  resurrect it. `mainSet` (`discovery.ts:160-175`) is keyed on the exact name
  today and needs an extension-free key; the re-surface block at
  `discovery.ts:194-196` assumes `.md` and needs the same treatment.
- **Both forms in one worktree:** if `foo.md` and `foo.html` sit side by side,
  both are listed. Collapsing them would hide a real file. *(My call.)*
- **Resolve:** a query without an extension matches either.
- **Path safety:** `assertSpecPath()` accepts either extension; everything else
  about it is unchanged.
- **Watcher:** relevant-change filter accepts either extension. `assets/`
  directories are not watched.

### Rendering

`render.ts` gains `renderSpecHtml(source)`: sanitise with DOMPurify using an
explicit allowlist that mirrors the tables above, then post-process:

- Highlight `pre > code[data-lang]` with the existing `highlightToHtml`.
- Rewrite relative `img`/`video` `src` to the asset endpoint; drop any other
  `src`.
- Give external links `target="_blank" rel="noopener"`.

Rendering runs in the browser only (`ssr = false`), as it does today.

Notes on the DOMPurify configuration:

- With explicit `ALLOWED_TAGS`/`ALLOWED_ATTR`, SVG attribute names must be
  listed in lowercase (`viewbox`, `refx`, `markerwidth`).
- Three rules cannot be expressed as an allowlist and need hooks
  (`uponSanitizeAttribute`, `afterSanitizeAttributes`): `class` on SVG
  elements only, no remote `src`, and the relative-`src` rewrite.

The sanitiser is the enforcement point for the subset. The preview shows a
small notice when a spec strays from it, so a stray spec is visible rather
than silently different. The notice covers two things *(my call on the
second)*:

- Markup the sanitiser removed. `DOMPurify.removed` also reports harmless
  removals, so the list is filtered to elements and attributes outside the
  subset.
- Structural rule breaks: no single `article` root, not exactly one `h1`, a
  `section`/`figure`/`table` without an `id`, a duplicate `id`. These are
  reported and the spec is still rendered.

### One stylesheet, one script

- `static/spec.css`: all typography, tables, callouts and diagram paint, with
  light and dark themes. Scoped to the rendered-document container. It also
  styles the markdown preview, so old specs get the same treatment. It
  **replaces** the Tailwind `prose prose-invert` classes hardcoded on the
  preview pane in `Editor.svelte` and the prose overrides in `app.css:9-15`.
  The app has no light theme today; the light theme here applies to the
  rendered document only, following the system setting, and the rest of the
  app's chrome stays as it is. *(My call.)*
- `static/spec.js`: progressive enhancement over rendered output. In this
  project: a copy button on each table (tab-separated text, plus HTML on the
  clipboard for rich paste), and a link anchor on each heading that has an id.
  It exposes one function that enhances a container, and `Editor.svelte` calls
  it after each `{@html}` re-render, before the existing scroll re-sync.

Both are plain files with no build step and no dependency on the Svelte app,
so they can be reused if a spec is ever published elsewhere.

### Assets endpoint

`GET /api/asset?path=…` serves a file that is inside `PROJECTS_ROOT`, inside a
`docs/superpowers/` segment, inside an `assets/` directory, and has an
extension on a fixed list (`png`, `jpg`, `jpeg`, `gif`, `webp`, `mp4`, `webm`).
It gets its own assertion in `paths.ts` alongside `assertSpecPath()`. SVG
files are not served; diagrams are inline. Responses carry the right
`Content-Type`, and video is served with `Range` support so it can seek.

`assets/` must sit inside a type directory (`specs/assets/`), never directly
under `docs/superpowers/`, where discovery would list it as a document type.

### Editing

The editor stays a CodeMirror source editor beside a live preview, switching
its language mode to HTML for `.html` files (`@codemirror/lang-html` is a new
dependency). Autosave, the mtime conflict flow, external-reload scroll
preservation and read-only-on-main all behave as they do today. Scroll sync is
a plain scroll-position ratio, not line-mapped, so it needs no change for HTML
source.

## Getting specs written this way

The reader accepting HTML changes nothing until specs are written in it.

- Add `docs/spec-format.md` to this repo: the format section above as a
  standalone reference an agent can be pointed at, with one complete example.
- Add an override to `~/.claude/CLAUDE.md` under "Superpowers Skill Overrides":
  design docs are written as `.html` to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.html`, following
  `~/Projects/spec_reader/docs/spec-format.md`.

## Testing

Pure unit tests, colocated, in the existing style:

- The spec-file predicate, and each of its three call sites, for both
  extensions.
- Title extraction from `h1`; pairing of an `.html` spec with an `.md` plan;
  the extension-insensitive landed check.
- The sanitiser: allowed markup survives unchanged; `script`, `style`, `on*`,
  inline `style`, remote `src` and unknown elements are removed and reported.
- Asset path assertion: accepts the layout above; rejects traversal, wrong
  directory, wrong extension.
- `src` rewriting for relative paths.

## Left to the builder

- The stylesheet's exact look. A mockup from the brainstorm shows the
  direction: serif body, sans headings and tables, restrained callouts,
  diagrams drawn in the text colours.
- How the stray-markup notice looks.
- Whether late-loading images and video shift the scroll ratio enough to need
  a re-sync on load.

## Open questions

1. **Plans.** This spec keeps plans in markdown: agents tick their checkboxes
   and edit them mid-run, and they are read by you far less than specs are.
   Should plans move too?
2. **`~/.claude/CLAUDE.md`.** The override above edits a file outside this
   repo. Should the implementation make that edit, or leave the text for you
   to add?
