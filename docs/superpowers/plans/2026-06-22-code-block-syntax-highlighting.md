# Code-block Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give fenced code blocks full language-aware syntax highlighting in both the rendered preview pane (Shiki) and the CodeMirror source pane (Lezer grammars), and fix two adjacent readability issues.

**Architecture:** The preview gets a new `src/lib/highlight.ts` Shiki module wired into `marked` via an async `walkTokens` pass, making `renderMarkdown` async; `Editor.svelte` consumes it through a `$state`/`$effect` with a staleness guard. The editor pane enables nested-fence grammars by passing `codeLanguages` to `markdown()` and extends the existing `HighlightStyle` with code-token colors. Theme tweaks soften body text and recolor list/quote markup.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, `marked` v15, `dompurify` v3, `shiki`, CodeMirror 6 (`@codemirror/lang-markdown`, `@codemirror/language-data`, `@lezer/highlight`), Tailwind v4 + typography, Vitest (node env).

## Global Constraints

- Code style: 2-space indent, single quotes, 100-char width.
- Conventional Commits for every commit.
- Preview Shiki theme: **`github-dark`** (decided).
- Theme parity: **approximate / independent** — editor uses Lezer-native colors, preview uses Shiki; no shared-palette requirement.
- Vitest runs in the **node** environment (`src/**/*.test.ts`). No jsdom. DOMPurify is a safe passthrough under node, so `renderMarkdown` output is assertable in tests.
- Unknown/absent fence language must degrade to plain text — never throw, never render blank.

---

### Task 1: Shiki highlight module

**Files:**
- Create: `src/lib/highlight.ts`
- Test: `src/lib/highlight.test.ts`
- Modify: `package.json` (add `shiki` dependency)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `export async function highlightToHtml(code: string, lang: string): Promise<string>` — returns a Shiki `<pre class="shiki ...">…</pre>` string for the given code, highlighted with `github-dark`. Falls back to plain-text highlighting when `lang` is empty or unrecognized.

- [ ] **Step 1: Install Shiki**

Run: `npm install shiki`
Expected: `shiki` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/highlight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { highlightToHtml } from './highlight';

