# Syntax-highlighted fenced code blocks in both views

## Goal

Fenced code blocks (e.g. ` ```typescript `) should render with full,
language-aware syntax highlighting in **both** panes:

- **Preview pane** — the rendered-markdown view (`marked` output).
- **Editor pane** — the CodeMirror source view, where a fenced block currently
  shows only flat monospace styling.

"As much highlighting as can be inferred": when a fence carries a language label
we highlight to that grammar; when it carries an unknown/absent label we degrade
gracefully to plain (no crash, no empty block).

## Decisions (settled)

- **Preview engine: Shiki.** TextMate-grammar fidelity, lazy-loaded grammars,
  themeable. This is a locally-run tool, so bundle size is not a constraint.
- **Theme parity: approximate / independent.** Each pane uses its own native
  highlighter (Shiki for preview, Lezer/CodeMirror for editor). Colors live in
  the same dark family but are not pixel-identical. No shared-palette
  maintenance burden.

## Current state

- `src/lib/render.ts` — `renderMarkdown(md)` runs `marked.parse` then
  `DOMPurify.sanitize`, **synchronously**. `marked` emits
  `<pre><code class="language-x">` with no token markup; nothing highlights it.
- `src/lib/components/Editor.svelte`
  - Preview html is `let html = $derived(renderMarkdown(content))` (sync) and
    injected via `{@html html}` (line ~19, ~121).
  - CodeMirror `markdown()` is called with **no `codeLanguages`** (line ~80), so
    nested fences are not parsed as their language. `mdHighlight`
    (`HighlightStyle`, lines ~61–70) only styles markdown tags (heading, strong,
    emphasis, link, monospace, …) — no code tokens (keyword/string/comment/…).

## Design

Two independent wirings, plus a shared theme note.

### 1. Preview pane — Shiki via `marked`

New module `src/lib/highlight.ts` owns a single lazy Shiki highlighter and
exposes one async function to highlight a code string to HTML.

- Use Shiki's on-demand path (`codeToHtml` from `shiki`, or a singleton
  highlighter with lazy `loadLanguage`) so any bundled grammar loads the first
  time it is seen and is cached thereafter.
- Theme: a single Shiki **dark** theme (recommend `github-dark`). The wrapper
  `.shiki` background is overridden in CSS to match the existing prose code
  background so blocks blend into the pane rather than introducing a second
  shade.
- Unknown/missing language → highlight as plain text (`text`/no grammar). Never
  throw; the block still renders, just uncolored.

`renderMarkdown` becomes **async**. `marked` is configured with `async: true`
and a code path (custom renderer or `walkTokens`) that replaces each code
token's output with Shiki's `<pre class="shiki">…</pre>`. The default
`<pre><code>` wrapper is suppressed for highlighted blocks so we emit Shiki's
markup directly. `DOMPurify.sanitize` still runs on the final HTML — its default
allowlist keeps the `class` and inline `style` attributes Shiki emits, so token
colors survive sanitization (verified as part of implementation).

**Async rendering in `Editor.svelte`:** the preview can no longer be a sync
`$derived`. Replace with `$state` html updated by an `$effect` that awaits the
async render. Two guards:

- **Staleness guard** — each render captures a version/id; a late-resolving
  promise for older content must not overwrite newer output (prevents flicker
  and out-of-order results while typing).
- **First-paint** — render unhighlighted markdown immediately (or show prior
  html) so the pane is never blank while a grammar loads; swap to highlighted
  output when Shiki resolves.

Grammar loads are cached after first use, so steady-state typing re-highlights
fast; explicit debouncing is added only if profiling shows thrash.

### 2. Editor pane — nested fences via `@codemirror/language-data`

- Add dependency `@codemirror/language-data` and pass
  `markdown({ codeLanguages: languages })` so fenced blocks are parsed with the
  matching Lezer grammar (lazy-loaded per language).
- Extend the highlight styling so nested code tokens are actually colored.
  `mdHighlight` currently maps only markdown tags. Add a code-token tag set
  (keyword, string, comment, number, operator, variableName, typeName,
  function, propertyName, etc.) to the same or a second `HighlightStyle`, in the
  editor's existing dark palette. This is CodeMirror-native and independent of
  the Shiki theme (approximate parity, by decision above).

### 3. Theme / CSS

- Add highlight-related CSS to `src/app.css`: the `.shiki` background override
  (match prose code bg) and any wrapper spacing so highlighted `<pre>` matches
  the current prose code-block rhythm.
- Editor token colors live in the `HighlightStyle` (no CSS file needed).

### 4. Theme readability fixes (folded in)

Two existing palette issues, fixed alongside the highlighting work since they
live in the same files:

- **Base text is too stark.** Body text is near-white (`#f5f5f5` in the editor
  `darkTheme`; `prose-invert` in the preview), giving harsh contrast on the
  `#171717` background. Soften the editor base text and the preview prose body
  color to roughly `neutral-300` (`#d4d4d4`) so the default weight reads as
  comfortable rather than glaring. Headings/strong stay brighter for hierarchy.
- **List markers and `>` quotes look like comments.** In `mdHighlight`,
  `tags.list` and `tags.quote` are gray (`#a3a3a3`) — the conventional comment
  color — so they read as commented-out, not structure. Recolor them off the
  comment-gray: list markers toward the body text color (de-emphasized but not
  gray), quotes to a distinct non-gray accent (kept italic). Comment *tokens* in
  nested code keep gray; structural markdown does not.

## Out of scope

- Pixel-identical color matching between the two panes.
- A theme switcher / light mode.
- Highlighting inline code spans (`` `like this` ``) beyond current styling.
- Copy-button / line-number chrome on code blocks.

## Testing

- `src/lib/highlight.ts` — unit test (vitest): a known language (e.g. `ts`)
  produces token `<span>`s; an unknown/absent language returns a non-empty,
  unstyled-but-valid block without throwing.
- `renderMarkdown` — async, returns sanitized HTML that still contains Shiki
  token markup for a fenced block.
- Editor pane verified manually: a `js`/`ts`/`json` fence shows multi-color
  tokens in the source view.

## Affected files

- `src/lib/highlight.ts` — **new**, Shiki highlighter singleton + API.
- `src/lib/render.ts` — `renderMarkdown` becomes async; wires Shiki into
  `marked`.
- `src/lib/components/Editor.svelte` — async preview html (`$state` + `$effect`
  with staleness guard); `markdown({ codeLanguages })`; extended
  `HighlightStyle` for code tokens.
- `src/app.css` — `.shiki` background/spacing overrides.
- `package.json` — add `shiki` and `@codemirror/language-data`.
