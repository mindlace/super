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
