// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderSpecHtml } from './render';

const SPEC = '/r/p/docs/superpowers/specs/2026-11-13-foo-design.html';
const doc = readFileSync('../docs/spec-format.md', 'utf8');
const examples = [...doc.matchAll(/```html\n([\s\S]*?)\n```/g)].map((m) => m[1]);

describe('docs/spec-format.md', () => {
  it('every html example in docs/spec-format.md is a valid spec', async () => {
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const example of examples) {
      const out = await renderSpecHtml(example, SPEC);
      expect(out.removed).toEqual([]);
      expect(out.problems).toEqual([]);
    }
  });

  it('the plan example has checkboxes, at least one checked', () => {
    const plan = examples[1];
    expect(plan).toContain('type="checkbox"');
    expect(plan).toMatch(/<input type="checkbox" checked>/);
  });
});
