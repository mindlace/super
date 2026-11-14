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
HTML, rendered by spec_reader with one shared stylesheet.
The file stays in the worktree's `docs/superpowers/` directory, so the existing
rule is untouched: a spec belongs to its worktree and becomes canon on merge.

This is the first of three projects, in this order:

1. **Format, single-pane reading, and in-place text editing** (this document).
2. **A feedback loop**: comments anchored to parts of a spec that the agent
   can read.
3. **Structural editing**, if it ever turns out to be wanted.

Ethan's edits to specs have so far been small and textual, never structural.
The editing in this project is sized to that.

## Goals

1. An `.html` spec in any `docs/superpowers/*/` directory is discovered, listed,
   paired, watched, opened, edited and saved exactly as an `.md` spec is today.
2. The rendered spec is typographically clear in light and dark themes, with no
   styling in the spec file itself.
3. Tables are real HTML tables, so selecting and copying one pastes cleanly
   into a spreadsheet or a chat. No copy button.
4. Diagrams are inline SVG that an agent can read and write as structure
   (named nodes, edges that say what they connect) and that take all of their
   appearance from the shared stylesheet.
5. A spec can embed images and video stored beside it in the worktree.
6. The raw file is at least as clear to an agent as the markdown it replaces.
7. Existing markdown specs keep working, and get the same stylesheet.
8. The text of an HTML spec can be corrected where it is read, without
   switching to the source, and such an edit changes nothing else in the file.

**Stretch:** bold and italic on a selection, and adding or removing
list items, in the same in-place editor.

## Non-goals

- Structural editing in place: adding, removing or reordering blocks, rows,
  columns, sections, callouts or figures; changing a block's type; drawing or
  rearranging a diagram. All of that is done in the source or by an agent.
- The feedback loop (project 2).
- Publishing to Claude artifacts. The format should not rule it out: the
  stylesheet is a standalone file so a spec can later be wrapped and
  published.
- Converting existing markdown specs.
- Rendering Mermaid.
- Switching what gets written. Specs and plans, including this project's own,
  stay in markdown until this has shipped and been used (see Rollout).

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
- Add a link anchor to each heading whose section has an `id`.

Rendering runs in the browser only (`ssr = false`), as it does today.

Notes on the DOMPurify configuration:

- With explicit `ALLOWED_TAGS`/`ALLOWED_ATTR`, SVG attribute names must be
  listed in lowercase (`viewbox`, `refx`, `markerwidth`).
- Three rules cannot be expressed as an allowlist and need hooks
  (`uponSanitizeAttribute`, `afterSanitizeAttributes`): `class` on SVG
  elements only, no remote `src`, and the relative-`src` rewrite.

The sanitiser is the enforcement point for the subset. The rendered pane shows a
small notice when a spec strays from it, so a stray spec is visible rather
than silently different. The notice covers two things *(my call on the
second)*:

- Markup the sanitiser removed. `DOMPurify.removed` also reports harmless
  removals, so the list is filtered to elements and attributes outside the
  subset.
- Structural rule breaks: no single `article` root, not exactly one `h1`, a
  `section`/`figure`/`table` without an `id`, a duplicate `id`. These are
  reported and the spec is still rendered.

### One stylesheet, no script

`static/spec.css` holds all typography, tables, callouts and diagram paint,
with light and dark themes, scoped to the rendered-document container. The
look is the one approved in the brainstorm mockup: serif body, sans headings
and tables, restrained callouts, diagrams drawn in the text colours.

- It also styles rendered markdown, so old specs get the same treatment.
- It **replaces** the Tailwind `prose prose-invert` classes hardcoded on the
  preview pane in `Editor.svelte` and the prose overrides in `app.css:9-15`.
- The app has no light theme today. The light theme here applies to the
  rendered document only, following the system setting; the rest of the app's
  chrome stays as it is. *(My call.)*
- It is a plain file with no build step and no dependency on the Svelte app,
  so it can be reused if a spec is ever published elsewhere.

Nothing in this project needs a shared script. One can be added when a
feature calls for it.

### Assets endpoint

`GET /api/asset?path=…` serves a file that is inside `PROJECTS_ROOT`, inside a
`docs/superpowers/` segment, inside an `assets/` directory, and has an
extension on a fixed list (`png`, `jpg`, `jpeg`, `gif`, `webp`, `mp4`, `webm`).
It gets its own assertion in `paths.ts` alongside `assertSpecPath()`. SVG
files are not served; diagrams are inline. Responses carry the right
`Content-Type`, and video is served with `Range` support so it can seek.

