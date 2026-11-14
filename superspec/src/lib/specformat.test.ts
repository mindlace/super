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

  it('a two-diagram spec with one arrow marker is valid', async () => {
    const marker =
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z"/></marker></defs>';
    const fig = (id: string, defs: string) =>
      `<figure id="${id}"><svg viewBox="0 0 200 60" role="img"><title>${id}</title>${defs}` +
      '<g class="node" id="n-' + id + '-a"><rect x="5" y="5" width="60" height="30"/><text x="35" y="20">a</text></g>' +
      '<g class="node" id="n-' + id + '-b"><rect x="120" y="5" width="60" height="30"/><text x="150" y="20">b</text></g>' +
      `<g class="edge" data-from="n-${id}-a" data-to="n-${id}-b"><path d="M65 20H118"/></g>` +
      `</svg><figcaption>${id}</figcaption></figure>`;
    const src = `<article><header><h1>T</h1></header><section id="sec-a"><h2>A</h2>${fig('fig-one', marker)}${fig('fig-two', '')}</section></article>`;
    const out = await renderSpecHtml(src, SPEC);
    expect(out.removed).toEqual([]);
    expect(out.problems).toEqual([]);
  });

  it('the plan example has checkboxes, at least one checked', () => {
    const plan = examples.find((e) => e.includes('<h1>Targeted watches plan</h1>'))!;
    expect(plan).toContain('type="checkbox"');
    expect(plan).toMatch(/<input type="checkbox" checked>/);
  });
});
