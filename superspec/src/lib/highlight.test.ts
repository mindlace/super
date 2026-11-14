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

  it('emits both light and dark colours', async () => {
    const html = await highlightToHtml('const x = 1;', 'ts');
    expect(html).toContain('--shiki-dark');
  });

  it('handles an empty language label', async () => {
    const html = await highlightToHtml('plain line', '');
    expect(html).toContain('plain line');
  });
});