`assets/` must sit inside a type directory (`specs/assets/`), never directly
under `docs/superpowers/`, where discovery would list it as a document type.

### One pane

The two-pane layout (source beside preview) goes. A spec opens as a single
rendered pane, for both `.html` and `.md`.

- A toggle switches the pane to the source: the existing CodeMirror editor,
  in HTML mode for `.html` files (`@codemirror/lang-html` is a new
  dependency) and markdown mode for `.md`. Toggling back re-renders.
- The toggle remembers its state per session, not per file, and a file on
  main (read-only) can still be toggled to view its source.
- Autosave, the mtime conflict flow, external reload and read-only-on-main
  behave as they do today, in both the source view and in-place editing.
- Scroll position is carried across the toggle by the same scroll-ratio
  approach the two panes use to stay in sync today.

### Editing text in place

In the rendered pane of an `.html` spec, text can be edited where it stands.
This is deliberately not a document editor: it changes the words inside
existing elements and nothing else.

**What is editable.** The text-bearing elements of the subset: `p`, `li`,
`h1`–`h4`, `dt`, `dd`, `td`, `th`, `caption`, `figcaption`, `summary`, and the
text of an `aside` or `blockquote` through the `p` or bare text inside it.
Inline markup already inside one (`code`, `a`, `strong`…) is kept and can be
typed within.

**What is not.**

- Code blocks. They are rendered with highlighting markup, so they are edited
  in the source. *(My call.)*
- Diagram text. Browsers do not support in-place editing of SVG `text`, so
  this is not the straightforward case; it is edited in the source.
- Markdown specs. Mapping an edit back into markdown source is a different
  problem, and the format is being left behind; `.md` is edited in the source
  as today. *(My call.)*
- Files on main, which are read-only.

**Keys.** Enter does not create a new block. Paste inserts plain text.
Undo is the browser's own, within the element being edited.

**Saving changes only the edited element.** This is the rule that makes
in-place editing safe on a file agents also read and diff. The rendered DOM
is sanitised and post-processed, so it is never written back. Instead:

1. The source is parsed with a parser that records where each element sits in
   the source text (`parse5` with source locations is the suggested one; it
   runs in the browser).
2. Each editable element in the rendered pane is tied to its source element.
3. On input, the edited element's inner content is cleaned to the inline
   subset (dropping anything the browser injected, and normalising `b`/`i` to
   `strong`/`em`) and spliced into the source text at that element's inner
   range. Every other byte of the file is left as it was.
4. The result goes through the existing debounced autosave and mtime check.

A test must show that editing one paragraph of a multi-section spec with
tables and a diagram yields a diff confined to that paragraph.

**Stretch.** In the same editor: Cmd-B and Cmd-I wrap or unwrap the
selection in `strong` and `em` (never `b` or `i`). There is no underline:
underlining is reserved for links, so `u` is not in the subset and Cmd-U does
nothing. Enter at the end of a list item adds a
sibling item, and Backspace in an empty item removes it. List items are the
one place the splice replaces a parent's (`ul`/`ol`) inner range rather than
a leaf's. Turning a paragraph into a list, or the reverse, is not included.

A full schema-driven editor (TipTap was considered) is not needed for this
and is deferred. Planafoot's editor was looked at and set aside: it is
Milkdown, which reads and writes markdown and shows unknown HTML as literal
text.

## Rollout

The reader accepting HTML changes nothing until specs are written in it, and
that switch is deliberately not part of this project.

- This project adds `docs/spec-format.md`: the format section above as a
  standalone reference an agent can be pointed at, with one complete example.
- Specs and plans keep being written in markdown until this has shipped.
- Turning HTML on afterwards is a follow-on piece of work, not part of this
  plan. It is to be baked into superpowers rather than added to
  `~/.claude/CLAUDE.md`: a SessionStart hook injects the instruction to write
  design docs as `.html` per the format reference, the way the
  `superpowers-jev` plugin injects its own session context. Whether plans
  follow is decided then.
- So `docs/spec-format.md` must stand alone: an agent given only that file
  can write a valid spec.
- Until then the reader is exercised with hand-converted specs, starting with
  the saved mockup's `article`.

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
- In-place editing, as pure functions over a source string: locating an
  element's inner range, cleaning edited content to the inline subset, and
  the splice, including the confined-diff case above.

## Left to the builder

- Fine detail of the stylesheet beyond the approved mockup, which is saved at
  `docs/superpowers/specs/assets/2026-11-13-semantic-html-specs-design/sample-spec.html`.
- How the stray-markup notice and the source toggle look.

## Open questions

None. Whether plans move to HTML, and when the override is switched on, are
decided after this ships (see Rollout).