describe('highlightToHtml', () => {
  it('emits token spans for a known language', async () => {
    const html = await highlightToHtml('const x = 1;', 'ts');
    expect(html).toContain('class="shiki');
    expect(html).toContain('<span'); // tokenized
    expect(html).toContain('const');
  });

  it('falls back to plain text for an unknown language without throwing', async () => {
    const html = await highlightToHtml('just some text', 'no-such-lang-xyz');
    expect(html).toContain('class="shiki');
    expect(html).toContain('just some text');
  });

  it('handles an empty language label', async () => {
    const html = await highlightToHtml('plain line', '');
    expect(html).toContain('plain line');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/highlight.test.ts`
Expected: FAIL — cannot find module `./highlight`.

- [ ] **Step 4: Implement the module**

Create `src/lib/highlight.ts`:

```ts
import { codeToHtml } from 'shiki';

const THEME = 'github-dark';

function normalizeLang(lang: string): string {
  const l = (lang ?? '').trim().toLowerCase();
  return l.length > 0 ? l : 'text';
}

/**
 * Highlight a code string to a Shiki `<pre class="shiki">` HTML string.
 * Unknown or empty languages degrade to plain text rather than throwing.
 */
export async function highlightToHtml(code: string, lang: string): Promise<string> {
  const language = normalizeLang(lang);
  try {
    return await codeToHtml(code, { lang: language, theme: THEME });
  } catch {
    return await codeToHtml(code, { lang: 'text', theme: THEME });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/highlight.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/highlight.ts src/lib/highlight.test.ts
git commit -m "feat: add shiki highlight module for fenced code blocks"
```

---

### Task 2: Async markdown rendering wired to Shiki

**Files:**
- Modify: `src/lib/render.ts`
- Test: `src/lib/render.test.ts`

**Interfaces:**
- Consumes: `highlightToHtml(code, lang)` from Task 1.
- Produces: `export async function renderMarkdown(md: string): Promise<string>` — async; fenced code blocks come back as Shiki markup, everything else as before, then sanitized.

- [ ] **Step 1: Write the failing test**

Create `src/lib/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  it('highlights a fenced code block with shiki markup', async () => {
    const out = await renderMarkdown('```ts\nconst x = 1;\n```');
    expect(out).toContain('class="shiki');
    expect(out).toContain('<span');
  });

  it('still renders ordinary markdown', async () => {
    const out = await renderMarkdown('# Hello\n\nsome **bold** text');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('does not throw on an unknown fence language', async () => {
    const out = await renderMarkdown('```no-such-lang\nabc\n```');
    expect(out).toContain('abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/render.test.ts`
Expected: FAIL — `renderMarkdown(...).toContain is not a function` (currently sync / returns a string without shiki markup).

- [ ] **Step 3: Implement async rendering**

Replace the entire contents of `src/lib/render.ts`:

```ts
import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { highlightToHtml } from './highlight';

// Stash highlighted HTML on the code token during the async walk, then emit it
// verbatim from a sync renderer. marked renderer fns cannot be async, so the
// async highlight work happens in walkTokens.
type HighlightedCode = Tokens.Code & { highlighted?: string };

const marked = new Marked({ gfm: true, breaks: false, async: true });

marked.use({
  async walkTokens(token) {
    if (token.type === 'code') {
      (token as HighlightedCode).highlighted = await highlightToHtml(token.text, token.lang ?? '');
    }
  },
  renderer: {
    code(token: Tokens.Code): string {
      const html = (token as HighlightedCode).highlighted;
      return html ?? `<pre><code>${token.text}</code></pre>`;
    }
  }
});

export async function renderMarkdown(md: string): Promise<string> {
  const html = (await marked.parse(md)) as string;
  return DOMPurify.sanitize(html);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/render.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/render.ts src/lib/render.test.ts
git commit -m "feat: render fenced code blocks through shiki in markdown preview"
```

---

### Task 3: Consume async preview in Editor + blend Shiki background

**Files:**
- Modify: `src/lib/components/Editor.svelte` (preview html derivation, ~lines 19, 101-109 region)
- Modify: `src/app.css`

**Interfaces:**
- Consumes: `renderMarkdown(md): Promise<string>` from Task 2.
- Produces: nothing for later tasks (UI wiring).

- [ ] **Step 1: Replace the sync derived html with guarded async state**

In `src/lib/components/Editor.svelte`, replace this line:

```ts
  let html = $derived(renderMarkdown(content));
```

with:

```ts
  let html = $state('');
  let renderVersion = 0;

  // Re-render the preview whenever content changes. renderMarkdown is async
  // (Shiki); a version guard drops stale results so fast typing can't let an
  // older render overwrite a newer one. We keep the previous html until the new
  // one resolves, so the pane never flashes blank between updates.
  $effect(() => {
    const src = content;
    const version = ++renderVersion;
    renderMarkdown(src).then((out) => {
      if (version === renderVersion) html = out;
    });
  });
```

(No other JS changes — `{@html html}` at the bottom already consumes `html`.)

- [ ] **Step 2: Blend the Shiki code-block background into the prose pane**

In `src/app.css`, append (after the existing rules):

```css
/* Shiki emits an inline background on its <pre>; override it so highlighted
   code blocks match the prose code background instead of github-dark's. */
.prose :where(pre.shiki) {
  background-color: #1c1c1c !important;
}
```

- [ ] **Step 3: Manually verify the preview pane**

Run: `npm run dev`
Open `http://127.0.0.1:4510`, select a spec containing a fenced code block (e.g. one with ` ```ts ` or ` ```bash `).
Expected: the **left preview pane** shows multi-color token highlighting; the code-block background blends with the pane (no jarring lighter/darker box); typing in the editor updates the preview without blanking or flicker.

- [ ] **Step 4: Run the full test + type check**

Run: `npx vitest run && npm run check`
Expected: all tests PASS, no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Editor.svelte src/app.css
git commit -m "feat: async shiki-highlighted preview with blended code background"
```

---

### Task 4: Nested-fence highlighting in the CodeMirror source pane

**Files:**
- Modify: `src/lib/components/Editor.svelte` (imports, `mdHighlight`, `markdown()` call)
- Modify: `package.json` (add `@codemirror/language-data`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing for later tasks (UI wiring).

- [ ] **Step 1: Install language-data**

Run: `npm install @codemirror/language-data`
Expected: `@codemirror/language-data` added to `dependencies`.

- [ ] **Step 2: Import the language list**

In `src/lib/components/Editor.svelte`, just below the existing `import { markdown } from '@codemirror/lang-markdown';` line, add:

```ts
  import { languages } from '@codemirror/language-data';
```

- [ ] **Step 3: Enable nested grammars in the markdown extension**

Change the `markdown()` call inside the extensions array from:

```ts
          markdown(),
```

to:

```ts
          markdown({ codeLanguages: languages }),
```

- [ ] **Step 4: Add code-token colors to the highlight style**

Replace the entire `mdHighlight` definition with the version below (existing markdown tags kept; code-token tags appended). Note `tags.function` requires the `tags` import already present.

```ts
  const mdHighlight = HighlightStyle.define([
    // Markdown structure
    { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
    { tag: tags.strong, color: '#fde68a', fontWeight: 'bold' },
    { tag: tags.emphasis, color: '#fcd34d', fontStyle: 'italic' },
    { tag: tags.link, color: '#7dd3fc', textDecoration: 'underline' },
    { tag: tags.url, color: '#7dd3fc' },
    { tag: tags.monospace, color: '#fca5a5' },
    // Code tokens inside fenced blocks
    { tag: tags.keyword, color: '#c792ea' },
    { tag: tags.controlKeyword, color: '#c792ea' },
    { tag: tags.moduleKeyword, color: '#c792ea' },
    { tag: tags.string, color: '#c3e88d' },
    { tag: tags.special(tags.string), color: '#c3e88d' },
    { tag: tags.regexp, color: '#c3e88d' },
    { tag: tags.comment, color: '#7d8590', fontStyle: 'italic' },
    { tag: tags.number, color: '#f78c6c' },
    { tag: [tags.bool, tags.null, tags.atom], color: '#ff9cac' },
    { tag: [tags.typeName, tags.className], color: '#ffcb6b' },
    { tag: tags.propertyName, color: '#82aaff' },
    { tag: tags.function(tags.variableName), color: '#82aaff' },
    { tag: tags.variableName, color: '#eeffff' },
    { tag: [tags.operator, tags.punctuation], color: '#89ddff' },
    // List / quote markup — recolored in Task 5
    { tag: tags.list, color: '#a3a3a3' },
    { tag: tags.quote, color: '#a3a3a3', fontStyle: 'italic' }
  ]);
```

- [ ] **Step 5: Manually verify the editor source pane**

Run: `npm run dev`
Open `http://127.0.0.1:4510`, select a spec with a ` ```ts `, ` ```json `, and ` ```bash ` fence.
Expected: in the **right (source) pane**, code inside the fences shows multi-color tokens (keywords, strings, numbers distinctly colored), not flat monospace. The first time each language appears there may be a brief moment before its grammar loads — that is expected (lazy load).

- [ ] **Step 6: Run tests + type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, no new type errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/components/Editor.svelte
git commit -m "feat: highlight nested fenced-code languages in the source editor"
```

---

### Task 5: Readability fixes — soften body text, de-comment list/quote markup

**Files:**
- Modify: `src/lib/components/Editor.svelte` (`darkTheme` base color, `mdHighlight` list/quote)
- Modify: `src/app.css` (prose body color)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Soften the editor base text color**

In `src/lib/components/Editor.svelte`, in the `darkTheme` definition, change:

```ts
      '&': { height: '100%', backgroundColor: '#171717', color: '#f5f5f5' },
```

to:

```ts
      '&': { height: '100%', backgroundColor: '#171717', color: '#d4d4d4' },
```

- [ ] **Step 2: Recolor list and quote markup off comment-gray**

In `src/lib/components/Editor.svelte`, in `mdHighlight`, change the final two entries from:

```ts
    { tag: tags.list, color: '#a3a3a3' },
    { tag: tags.quote, color: '#a3a3a3', fontStyle: 'italic' }
```

to:

```ts
    // List markers track body text (de-emphasized, not comment-gray);
    // quotes get a distinct non-gray accent so neither reads as a comment.
    { tag: tags.list, color: '#d4d4d4' },
    { tag: tags.quote, color: '#80cbc4', fontStyle: 'italic' }
```

- [ ] **Step 3: Soften the preview prose body color**

In `src/app.css`, append:

```css
/* Soften near-white prose body text for comfortable contrast on #171717. */
.prose-invert {
  --tw-prose-invert-body: #d4d4d4;
}
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`
Open `http://127.0.0.1:4510`, select a spec with bullet lists and `>` quotes.
Expected: body text in both panes is a comfortable light gray (not glaring white); in the source pane, list markers (`-`, `*`) read as ordinary text and `>` quotes show a teal italic — neither looks like a grayed-out comment. Comments *inside* fenced code still show gray (from Task 4).

- [ ] **Step 5: Run tests + type check**

Run: `npx vitest run && npm run check`
Expected: all PASS, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Editor.svelte src/app.css
git commit -m "style: soften body text and de-comment list/quote markup"
```

---

## Self-Review notes

- **Spec coverage:** Preview Shiki (Tasks 1–3), `.shiki` bg blend (Task 3), editor nested fences via `@codemirror/language-data` (Task 4), extended code-token `HighlightStyle` (Task 4), readability fixes — base text + list/quote (Task 5). All spec sections mapped.
- **Out of scope (per spec), not implemented:** pixel-identical parity, light mode, inline-code restyling, copy button / line numbers.
- **Async-guard:** the `renderVersion` staleness guard (Task 3) is the only mechanism preventing out-of-order Shiki results — keep it intact.
- **Manual verification:** Tasks 3–5 are Svelte/CSS visual changes with no automated test; each ends in an explicit dev-server check. Tasks 1–2 carry the automated coverage.
