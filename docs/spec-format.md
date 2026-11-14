# Spec format: semantic HTML specs and plans

This file is a complete reference for writing a spec or plan as an `.html` file
that the superspec reader renders. Follow it exactly. The reader sanitises what
you write: anything outside this format is silently removed from the rendered
page and listed in a "dropped" report, so stay inside it.

## File rules

- A spec or plan is one HTML **fragment**. Its root is a single `<article>`.
- Never write a doctype, `html`, `head`, `body`, `style`, `script` or `link`.
- The file lives in `docs/superpowers/specs/` (specs) or
  `docs/superpowers/plans/` (plans).
- File names:
  - Specs: `YYYY-MM-DD-<slug>-design.html`
  - Plans: `YYYY-MM-DD-<slug>.html`
- Indent with two spaces. Write `strong` and `em`, never `b` or `i`. There is no
  underline element.

## Allowed elements

Anything not listed here is removed.

| Purpose | Elements |
|---|---|
| Structure | `article`, `header`, `section`, `h1` to `h4`, `hr` |
| Prose | `p`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `blockquote`, `details`, `summary` |
| Inline | `a`, `em`, `strong`, `code`, `kbd`, `mark`, `sub`, `sup`, `br` |
| Checklists | `input` with `type="checkbox"`, as the first child of an `li` |
| Callouts | `aside` with `data-kind` set to `note`, `warning`, `decision` or `question` |
| Code | `pre` containing `code`, with the language in `data-lang` |
| Tables | `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td` |
| Figures | `figure`, `figcaption`, `img`, `video` |
| Diagrams | `svg` and, inside it only, `g`, `rect`, `circle`, `ellipse`, `line`, `path`, `polyline`, `polygon`, `text`, `tspan`, `title`, `desc`, `defs`, `marker` |

The SVG elements are only valid inside an `svg`, and the HTML elements are not
valid inside one.

## Allowed attributes

- `id`
- `class`, on SVG elements only (including the `svg` itself), and only with the
  diagram class names (`diagram`, `node`, `edge`, `group`, `missing`, `result`,
  `external`, `muted`; see Diagrams). A `class` on any HTML element is removed,
  and any other class name on an SVG element is removed.
- `data-*` (for example `data-kind`, `data-lang`, `data-from`, `data-to`)
- `aria-*`, `role`
- `href`, `src`, `alt`, `controls`, `scope`, `colspan`, `rowspan`, `open`
- `type` and `checked`, on `input` only, and `type` only with the value
  `checkbox`
- SVG geometry and references: `viewBox`, `x`, `y`, `width`, `height`, `d`,
  `points`, `cx`, `cy`, `r`, `rx`, `ry`, `x1`, `y1`, `x2`, `y2`, `transform`,
  `marker-end`, `marker-start`, and on `marker` only: `refX`, `refY`,
  `markerWidth`, `markerHeight`, `orient`

## Never

- `style` attributes, `on*` event handlers, and presentation attributes that set
  colour or font (`fill`, `stroke`, `font-*`). The stylesheet paints everything.
- Any form element other than the checkbox described below.
- Remote URLs in `src`. Links (`href`) may point anywhere; `src` may not.

## Semantic rules

All of these are required by the format. The reader enforces only the ones
marked (enforced): it reports a problem for them and still renders. The rest are
not checked, but a spec that breaks them is wrong.

- Exactly one `h1` (enforced). It is the title and goes inside the `header`
  (not checked). The `header` may also hold a one-line summary `p`.
- Every `section`, `figure` and `table` has an `id` (enforced), unique in the
  whole file (enforced) and stable across edits (other people link to `#id`).
- Sections nest; the heading level follows nesting depth (`h2` for a top-level
  section, `h3` inside it, up to `h4`).
- A table has a `caption`. Its header cells are `th` with `scope="col"` or
  `scope="row"`.
- A diagram sits in a `figure` with a `figcaption`, and its `svg` has a `title`
  child.
- Every checklist `li` has an `id` (enforced; see Checklists).
- No duplicate ids anywhere (enforced).
- The file has a single `article` root (enforced).

