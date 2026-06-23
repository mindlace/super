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
