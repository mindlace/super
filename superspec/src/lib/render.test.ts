// @vitest-environment jsdom
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

  it('preserves inline style attributes (token colors) through sanitization', async () => {
    const out = await renderMarkdown('```ts\nconst x = 1;\n```');
    expect(out).toContain('style="color:');
  });
});