A suggestion, not a rule: a descriptive, prefixed id such as `sec-goals`,
`tbl-limits`, `fig-flow`, `n-reader` or `t1-s1` says what it names.

## Writing for a reader

A spec is read by people and agents who must hold it in their heads. Write so
each piece can be found and checked on its own.

- One claim per sentence. A paragraph states one idea.
- A paragraph that lists more than three things, or states more than one rule,
  becomes a `ul` or `ol` with one item per thing or rule.
- Code is a block. A type, signature, message shape, schema, union or command
  goes in `<pre><code data-lang="...">`, written as it would be in the source
  file, never spelled out inside a sentence. Always set `data-lang` (`ts`,
  `sql`, `sh`, `json`, …); the reader highlights by it. Inline `code` is for
  naming a thing (`setPolicy`, `rev`), not for defining it.
- A table cell holds a name, a number, a link or one short sentence. Never a
  code block, a list or several sentences; that content belongs in a section
  the cell links to.
- Describe an interface in this order, each part its own block:
  1. **Shape**: the types in one code block.
  2. **Meaning**: a `dl` with one `dt` per message, field or function and its
     meaning in the `dd`, where the name alone does not say it.
  3. **Rules**: a `ul` of behaviour, one rule per item (ordering, what is
     dropped and when, what answers what, errors).
  4. **Unchanged** and **Removed**: short lists of names, when the interface
     replaces or keeps an existing one.

```html
<section id="sec-if-s14">
  <h3>S14 Timeline worker messages</h3>
  <pre><code data-lang="ts">type ToWorker =
  | { type: 'setPolicy'; rev: number; policy: SimPolicy4 }
  | { type: 'viewMonth'; month: number };</code></pre>
  <dl>
    <dt><code>rev</code></dt><dd>The page's count of policy edits.</dd>
  </dl>
  <ul>
    <li>The worker drops work for an older <code>rev</code>.</li>
    <li>A rejected document is answered with <code>bad-request</code> at its <code>rev</code>.</li>
  </ul>
</section>
```

## Callouts

```
<aside data-kind="decision"><strong>Decision</strong> We keep one stylesheet.</aside>
```

The kinds are `note`, `warning`, `decision`, `question`. Start with a `strong`
label.

## Checklists

Plans are checklists. A checklist item is an `li` whose first child is the
checkbox. It may hold more blocks after its text, such as a `pre`.

- Done is the presence of the `checked` attribute, written bare:
  `<input type="checkbox" checked>`. Not done is no `checked` attribute.
- An agent ticks a step by adding the word `checked` to that one line. Do not
  write `checked="checked"` or `checked="true"`.
- Every checklist `li` has a unique `id`, so a step can be named, for example
  `t1-s2` for task 1, step 2.
- The reader shows checkboxes read-only. It never changes one; only edits to the
  file do.
- A checkbox anywhere other than the first child of an `li` is removed.

## Diagrams

The SVG carries structure and geometry. The stylesheet carries all paint, so
never set colours.

- Put the diagram in a `figure` with an `id` and a `figcaption`. The `svg` has
  `viewBox`, `role="img"`, and a `title` child.
- A **node** is `<g class="node" id="n-...">` containing one shape (`rect`) and a
  `text`. Text is centred on its `x`/`y`.
- An **edge** is `<g class="edge" data-from="n-..." data-to="n-...">` containing
  a `path` and optionally a `text` label. `data-from` and `data-to` are node ids;
  a reader of the file gets the graph from them without interpreting
  coordinates.
- A **group** (a labelled box around several nodes) is `<g class="group">` with
  a `rect` and a `text`.
- Four modifier classes mark a node's state: `missing` (dashed, a thing that
  does not exist yet), `result` (the outcome), `external` (outside the system),
  `muted` (de-emphasised). Combine with `node`, for example
  `class="node missing"`.
- Edges draw an arrowhead from a marker with the id `arrow`. Define it ONCE PER
  FILE, in the `defs` of the first diagram:
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z"/></marker></defs>`
  With several diagrams, later ones define no marker and their edges still use
  this one. Defining it again would duplicate the id `arrow`.

