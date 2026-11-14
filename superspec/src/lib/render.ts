import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { highlightToHtml } from './highlight';
import { sanitizeSpec } from './sanitize';
import { assetSrc } from './assetsrc';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      return html ?? `<pre><code>${escapeHtml(token.text)}</code></pre>`;
    }
  }
});

export async function renderMarkdown(md: string): Promise<string> {
  const html = (await marked.parse(md)) as string;
  return DOMPurify.sanitize(html);
}

export interface RenderedSpec {
  html: string;
  removed: string[];
  problems: string[];
}

async function highlightCodeBlocks(root: ParentNode): Promise<void> {
  for (const code of root.querySelectorAll('pre > code[data-lang]')) {
    const pre = code.parentElement!;
    const holder = document.createElement('div');
    holder.innerHTML = await highlightToHtml(
      code.textContent ?? '',
      code.getAttribute('data-lang') ?? ''
    );
    const shiki = holder.firstElementChild;
    if (shiki) pre.replaceWith(shiki);
  }
}

function addHeadingAnchors(root: ParentNode): void {
  for (const h of root.querySelectorAll('h1, h2, h3, h4')) {
    const section = h.parentElement;
    const id =
      section?.localName === 'section' && section.firstElementChild === h && section.id
        ? section.id
        : h.id;
    if (!id) continue;
    const a = document.createElement('a');
    a.setAttribute('data-sr-added', '');
    a.setAttribute('href', `#${id}`);
    a.setAttribute('aria-label', 'Link to this section');
    a.textContent = '#';
    h.append(a);
  }
}

export async function renderSpecHtml(source: string, specPath: string): Promise<RenderedSpec> {
  // sanitizeSpec already runs checkStructure and returns its problems.
  const { fragment, removed, problems } = sanitizeSpec(source, (s) => assetSrc(specPath, s));
  await highlightCodeBlocks(fragment);
  for (const box of fragment.querySelectorAll('input[type="checkbox"]')) {
    box.setAttribute('disabled', '');
  }
  for (const a of fragment.querySelectorAll('a[href]')) {
    if (/^https?:/i.test(a.getAttribute('href') ?? '')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
  }
  addHeadingAnchors(fragment);
  const holder = document.createElement('div');
  holder.append(fragment);
  return { html: holder.innerHTML, removed, problems };
}
