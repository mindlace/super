# Semantic HTML Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** spec_reader discovers, renders, styles and lets you edit in place `.html` specs written in a small semantic-HTML subset, beside the existing `.md` specs, in one rendered pane with a source toggle.

**Architecture:** One FS-free predicate (`superspec/src/lib/specfile.ts`) replaces every `.md` assumption on the server. The client sanitises an `.html` spec with a dedicated DOMPurify instance and an explicit allowlist, then post-processes it (highlighting, asset `src` rewrite, link targets, heading anchors, every checkbox `disabled`); a notice reports anything stripped or structurally wrong. In-place edits never serialise the rendered DOM: pure functions over the source string (parse5 with source locations) locate the element and splice only its inner range. Checkboxes are display only.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, adapter-node, Vitest (node + jsdom), DOMPurify 3, marked, Shiki, CodeMirror 6 (+ `@codemirror/lang-html`, new), `parse5` (new).

**Spec:** `docs/superpowers/specs/2026-11-13-semantic-html-specs-design.md` (approved visual reference: `docs/superpowers/specs/assets/2026-11-13-semantic-html-specs-design/sample-spec.html`)

## Global Constraints

- App commands (`npm`, `npx vitest`) run from `superspec/`: issue `cd superspec` as its own command first, never `cd superspec && cmd`. Paths in commands below are relative to `superspec/` unless they start with `docs/`.
- Spec files are `.md` or `.html`; every "is this a spec file" decision goes through `isSpecFile()` in `superspec/src/lib/specfile.ts`. No new `.endsWith('.md')` anywhere.
- Allowed elements, attributes and the "Never" list are exactly the spec's tables under "The format" (including the Checklists row: `input` with `type="checkbox"` as the first child of an `li`; `type` and `checked` on `input` only, `type` only as `checkbox`). No `u`, no underline anywhere; `b`/`i` are never written, only `strong`/`em`.
- Assets: served only from `docs/superpowers/<type>/assets/…`, extensions exactly `png`, `jpg`, `jpeg`, `gif`, `webp`, `mp4`, `webm`. SVG files are not served. Remote `src` is never allowed.
- The reader runs nothing a spec supplies. Spec HTML is untrusted input.
- No change to which specs are listed or when one counts as landed, other than the extension-insensitive landed check the spec requires.
- One stylesheet, `superspec/static/spec.css`, plain CSS, no build step, no dependency on the Svelte app. No shared script.
- In-place edits change only bytes inside the edited element. The rendered DOM is never written back.
- Checkboxes are display only: the reader never changes one. Every rendered checkbox is `disabled`, on every file (worktree or main), and reflects the file's `checked` attribute.
- `.md` files: rendered pane and source toggle only; no in-place editing. Files on main are read-only everywhere (no contenteditable).
- Modules imported at runtime by tests use **relative** imports, not `$lib/…`: `superspec/vitest.config.ts` has no `$lib` alias (existing code only uses `$lib` for type-only imports).
- Out of scope: `~/.claude/CLAUDE.md`, any superpowers hook, converting existing `.md` specs, Mermaid.
- 2-space indent, single quotes, Svelte 5 runes, colocated `*.test.ts`. Commands are never written as `cd X && cmd`. Commits use Conventional Commits with no Claude attribution or co-author trailers.
- The worktree has no `node_modules`: run `npm install` once before Task 1.

## Review Focus

