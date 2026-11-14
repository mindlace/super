// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderMarkdown, renderSpecHtml } from './render';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const container = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};
const spec = '/r/p/.claude/worktrees/w/docs/superpowers/specs/2026-11-13-foo-design.html';
const wrap = (body: string) => `<article><header><h1>T</h1></header>${body}</article>`;

describe('renderSpecHtml', () => {
  it('renders the sample spec cleanly with heading anchors', async () => {
    const out = await renderSpecHtml(fixture('sample-spec.html'), spec);
    expect(out.removed).toEqual([]);
    expect(out.problems).toEqual([]);
    expect(out.html).toMatch(/<h2[^>]*>Problem<a [^>]*data-sr-added[^>]*href="#problem"/);
    expect(out.html).toMatch(/href="#path-rule"/);
  });

  it('highlights only code with data-lang', async () => {
    const hl = await renderSpecHtml(
      wrap('<pre><code data-lang="ts">const x = 1;</code></pre>'),
      spec
    );
    expect(hl.html).toContain('class="shiki');
    const plain = await renderSpecHtml(wrap('<pre><code>const x = 1;</code></pre>'), spec);
    expect(plain.html).not.toContain('class="shiki');
  });

  it('opens only external links in a new tab', async () => {
    const ext = await renderSpecHtml(
      wrap('<p><a href="https://x.dev">x</a> <a href="#y">y</a></p>'),
      spec
    );
    expect(ext.html).toContain('target="_blank"');
    expect(ext.html).toContain('rel="noopener"');
    expect(ext.html.match(/target=/g)?.length).toBe(1);
  });

  it('rewrites asset src and drops remote src', async () => {
    const img = await renderSpecHtml(
      wrap(
        '<figure id="f"><img src="assets/x/a.png" alt="a"><video src="https://x/v.mp4"></video></figure>'
      ),
      spec
    );
    expect(img.html).toContain('src="/api/asset?path=');
    expect(img.html).not.toContain('https://x/v.mp4');
    expect(img.removed.length).toBeGreaterThan(0);
  });

  it('renders checkboxes disabled with the file checked state', async () => {
    const plan = container((await renderSpecHtml(fixture('sample-plan.html'), spec)).html);
    expect(
      [...plan.querySelectorAll('input[type="checkbox"]')].map((b) => [
        b.hasAttribute('disabled'),
        b.hasAttribute('checked')
      ])
    ).toEqual([
      [true, true],
      [true, false],
      [true, false]
    ]);
  });
});

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

  it('preserves inline style attributes (token colors) through sanitization', async () => {
    const out = await renderMarkdown('```ts\nconst x = 1;\n```');
    expect(out).toContain('style="color:');
  });
});