## Media

`img` and `video` use a `src` relative to the spec file. The files live in an
`assets/<spec-stem>/` directory inside the same type directory, where
`<spec-stem>` is the spec's file name without `.html`:

```
docs/superpowers/specs/2026-11-13-foo-design.html
docs/superpowers/specs/assets/2026-11-13-foo-design/screenshot.png
```

and the markup is `<img src="assets/2026-11-13-foo-design/screenshot.png" alt="...">`.

- Allowed extensions: `png`, `jpg`, `jpeg`, `gif`, `webp`, `mp4`, `webm`. SVG
  files are not served; draw diagrams inline instead.
- A `src` that is remote (`https://...`, `//host/...`), absolute (`/...`), or
  that escapes the type directory with `..` is removed.
- Always give an `img` an `alt`; give a `video` `controls`.
- Wrap media in a `figure` with an `id` and a `figcaption`.

## Example: a spec

```html
<article>
  <header>
    <h1>Targeted watches</h1>
    <p>Watch only the directories that can hold specs.</p>
  </header>
  <section id="sec-problem">
    <h2>Problem</h2>
    <p>Watching the whole projects root floods the file-event service with
      events nobody reads. The reader needs <strong>one handle per spec
      directory</strong>, nothing more.</p>
    <aside data-kind="warning"><strong>Warning</strong> Never watch the projects
      root recursively.</aside>
  </section>
  <section id="sec-design">
    <h2>Design</h2>
    <p>Targets come from one function, so the watcher and the scanner agree.</p>
    <section id="sec-limits">
      <h3>Limits</h3>
      <table id="tbl-limits">
        <caption>Watch handles by kind</caption>
        <thead>
          <tr><th scope="col">Kind</th><th scope="col">Handles</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Project root</th><td>1</td></tr>
          <tr><th scope="row">Spec directory</th><td>About 100</td></tr>
        </tbody>
      </table>
    </section>
    <figure id="fig-flow">
      <svg class="diagram" viewBox="0 0 520 90" role="img" aria-labelledby="fig-flow-t">
        <title id="fig-flow-t">The scanner and the watcher share one target list</title>
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z"/></marker></defs>
        <g class="node" id="n-targets"><rect x="10" y="20" width="140" height="44"/><text x="80" y="42">target list</text></g>
        <g class="node" id="n-watcher"><rect x="190" y="20" width="140" height="44"/><text x="260" y="42">watcher</text></g>
        <g class="node result" id="n-client"><rect x="370" y="20" width="140" height="44"/><text x="440" y="42">client refetch</text></g>
        <g class="edge" data-from="n-targets" data-to="n-watcher"><path d="M150 42H188"/><text x="169" y="34">feeds</text></g>
        <g class="edge" data-from="n-watcher" data-to="n-client"><path d="M330 42H368"/><text x="349" y="34">event</text></g>
      </svg>
      <figcaption>Figure 1. Both consumers read the same list.</figcaption>
    </figure>
  </section>
</article>
```

## Example: a plan

```html
<article>
  <header>
    <h1>Targeted watches plan</h1>
    <p>Implements the targeted watches spec.</p>
  </header>
  <section id="sec-task-1">
    <h2>Task 1: Target list</h2>
    <ol>
      <li id="t1-s1"><input type="checkbox" checked> Write the failing test</li>
      <li id="t1-s2"><input type="checkbox"> Run it and see it fail
        <pre><code data-lang="sh">npx vitest run src/lib/server/watchtargets.test.ts</code></pre>
      </li>
      <li id="t1-s3"><input type="checkbox"> Implement <code>listWatchTargets()</code></li>
      <li id="t1-s4"><input type="checkbox"> Run the test again and see it pass</li>
      <li id="t1-s5"><input type="checkbox"> Commit
        <pre><code data-lang="sh">git commit -m "feat: targeted watch list"</code></pre>
      </li>
    </ol>
  </section>
</article>
```