1. **A spec with stray markup the sanitiser removes** (e.g. a `<span>` inside a `<p>`, or an unclosed `<p>`): the rendered/source element lists drift, and a keystroke would splice into the wrong element. Expected: in-place editing turns itself off for that file and the notice says so. Test: Task 9 Step 1 (`disables editing when rendered and source editables disagree`) and Task 8 (`marks an element with no end tag as not editable`).
2. **Typing in a paragraph that contains a link, `code`, or a heading with the reader-added anchor**: the reader's additions (`target`, `rel`, the anchor `a`) must not leak into the source. Test: Task 9 Step 1 (`editedInner drops reader-added markup`).
3. **Typing in a checklist item**: the leading checkbox must survive the splice and never be written into the edited text; an item whose text is followed by blocks (`<li><input> Run it <pre>…</pre></li>`, the spec's own example) is not editable at all. Test: Task 8 (`checklist li range starts after the checkbox`, `an item holding a pre is not editable`) and Task 9 (`editedInner excludes the leading checkbox`).
4. **Asset paths that look right but escape** (`specs/assets/../../../x.png`, `docs/superpowers/assets/x.png`, `specs/assets/x.svg`, an uppercase `.PNG`): Test: Task 5 assertions.
5. **Toggling to source and back on a long spec after an external reload**: scroll should land at the same relative position, not the top. Test: Task 7 (`scrollratio` round-trip) plus the manual check in Task 7 Step 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `superspec/src/lib/specfile.ts` (new) | `isSpecFile`, `stripSpecExt`, `specKind` — FS-free, client and server |
| `superspec/src/lib/server/fswalk.ts` | `listMarkdown` → `listSpecFiles` |
| `superspec/src/lib/server/discovery.ts` | extension-free `mainSet`; `extractHtmlTitle`; title by kind |
| `superspec/src/lib/server/resolve.ts` | extension-less query matches either |
| `superspec/src/lib/server/paths.ts` | `assertSpecPath` both extensions; new `assertAssetPath` |
| `superspec/src/lib/server/watcher.ts`, `superspec/src/lib/pairing.ts`, `superspec/src/lib/types.ts` | use the predicate; doc comments |
| `superspec/src/lib/subset.ts` (new) | the subset as data: allowed tags/attrs, inline tags, editable tags |
| `superspec/src/lib/sanitize.ts` (new) | DOMPurify instance + hooks, removal report, structural check |
| `superspec/src/lib/render.ts` | `renderSpecHtml(source, specPath)` post-processing |
| `superspec/src/lib/assetsrc.ts` (new) | relative `src` → `/api/asset?path=…` (pure, client) |
| `superspec/src/lib/server/assets.ts` (new) | content types, `parseRange` |
| `superspec/src/routes/api/asset/+server.ts` (new) | asset endpoint with Range |
| `superspec/static/spec.css` (new), `superspec/src/app.html`, `superspec/src/app.css` | the one stylesheet; drop `prose` |
| `superspec/src/lib/highlight.ts` | dual light/dark Shiki themes |
| `superspec/src/lib/scrollratio.ts` (new) | scroll ratio helpers |
| `superspec/src/lib/components/Editor.svelte` | source-only CodeMirror, language by kind |
| `superspec/src/lib/components/DocPane.svelte` (new) | rendered pane, toggle, notice, in-place editing |
| `superspec/src/lib/inplace.ts` (new) | pure: locate editables, clean, splice |
| `superspec/src/lib/inplaceDom.ts` (new) | DOM side: collect rendered editables, `editedInner` |
| `superspec/src/lib/fixtures/sample-spec.html`, `sample-plan.html` (new) | hand-converted test specs |
| `docs/spec-format.md` (new) | standalone format reference |

---

### Task 1: One spec-file predicate across the server

**Files:**
- Create: `superspec/src/lib/specfile.ts`, `superspec/src/lib/specfile.test.ts`
- Modify: `superspec/src/lib/server/fswalk.ts:27-34`, `superspec/src/lib/server/discovery.ts:6,160-175,192-207`, `superspec/src/lib/server/resolve.ts:3,24,48-56`, `superspec/src/lib/server/paths.ts:18-20`, `superspec/src/lib/server/watcher.ts:8`, `superspec/src/lib/pairing.ts:14`, `superspec/src/lib/types.ts:4,6`
- Test: `superspec/src/lib/server/fswalk.test.ts`, `discovery.test.ts`, `resolve.test.ts`, `paths.test.ts`, `watcher.test.ts`, `superspec/src/lib/pairing.test.ts`

**Interfaces:**
- Produces:
  - `export type SpecKind = 'markdown' | 'html'`
  - `export function isSpecFile(name: string): boolean` — true iff name ends with `.md` or `.html` (case-sensitive, as `.md` is today)
  - `export function specKind(name: string): SpecKind | null`
  - `export function stripSpecExt(name: string): string` — removes one trailing `.md`/`.html`, else returns `name`
  - `export async function listSpecFiles(dir: string): Promise<string[]>` (fswalk; replaces `listMarkdown`, which is deleted)

- [ ] **Step 1: Write failing tests**

`specfile.test.ts`:
```ts
expect(isSpecFile('a.md')).toBe(true); expect(isSpecFile('a.html')).toBe(true);
expect(isSpecFile('a.htm')).toBe(false); expect(isSpecFile('a.md.txt')).toBe(false);
expect(specKind('x.html')).toBe('html'); expect(specKind('x.md')).toBe('markdown'); expect(specKind('x.png')).toBeNull();
expect(stripSpecExt('2026-11-13-foo-design.html')).toBe('2026-11-13-foo-design');
expect(stripSpecExt('foo.md')).toBe('foo'); expect(stripSpecExt('foo.png')).toBe('foo.png');
```
Call sites (add to the existing files, existing tests unchanged except the `listMarkdown` rename):
- `fswalk.test.ts` › `listSpecFiles returns .md and .html filenames only` (fixture adds `b.html`, `c.png`, and an `assets/` subdir).
- `paths.test.ts` › `accepts an .html spec path`; `rejects an .htm file`.
- `watcher.test.ts` › `isRelevantChange('p/docs/superpowers/specs/x.html')` is `true`; `isRelevantChange('p/docs/superpowers/specs/assets/x/a.png')` is `false`.
- `pairing.test.ts` › `normalizedSlug('2026-11-13-foo-design.html')` is `'foo'`; `pairs an .html spec with an .md plan` (spec `2026-11-13-foo-design.html`, plan `2026-11-13-foo.md`, same project → one group, plan as child).
- `discovery.test.ts` (new tree via `makeTree`):
  - `lists an .html worktree spec`;
  - `suppresses a worktree .html spec when main has the same name as .md` (main `specs/2026-06-20-land-design.md`, worktree `specs/2026-06-20-land-design.html` → not listed);
  - `lists both forms when foo.md and foo.html sit in one worktree` (both filenames present);
  - `re-surfaces a landed .html main spec for a live worktree plan` (main `specs/2026-06-19-q-design.html`, worktree `plans/2026-06-23-q.md` → entry with `onMain: true`);
  - `does not list files under specs/assets` (`specs/assets/x/shot.png`, `specs/assets/x/mock.html` → neither listed).
- `resolve.test.ts`:
  - `matches a bare name against an .html spec` (`resolveDoc('2026-06-25-h-design', root)` → parent filename `2026-06-25-h-design.html`);
  - `matches an explicit .html name`;
  - `with both forms present, an extension-less query returns the newer`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/specfile.test.ts src/lib/server src/lib/pairing.test.ts`
Expected: FAIL (`specfile` missing, `listSpecFiles` not exported, `.html` cases false/absent).

- [ ] **Step 3: Implement**

- `specfile.ts`: no imports.
- `assertSpecPath`: replace the `.md` check with `isSpecFile(resolved)`; message `path is not a spec file (.md or .html): ${p}`.
- `discovery.ts`: `mainSet` key becomes `` `${sub}/${stripSpecExt(name)}` `` at both insert (line 164) and lookup (line 175); lines 163/174/194 call `listSpecFiles`.
- `resolve.ts`: query forms are `[q]` if `isSpecFile(q)`, else `[`${q}.md`, `${q}.html`]`; a candidate matches if for any form `f`, `c.path === resolvePath(f) || c.path.endsWith(sep + f)`; the `mainEquivalent` fallback runs per form. Newest-wins logic unchanged.
- `watcher.ts:8`: `p.includes('docs/superpowers/') && isSpecFile(p) && !p.includes('/assets/')`.
- `pairing.ts:14`: `.replace(/\.md$/, '')` → apply `stripSpecExt` first in the chain (before the date-prefix strip is fine too; result identical).
- `types.ts`: `filename` comment → `e.g. 2026-06-22-foo-design.md or .html`; `title` comment → `first markdown heading / first non-empty line, or an HTML spec's first h1; else filename`.
- Grep to confirm: `rg -n "\.md'|listMarkdown" src` returns only test fixtures.

- [ ] **Step 4: Run to verify pass**

Run: `npm test` then `npm run check`
Expected: all PASS, 0 svelte-check errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/specfile.ts src/lib/specfile.test.ts src/lib/server src/lib/pairing.ts src/lib/pairing.test.ts src/lib/types.ts
git commit -m "feat: treat .html as a spec file everywhere via one predicate"
```

---

### Task 2: Title of an HTML spec

**Files:**
- Modify: `superspec/src/lib/server/discovery.ts:38-46,82`
- Test: `superspec/src/lib/server/discovery.test.ts`

**Interfaces:**
- Consumes: `specKind` (Task 1)
- Produces: `export function extractHtmlTitle(content: string): string | null`; `makeEntry` titles by `specKind(filename)`.

- [ ] **Step 1: Write failing tests**

```ts
expect(extractHtmlTitle('<article><header><h1>Worktree→main path fallback, with main as read-only</h1>'))
  .toBe('Worktree→main path fallback, with main as read-only');
expect(extractHtmlTitle('<h1 id="t">\n  A <code>b</code> &amp; c\n</h1>')).toBe('A b & c');
expect(extractHtmlTitle('<article><p>no heading</p></article>')).toBeNull();
expect(extractHtmlTitle('<h1>  </h1>')).toBeNull();
```
And `scanSpecs` › `titles an .html spec from its h1 and falls back to the filename` (one file with `<h1>Html Title</h1>`, one `<article></article>` → title equals filename).

- [ ] **Step 2: Run** `npx vitest run src/lib/server/discovery.test.ts` — Expected: FAIL (`extractHtmlTitle` not exported).

- [ ] **Step 3: Implement** — first `/<h1\b[^>]*>([\s\S]*?)<\/h1>/i` match, strip tags, decode `&amp; &lt; &gt; &quot; &#39; &nbsp;`, collapse whitespace, trim; empty → `null`. No DOM (server). In `makeEntry`: `(specKind(filename) === 'html' ? extractHtmlTitle(raw) : extractTitle(raw)) ?? filename`.

- [ ] **Step 4: Run** `npx vitest run src/lib/server/discovery.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: title html specs from their h1"` (add the two files).

---

### Task 3: Sanitiser for the subset, with the stray-markup report

**Files:**
- Create: `superspec/src/lib/subset.ts`, `superspec/src/lib/sanitize.ts`, `superspec/src/lib/sanitize.test.ts`, `superspec/src/lib/fixtures/sample-spec.html`, `superspec/src/lib/fixtures/sample-plan.html`
- Test: `superspec/src/lib/sanitize.test.ts` (`// @vitest-environment jsdom`, like `render.test.ts:1`)

**Interfaces:**
- Produces:
  - `subset.ts`: `ALLOWED_TAGS: readonly string[]`, `ALLOWED_ATTR: readonly string[]` (SVG names lowercase: `viewbox`, `refx`, `refy`, `markerwidth`, `markerheight`), `INLINE_TAGS = ['a','em','strong','code','kbd','mark','sub','sup','br']`, `EDITABLE_TAGS = ['p','li','h1','h2','h3','h4','dt','dd','td','th','caption','figcaption','summary','aside','blockquote']`, `SVG_TAGS: readonly string[]`.
  - `sanitize.ts`:
    ```ts
    export interface SanitizeResult { fragment: DocumentFragment; removed: string[]; problems: string[] }
    export function sanitizeSpec(source: string, rewriteSrc: (src: string) => string | null): SanitizeResult
    export function checkStructure(root: ParentNode): string[]
    ```
    `removed` and `problems` are deduped human-readable lines (exact wording is builder's call; tests match on the quoted fragments below).

- [ ] **Step 1: Create fixtures**

`sample-spec.html`: the `<article>…</article>` from the mockup (lines 76-150), with three edits so it is valid in the subset — *builder's call, the mockup predates these rules*: (1) drop `class="table"` from the table's `figure` (class is SVG-only) and rename that figure's id to `fig-changes`; (2) give the `table` its own `id="tbl-changes"` (every table has an id); (3) remove the hand-written `<a href="#…">` wrappers inside `h2`/`h3` (the renderer adds anchors). `sample-plan.html`: an `article` with `header`/`h1`, one `section id="task-1"` holding the spec's Checklists example `ol` verbatim (`t1-s1` checked, `t1-s2` unchecked with the `pre`), plus a third item `<li id="t1-s3"><input type="checkbox"> Commit with <code>git</code></li>`.

- [ ] **Step 2: Write failing tests**

```ts
// allowed markup survives
const { fragment, removed, problems } = sanitizeSpec(fixture('sample-spec.html'), (s) => s);
expect(removed).toEqual([]); expect(problems).toEqual([]);
expect(fragment.querySelector('g.node.missing#n-wt')).not.toBeNull();
expect(fragment.querySelector('marker')?.getAttribute('refX')).toBe('9');
expect(fragment.querySelector('aside[data-kind="decision"]')).not.toBeNull();
expect(fragment.querySelector('th[scope="row"]')).not.toBeNull();
// removals, each reported
const bad = '<article><header><h1>T</h1></header><script>x()</script><style>p{}</style>' +
  '<p style="color:red" onclick="x()">a<span>b</span><u>c</u></p><p class="k">d</p>' +
  '<figure id="f"><img src="https://evil.example/a.png" alt=""><svg><rect fill="red" class="node"/></svg></figure></article>';
const r = sanitizeSpec(bad, (s) => (/^[a-z]+:|^\/\//i.test(s) ? null : s));
for (const t of ['<script>', '<style>', '<span>', '<u>', 'style', 'onclick', 'class on <p>', 'remote src', 'fill'])
  expect(r.removed.join('\n')).toContain(t);
expect(r.fragment.querySelector('svg rect')?.getAttribute('class')).toBe('node'); // class kept on SVG
expect(r.fragment.textContent).toContain('b'); // unknown element's text kept
// checkboxes
const cb = sanitizeSpec('<article><header><h1>T</h1></header><ul>' +
  '<li id="a"><input type="checkbox" checked> one</li><li id="b"><input type="text"> two</li>' +
  '<li id="c"><input> three</li><li id="d">x <input type="checkbox"></li></ul>' +
  '<p><input type="checkbox"></p><select></select><button>b</button><textarea></textarea></article>', (s) => s);
expect(cb.fragment.querySelectorAll('input').length).toBe(1);
expect(cb.fragment.querySelector('li#a > input[type="checkbox"]')?.hasAttribute('checked')).toBe(true);
for (const t of ['<select>', '<button>', '<textarea>']) expect(cb.removed.join('\n')).toContain(t);
expect(cb.removed.join('\n')).toContain('<input>');
// structure (reported, still rendered)
expect(checkStructure(frag('<p>x</p><article></article>'))).toContain('expected a single <article> root');
expect(checkStructure(frag('<article><h1>a</h1><h1>b</h1></article>')).join()).toContain('exactly one <h1>, found 2');
expect(checkStructure(frag('<article><header><h1>a</h1></header><section><table></table></section></article>')).join())
  .toMatch(/<section> without an id[\s\S]*<table> without an id/);
expect(checkStructure(frag('<article><header><h1>a</h1></header><section id="x"></section><figure id="x"></figure></article>')).join())
  .toContain('duplicate id "x"');
expect(checkStructure(frag('<article><header><h1>a</h1></header><ol><li><input type="checkbox"> s</li></ol></article>')).join())
  .toContain('checklist <li> without an id');
```
(`fixture(name)` reads `superspec/src/lib/fixtures/<name>` with `readFileSync`; `frag(html)` builds a fragment via a `<template>`.)

- [ ] **Step 3: Run** `npx vitest run src/lib/sanitize.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

- A **dedicated** instance, created lazily: `DOMPurify(window)`. Do not add hooks to the default export: `renderMarkdown` (`render.ts:37`) relies on its default config.
- Config: `ALLOWED_TAGS`, `ALLOWED_ATTR` from `subset.ts`, `RETURN_DOM_FRAGMENT: true`, `ALLOW_DATA_ATTR` and `ALLOW_ARIA_ATTR` true.
- Hooks: `uponSanitizeElement` removes an `input` unless its `type` is `checkbox` (case-insensitive) and it is the first element child of an `li` with only whitespace text before it. `uponSanitizeAttribute` drops `class` on non-SVG elements (namespace check), `type`/`checked` on anything but `input`, and any `src` for which `rewriteSrc` returns `null`; `afterSanitizeAttributes` replaces `src` with `rewriteSrc(src)`.
- `removed`: from `DOMPurify.removed` plus what the hooks dropped, filtered to elements not in `ALLOWED_TAGS` and attributes outside the allowlist or failing a hook rule (DOMPurify also lists harmless removals; those are discarded).
- `checkStructure` rules exactly: single `article` root (ignoring whitespace/comments); exactly one `h1`; every `section`, `figure`, `table` has an `id`; no duplicate `id`; every `li` whose first element child is a checkbox `input` has an `id`.

- [ ] **Step 5: Run** `npx vitest run src/lib/sanitize.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat: sanitise html specs to the semantic subset and report strays"`

---

### Task 4: `renderSpecHtml` post-processing and light/dark highlighting

**Files:**
- Create: `superspec/src/lib/assetsrc.ts`, `superspec/src/lib/assetsrc.test.ts`
- Modify: `superspec/src/lib/render.ts`, `superspec/src/lib/highlight.ts:3,17,19`
- Test: `superspec/src/lib/render.test.ts`, `superspec/src/lib/highlight.test.ts`

**Interfaces:**
- Consumes: `sanitizeSpec`, `checkStructure` (Task 3); `highlightToHtml` (`highlight.ts:14`).
- Produces:
  - `export function assetSrc(specPath: string, src: string): string | null` — `null` for anything with a scheme, `//`, a leading `/`, or that normalises outside `dirname(specPath)`; else `` `/api/asset?path=${encodeURIComponent(abs)}` ``. Pure POSIX string normalisation (no `node:path`; runs in the browser).
  - `export interface RenderedSpec { html: string; removed: string[]; problems: string[] }`
  - `export async function renderSpecHtml(source: string, specPath: string): Promise<RenderedSpec>`
  - Reader-added markup carries `data-sr-added` (heading anchors) — Task 9 relies on this marker.
  - Every `input[type=checkbox]` in the output carries `disabled`; `checked` is left exactly as the file has it. (`container(html)` in tests builds a `div` with that `innerHTML`.)

- [ ] **Step 1: Write failing tests**

```ts
const spec = '/r/p/.claude/worktrees/w/docs/superpowers/specs/2026-11-13-foo-design.html';
expect(assetSrc(spec, 'assets/2026-11-13-foo-design/shot.png'))
  .toBe('/api/asset?path=' + encodeURIComponent('/r/p/.claude/worktrees/w/docs/superpowers/specs/assets/2026-11-13-foo-design/shot.png'));
expect(assetSrc(spec, './assets/a/b.mp4')).toContain(encodeURIComponent('/specs/assets/a/b.mp4'));
for (const s of ['https://x/a.png', '//x/a.png', '/etc/a.png', 'data:image/png;base64,AA', '../../../../x.png'])
  expect(assetSrc(spec, s)).toBeNull();
```
`render.test.ts` (jsdom), on the `sample-spec.html` fixture:
```ts
const out = await renderSpecHtml(fixture('sample-spec.html'), spec);
expect(out.removed).toEqual([]); expect(out.problems).toEqual([]);
expect(out.html).toContain('class="shiki'); // only for pre>code[data-lang]
// heading anchors: h2 of section#problem gets one; h3#path-rule uses its own id
expect(out.html).toMatch(/<h2[^>]*>Problem<a [^>]*data-sr-added[^>]*href="#problem"/);
expect(out.html).toMatch(/href="#path-rule"/);
const ext = await renderSpecHtml('<article><header><h1>T</h1></header><p><a href="https://x.dev">x</a> <a href="#y">y</a></p></article>', spec);
expect(ext.html).toContain('target="_blank"'); expect(ext.html).toContain('rel="noopener"');
expect(ext.html.match(/target=/g)?.length).toBe(1);
const img = await renderSpecHtml('<article><header><h1>T</h1></header><figure id="f"><img src="assets/x/a.png" alt="a"><video src="https://x/v.mp4"></video></figure></article>', spec);
expect(img.html).toContain('src="/api/asset?path='); expect(img.html).not.toContain('https://x/v.mp4');
// checkboxes are display only: all disabled, checked state as in the file
const plan = container((await renderSpecHtml(fixture('sample-plan.html'), spec)).html);
expect([...plan.querySelectorAll('input[type="checkbox"]')].map((b) => [b.hasAttribute('disabled'), b.hasAttribute('checked')]))
  .toEqual([[true, true], [true, false], [true, false]]);
```
Add `pre > code[data-lang="ts"]` to a case and assert `class="shiki`; a `pre > code` without `data-lang` stays un-highlighted. Existing `renderMarkdown` tests stay green. `highlight.test.ts` › `emits both light and dark colours` → `expect(html).toContain('--shiki-dark')`.

- [ ] **Step 2: Run** `npx vitest run src/lib/render.test.ts src/lib/assetsrc.test.ts src/lib/highlight.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

- `highlightToHtml`: `themes: { light: 'github-light', dark: 'github-dark' }` (default colour stays light; `spec.css` selects dark by media query, Task 6). *Builder's call: the light document theme needs light code.*
- `renderSpecHtml`: `sanitizeSpec(source, (s) => assetSrc(specPath, s))` → `checkStructure` on the fragment → post-process the fragment: replace each `pre` whose `code` has `data-lang` with `highlightToHtml(code.textContent, lang)`; every checkbox `input` gets `disabled`; `a[href]` with an `http(s):` scheme gets `target="_blank" rel="noopener"`; for each `h1`–`h4`, anchor id = the parent `section`'s id when the heading is that section's first element child, else the heading's own id; if there is one, append `<a data-sr-added href="#id" aria-label="Link to this section">#</a>`. Serialise via a container's `innerHTML`.

- [ ] **Step 4: Run** the Step 2 command — Expected: PASS. Then `npm test`.

- [ ] **Step 5: Commit** — `git commit -m "feat: render html specs with highlighting, asset links, heading anchors and disabled checkboxes"`

---

### Task 5: Asset endpoint

**Files:**
- Create: `superspec/src/lib/server/assets.ts`, `superspec/src/lib/server/assets.test.ts`, `superspec/src/routes/api/asset/+server.ts`
- Modify: `superspec/src/lib/server/paths.ts`
- Test: `superspec/src/lib/server/paths.test.ts`, `superspec/src/lib/server/assets.test.ts`

**Interfaces:**
- Produces:
  - `export function assertAssetPath(p: string, root: string = PROJECTS_ROOT): string` (paths.ts; throws the same `status: 400` error shape as `bad()` at `paths.ts:4`)
  - `export const ASSET_TYPES: Record<string, string>` — `png image/png`, `jpg`/`jpeg image/jpeg`, `gif image/gif`, `webp image/webp`, `mp4 video/mp4`, `webm video/webm`
  - `export function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null` (`null` = no/ignored header → full body)

- [ ] **Step 1: Write failing tests**

```ts
const ok = join(ROOT, 'p/.claude/worktrees/w/docs/superpowers/specs/assets/2026-11-13-foo-design/shot.png');
expect(assertAssetPath(ok, ROOT)).toBe(ok);
expect(assertAssetPath(join(ROOT, 'p/docs/superpowers/plans/assets/x/v.webm'), ROOT)).toBeTruthy();
expect(assertAssetPath(join(ROOT, 'p/docs/superpowers/specs/assets/x/SHOT.PNG'), ROOT)).toBeTruthy(); // builder's call: case-insensitive ext
for (const bad of [
  join(ROOT, 'p/docs/superpowers/specs/assets/../../../../../etc/x.png'), // traversal
  '/etc/x.png',                                                           // outside root
  join(ROOT, 'p/docs/superpowers/assets/x/a.png'),                        // assets directly under superpowers
  join(ROOT, 'p/docs/superpowers/specs/a.png'),                           // not in assets/
  join(ROOT, 'p/src/assets/a.png'),                                       // not under docs/superpowers
  join(ROOT, 'p/docs/superpowers/specs/assets/x/a.svg'),                  // svg not served
  join(ROOT, 'p/docs/superpowers/specs/assets/x/mock.html')
]) expect(() => assertAssetPath(bad, ROOT)).toThrow();
expect(parseRange(null, 100)).toBeNull();
expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
expect(parseRange('bytes=95-200', 100)).toEqual({ start: 95, end: 99 });
expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
expect(parseRange('bytes=0-1,5-6', 100)).toBeNull(); // multi-range ignored → full body
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/paths.test.ts src/lib/server/assets.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

- `assertAssetPath`: `resolve(p)`, inside root, then the path after `/docs/superpowers/` must be `<type>/assets/<one or more segments>` with `<type> !== 'assets'`; extension (lowercased) must be a key of `ASSET_TYPES`.
- Route `GET`: `?path=` required (400), `assertAssetPath` (400 on throw), `stat` (404 if missing or not a file). Headers `Content-Type` from `ASSET_TYPES`, `Accept-Ranges: bytes`. With a range: 206 + `Content-Range: bytes start-end/size` + stream that slice (`createReadStream(path, { start, end })` → `Readable.toWeb`); `'unsatisfiable'` → 416 with `Content-Range: bytes */size`; otherwise 200 full stream.

- [ ] **Step 4: Run** the Step 2 command, then `npm run check` — Expected: PASS.

- [ ] **Step 5: Manual check** — `npm run dev`; `curl -sI "http://127.0.0.1:4510/api/asset?path=<abs png under a specs/assets dir>"` shows `200`, `Content-Type: image/png`; with `-H 'Range: bytes=0-9'` shows `206` and `Content-Range: bytes 0-9/<size>`. Stop the server.

- [ ] **Step 6: Commit** — `git commit -m "feat: serve spec assets with content types and range support"`

---

### Task 6: One stylesheet replaces `prose`

**Files:**
- Create: `superspec/static/spec.css`
- Modify: `superspec/src/app.html` (link), `superspec/src/app.css:2,7-16`, `superspec/src/lib/components/Editor.svelte:196`, `superspec/package.json` (drop `@tailwindcss/typography`)

**Interfaces:**
- Produces: the rendered-document container class `spec-doc`. Every rule in `spec.css` is scoped under `.spec-doc`; a published page would wrap the `article` in `<main class="spec-doc">`. *Builder's call: scoping keeps the app chrome untouched while the file stays standalone.*

- [ ] **Step 1: Write `superspec/static/spec.css`**

Start from the mockup `<style>` (lines 9-69), then: rescope every selector under `.spec-doc`; theme variables on `.spec-doc` (light) with `@media (prefers-color-scheme: dark)` overrides, plus `color-scheme` set to match; delete `.mock-note`, `.copy`, the `figure.table` rule (replace with `.spec-doc figure:has(> table) { overflow-x: auto }`) and the `h2 a`/`h3 a` rules (replace with styles for `a[data-sr-added]`: muted, shown on heading hover); links underlined, nothing else underlined; add `aside[data-kind='warning'|'question']` variants; `li > input[type=checkbox]:first-child` alignment for checklists (`ol:has(> li > input[type=checkbox])` drops list markers); `img, video { max-width: 100% }`; Shiki: `pre.shiki` takes `var(--panel)` background, and under the dark media query `.shiki, .shiki span { color: var(--shiki-dark) !important }`. The same rules must style marked's output (`h1`–`h6`, `table`, `blockquote`, `pre`, `ul`/`ol`, GFM task-list `input`), so old specs get the same look.

- [ ] **Step 2: Wire it** — `superspec/src/app.html` head: `<link rel="stylesheet" href="%sveltekit.assets%/spec.css" />`. Remove `@plugin '@tailwindcss/typography'` and the two `.prose` blocks from `app.css` (keep `:root`, background, `shake`). `npm uninstall @tailwindcss/typography`. In `Editor.svelte:196` replace `prose prose-invert prose-base max-w-none bg-neutral-900` with `spec-doc`, and wrap `{@html html}` in `<article>`.

- [ ] **Step 3: Verify** — `rg -n "prose" src` returns nothing; `npm test`; `npm run check`; `npm run build` — Expected: all succeed.

- [ ] **Step 4: Manual check** — `npm run dev`, open an existing `.md` spec: serif body, sans headings, tables ruled, code blocks on the panel colour; flip macOS appearance to Light: the document goes light, the tab strip stays dark.

- [ ] **Step 5: Commit** — `git commit -m "feat: style rendered specs with one standalone stylesheet"`

---

### Task 7: Single pane with a source toggle

**Files:**
- Create: `superspec/src/lib/scrollratio.ts`, `superspec/src/lib/scrollratio.test.ts`, `superspec/src/lib/components/DocPane.svelte`
- Modify: `superspec/src/lib/components/Editor.svelte` (remove preview, lines 25-54, 66-89 scroll sync, 193-208 layout), `superspec/src/routes/+page.svelte:4,274-276`, `superspec/package.json` (add `@codemirror/lang-html`)

**Interfaces:**
- Consumes: `renderMarkdown`, `renderSpecHtml` (Task 4), `specKind` (Task 1).
- Produces:
  - `scrollratio.ts`: `interface Scrollable { scrollTop: number; scrollHeight: number; clientHeight: number }`, `export function scrollRatio(el: Scrollable): number`, `export function scrollTopFor(ratio: number, el: Scrollable): number`
  - `Editor.svelte` props: `{ content: string; onInput: (v: string) => void; readOnly?: boolean; kind: SpecKind; initialScrollRatio?: number; onScrollRatio?: (r: number) => void }`
  - `DocPane.svelte` props: `{ path: string; content: string; readOnly: boolean; onInput: (v: string) => void }`
  - sessionStorage key `sr:view` = `'rendered' | 'source'` (per session, not per file; *builder's call: sessionStorage is exactly "per session"*)

- [ ] **Step 1: Write failing tests**

```ts
expect(scrollRatio({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 })).toBe(0);
expect(scrollRatio({ scrollTop: 50, scrollHeight: 200, clientHeight: 100 })).toBe(0.5);
expect(scrollTopFor(0.5, { scrollTop: 0, scrollHeight: 1100, clientHeight: 100 })).toBe(500);
expect(scrollTopFor(0.7, { scrollTop: 0, scrollHeight: 80, clientHeight: 100 })).toBe(0);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/scrollratio.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `scrollratio.ts`** (lift `pct` from `Editor.svelte:73-76`), then run again — Expected: PASS.

- [ ] **Step 4: Rework `Editor.svelte` to source-only** — language via a `Compartment`: `markdown({ codeLanguages: languages })` for `'markdown'`, `html()` from `@codemirror/lang-html` for `'html'`; extend `mdHighlight` with `tags.tagName`, `tags.attributeName`, `tags.attributeValue`, `tags.angleBracket`. Keep the external-change `diffRange` effect and the read-only compartment. Apply `initialScrollRatio` once after mount (rAF); report `onScrollRatio` on scroll.

- [ ] **Step 5: Build `DocPane.svelte`** — a header row with the toggle (Rendered / Source) and, for `.html`, the notice; then either the rendered container (`class="spec-doc"`, scrollable, `{@html}`) or `<Editor kind=… />`. Rendering uses the version-guard pattern from `Editor.svelte:32-54` (keep previous HTML until the new render resolves). `.md` → `<article>{@html renderMarkdown}</article>`; `.html` → `renderSpecHtml(content, path)`. Notice: hidden when `removed` and `problems` are empty; otherwise a compact disclosure listing both (look is builder's call per spec). Toggling records the outgoing pane's `scrollRatio` and applies it to the incoming one. On an external content change, restore the rendered pane's ratio after the render lands. In `+page.svelte` replace `<Editor …>` with `<DocPane path={selectedPath} {content} {readOnly} onInput={handleInput} />`.

- [ ] **Step 6: Verify** — `npm test`; `npm run check` — Expected: PASS.

- [ ] **Step 7: Manual check** — copy `superspec/src/lib/fixtures/sample-spec.html` to `docs/superpowers/specs/2026-11-13-sample-spec.html` in this worktree; `npm run dev`. The spec is listed with title "Worktree→main path fallback, with main as read-only"; it renders with the diagram painted in text colours, the table copies cleanly into a spreadsheet, no notice. Toggle to Source: HTML highlighting; edit and wait 1s: saved; toggle back: re-rendered at the same relative scroll. Add `<span>x</span>` to a `p` in source: the notice appears. A `.md` spec also toggles. Delete the copied file before committing.

- [ ] **Step 8: Commit** — `git commit -m "feat: single rendered pane with a source toggle and html source mode"`

---

### Task 8: In-place editing core (pure functions)

**Files:**
- Create: `superspec/src/lib/inplace.ts`, `superspec/src/lib/inplace.test.ts`
- Modify: `superspec/package.json` (add `parse5`)

**Interfaces:**
- Consumes: `INLINE_TAGS`, `EDITABLE_TAGS` (Task 3).
- Produces:
  ```ts
  export interface Range { start: number; end: number }
  export interface Editable { tag: string; range: Range | null } // null: no end tag in source → not editable
  export interface TreeAdapter<N> { tag(n: N): string | null; children(n: N): N[]; skip?(n: N): boolean }
  export function collectEditables<N>(root: N, a: TreeAdapter<N>): N[]
  export function locateEditables(source: string): Editable[]
  export function cleanInline(html: string): string
  export function spliceRange(source: string, range: Range, replacement: string): string
  ```
  **The editable rule** (one implementation, `collectEditables`, used by both the parse5 side here and the DOM side in Task 9): pre-order; never descend into `pre` or `svg`; an element is editable iff its tag is in `EDITABLE_TAGS` and every descendant is text or an `INLINE_TAGS` element — except an `li` may also have a checkbox `input` as its first element child. For such an `li`, `range.start` is the end offset of that `input` tag. Editables never nest (a `td` holding a `p` is not editable; the `p` is).

- [ ] **Step 1: Write failing tests**

```ts
const spec = fixture('sample-spec.html');
const eds = locateEditables(spec);
// editable set on the fixture: header h1/p, h2s, p's, aside (bare text + strong), dt/dd, figcaption, caption, th, td, h3, summary
expect(eds.map((e) => e.tag)).toContain('aside');
expect(eds.some((e) => e.tag === 'pre' || e.tag === 'text')).toBe(false);
const firstP = eds.find((e) => e.tag === 'p' && spec.slice(e.range!.start, e.range!.end).startsWith('When a worktree'))!;
expect(spec.slice(firstP.range!.start, firstP.range!.end)).toContain('the tab can\'t be switched to.');
// confined diff: one paragraph of a multi-section spec with tables and a diagram
const edited = spliceRange(spec, firstP.range!, 'Replaced <code>text</code>.');
const before = spec.slice(0, firstP.range!.start), after = spec.slice(firstP.range!.end);
expect(edited.startsWith(before)).toBe(true); expect(edited.endsWith(after)).toBe(true);
expect(edited.length).toBe(before.length + 'Replaced <code>text</code>.'.length + after.length);
// unclosed element
expect(locateEditables('<article><p>a<p>b</p></article>')[0].range).toBeNull(); // test: marks an element with no end tag as not editable
// cleanInline
expect(cleanInline('a <b>bold</b> <i>it</i>')).toBe('a <strong>bold</strong> <em>it</em>');
expect(cleanInline('x<span style="color:red">y</span><div>z</div>')).toBe('xyz');
expect(cleanInline('<a href="https://x" target="_blank" rel="noopener">l</a>')).toBe('<a href="https://x">l</a>');
expect(cleanInline('<code data-k="1" id="c">c</code><u>u</u>')).toBe('<code data-k="1" id="c">c</code>u');
expect(cleanInline('t<a data-sr-added href="#s">#</a>')).toBe('t');
expect(cleanInline('a' + String.fromCharCode(160) + 'b')).toBe('a b'); // builder's call: contenteditable injects nbsp for spaces
// test: checklist li range starts after the checkbox
const plan = fixture('sample-plan.html');
const s3 = locateEditables(plan).find((e) => plan.slice(e.range?.start ?? 0, e.range?.end ?? 0).includes('Commit with'))!;
expect(s3.tag).toBe('li');
expect(plan.slice(s3.range!.start, s3.range!.end).trim()).toBe('Commit with <code>git</code>');
const spliced = spliceRange(plan, s3.range!, ' Commit it');
expect(spliced).toContain('<li id="t1-s3"><input type="checkbox"> Commit it</li>'); // checkbox untouched
// test: an item holding a pre is not editable (t1-s2)
expect(locateEditables(plan).some((e) => e.range && plan.slice(e.range.start, e.range.end).includes('Run it'))).toBe(false);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/inplace.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `npm install parse5`; `parseFragment(source, { sourceCodeLocationInfo: true })`; inner range is `startTag.endOffset`…`endTag.startOffset` (absent `endTag` → `null`). `cleanInline` parses with parse5 too (no DOM; runs in node tests and the browser): keep text and `INLINE_TAGS`, map `b`→`strong`, `i`→`em`, unwrap everything else keeping its text, drop elements with `data-sr-added` entirely, keep only `id`, `data-*` (except `data-sr-*`), `aria-*`, and `href` on `a`; serialise. `input` is not in `INLINE_TAGS`, so `cleanInline` drops a stray checkbox like any other non-inline element.

- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: pure source splicing for in-place text edits"`

---

### Task 9: In-place editing in the pane

**Files:**
- Create: `superspec/src/lib/inplaceDom.ts`, `superspec/src/lib/inplaceDom.test.ts` (jsdom)
- Modify: `superspec/src/lib/components/DocPane.svelte`

**Interfaces:**
- Consumes: `collectEditables`, `locateEditables`, `cleanInline`, `spliceRange`, `Editable` (Task 8); `renderSpecHtml` (Task 4).
- Produces:
  ```ts
  export function collectRenderedEditables(root: ParentNode): HTMLElement[]   // DOM adapter; skips [data-sr-added]
  export function editedInner(el: HTMLElement): string                       // innerHTML minus a leading checkbox, through cleanInline
  export function editingAligned(rendered: HTMLElement[], source: Editable[]): boolean // same length and tag sequence
  ```

- [ ] **Step 1: Write failing tests**

```ts
const src = fixture('sample-spec.html');
const root = container((await renderSpecHtml(src, SPEC)).html);
expect(collectRenderedEditables(root).map((e) => e.tagName.toLowerCase()))
  .toEqual(locateEditables(src).map((e) => e.tag));                     // rendered and source agree
const planSrc = fixture('sample-plan.html');
const planRoot = container((await renderSpecHtml(planSrc, SPEC)).html);
expect(collectRenderedEditables(planRoot).map((e) => e.tagName.toLowerCase()))
  .toEqual(locateEditables(planSrc).map((e) => e.tag));
// test: editedInner excludes the leading checkbox
const li = planRoot.querySelector('li#t1-s3') as HTMLElement;
expect(editedInner(li).trim()).toBe('Commit with <code>git</code>');
expect(editedInner(li)).not.toContain('input');
// editedInner drops reader-added markup
const h2 = [...root.querySelectorAll('h2')][0] as HTMLElement;
expect(editedInner(h2)).toBe('Problem');
const p = container('<p>see <a href="https://x" target="_blank" rel="noopener">x</a></p>').firstElementChild as HTMLElement;
expect(editedInner(p)).toBe('see <a href="https://x">x</a>');
// disables editing when rendered and source editables disagree
const stray = '<article><header><h1>T</h1></header><p>a<span>b</span></p></article>';
const strayRoot = container((await renderSpecHtml(stray, SPEC)).html);
// source p has a non-inline child → not editable; rendered p (span stripped) is → mismatch
expect(editingAligned(collectRenderedEditables(strayRoot), locateEditables(stray))).toBe(false);
expect(editingAligned(collectRenderedEditables(root), locateEditables(src))).toBe(true);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/inplaceDom.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `inplaceDom.ts`**, run again — Expected: PASS.

- [ ] **Step 4: Wire into `DocPane.svelte`** (`.html`, rendered view, not `readOnly` only)

- After each render: if `removed` is non-empty or `editingAligned` is false, editing is off and the notice adds "In-place editing is off for this file". Otherwise set `contenteditable="true"` on each rendered editable whose source `range` is non-null; set `contenteditable="false"` on `[data-sr-added]` and on a checklist item's leading `input`.
- `input` on editable *i*: `next = spliceRange(content, locateEditables(content)[i].range!, editedInner(el))` (re-locate against the current source every time, so earlier splices never leave stale offsets); remember `next` as `lastEmitted`; call `onInput(next)`.
- When `content` changes and equals `lastEmitted`, do **not** re-render (the DOM already shows it; re-rendering would drop the caret). Any other change re-renders as today (external reload, toggle).
- `keydown` Enter → `preventDefault()`. `paste` → `preventDefault()` and insert `clipboardData.getData('text/plain')` at the selection (*builder's call:* `document.execCommand('insertText', …)`, which keeps the browser's undo stack).
- Checkboxes are not wired: they arrive `disabled` from `renderSpecHtml` (Task 4) and nothing here changes that.
- Autosave, mtime conflict and the 3s external poll are unchanged: everything flows through `onInput` → `handleInput` (`+page.svelte:176`).

- [ ] **Step 5: Verify** — `npm test`; `npm run check` — Expected: PASS.

- [ ] **Step 6: Manual check** — copy `sample-spec.html` to `docs/superpowers/specs/2026-11-13-sample-spec.html` and `sample-plan.html` to `docs/superpowers/plans/2026-11-13-sample-spec.html` in this worktree (same slug, so the plan nests under the spec). Edit one word in a paragraph; after save, `git diff --no-index src/lib/fixtures/sample-spec.html docs/superpowers/specs/2026-11-13-sample-spec.html` shows one hunk inside that paragraph only. In the plan, edit the text of `t1-s3`: the diff against `sample-plan.html` leaves its `<input type="checkbox">` untouched; clicking any checkbox does nothing. Enter does nothing; pasting rich text inserts plain text. Open a main-checkout file: no caret, checkboxes disabled. Edit the file externally: it reloads with the toast. Delete both copies.

- [ ] **Step 7: Commit** — `git commit -m "feat: edit html spec text in place"`

---

### Task 10: `docs/spec-format.md`

**Files:**
- Create: `docs/spec-format.md`
- Test: `superspec/src/lib/specformat.test.ts` (jsdom)

**Interfaces:**
- Consumes: `renderSpecHtml` (Task 4).
- Produces: a standalone reference containing two fenced ` ```html ` examples, the first spec-shaped, the second plan-shaped.

- [ ] **Step 1: Write failing test** — `specformat.test.ts` › `every html example in docs/spec-format.md is a valid spec`: extract each ` ```html ` fence from `docs/spec-format.md`; expect exactly 2 or more, and for each `renderSpecHtml(example, SPEC)` returns `removed` `[]` and `problems` `[]`. Second test: the plan example contains `type="checkbox"` and at least one `checked`.

- [ ] **Step 2: Run** `npx vitest run src/lib/specformat.test.ts` — Expected: FAIL (file missing).

- [ ] **Step 3: Write the doc** — the spec's "The format" section rewritten for an agent who has only this file: fragment rule; allowed elements and attributes (with Checklists); the never-list; the semantic rules (one `h1` in `header`, ids on `section`/`figure`/`table`/checklist `li`, captions, `th scope`, diagram `figure`+`figcaption`+`svg title`); Checklists (bare `checked`, an agent ticks a step by adding it); Diagrams (node/edge/group markup and the four modifier classes); Media (`assets/<spec-stem>/` beside the file inside the type dir, the extension list, no remote `src`); file naming (`YYYY-MM-DD-<slug>-design.html` for specs, `YYYY-MM-DD-<slug>.html` for plans). Then a complete spec example (header, two sections, a table, a small diagram, a callout) and a complete plan example (header, one task `section` with a checklist mirroring the plan step pattern, including one item that holds a `pre > code[data-lang]`).

- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "docs: standalone reference for the semantic html spec format"`

---

### Task 11 (stretch, skippable): bold/italic and list-item add/remove

Nothing else depends on this task. Skip it without touching Tasks 1-10.

**Files:**
- Modify: `superspec/src/lib/inplace.ts`, `superspec/src/lib/inplace.test.ts`, `superspec/src/lib/inplaceDom.ts`, `superspec/src/lib/components/DocPane.svelte`

**Interfaces:**
- Consumes: Task 8 functions.
- Produces:
  ```ts
  export function locateListInner(source: string, li: Editable): Range | null   // inner range of the li's parent ul/ol
  export function addListItemAfter(source: string, li: Editable): string        // new empty sibling li after it
  export function removeEmptyListItem(source: string, li: Editable): string
  ```

- [ ] **Step 1: Write failing tests** — `addListItemAfter` on the second `li` of `<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>` yields `<ul>\n  <li>a</li>\n  <li>b</li>\n  <li></li>\n</ul>` (indentation copied from the preceding item); in a checklist, the new item is `<li id="<prev-id>-n"><input type="checkbox"> </li>` (*builder's call: ids must stay unique*); `removeEmptyListItem` restores the original string exactly; on the `sample-spec.html` fixture both changes are confined to the parent list's inner range. `cleanInline('<b>x</b>')` stays `<strong>x</strong>` (already covered) and no path ever emits `<u>`, `<b>` or `<i>`.

- [ ] **Step 2: Run** `npx vitest run src/lib/inplace.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the three functions, then in `DocPane.svelte`: Cmd-B / Cmd-I wrap or unwrap the selection in `strong` / `em` (DOM range ops, then the normal `editedInner` → splice path); Cmd-U `preventDefault()` and nothing else; Enter at the end of an `li` → `addListItemAfter`, then re-render and place the caret in the new item; Backspace in an empty `li` → `removeEmptyListItem`, caret to the end of the previous item. Turning a paragraph into a list (or back) is not included.

- [ ] **Step 4: Run** `npm test`, `npm run check` — Expected: PASS. Manual: Cmd-B on a word, then the source shows `<strong>`; Cmd-U does nothing.

- [ ] **Step 5: Commit** — `git commit -m "feat: bold, italic and list items in the in-place editor"`

---

## Open questions

1. **Checklist items that hold blocks are not text-editable in place.** The spec's own example (`t1-s2`, text followed by a `pre`) falls under "every descendant inline", so its text is edited in the source. Plans will be full of these once they move to HTML. Recommendation: accept for now; if it chafes, a follow-up can make the leading text run of such an `li` editable as its own range.
2. **Hand-converted sample spec location.** The fixtures live in `superspec/src/lib/fixtures/` and are copied into `docs/superpowers/` only during manual checks, so nothing test-only lands on main as a "spec". Recommendation: keep it that way.
