// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeSpec, checkStructure } from './sanitize';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

function frag(html: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}

describe('sanitizeSpec', () => {
  it('keeps allowed markup and reports nothing for the sample spec', () => {
    const { fragment, removed, problems } = sanitizeSpec(fixture('sample-spec.html'), (s) => s);
    expect(removed).toEqual([]);
    expect(problems).toEqual([]);
    expect(fragment.querySelector('g.node.missing#n-wt')).not.toBeNull();
    expect(fragment.querySelector('marker')?.getAttribute('refX')).toBe('9');
    expect(fragment.querySelector('aside[data-kind="decision"]')).not.toBeNull();
    expect(fragment.querySelector('th[scope="row"]')).not.toBeNull();
  });

  it('keeps the sample plan intact', () => {
    const { fragment, removed, problems } = sanitizeSpec(fixture('sample-plan.html'), (s) => s);
    expect(removed).toEqual([]);
    expect(problems).toEqual([]);
    expect(fragment.querySelectorAll('li > input[type="checkbox"]').length).toBe(3);
    expect(fragment.querySelector('li#t1-s1 > input')?.hasAttribute('checked')).toBe(true);
    expect(fragment.querySelector('li#t1-s2 > input')?.hasAttribute('checked')).toBe(false);
  });

  it('removes stray markup and reports each removal', () => {
    const bad =
      '<article><header><h1>T</h1></header><script>x()</script><style>p{}</style>' +
      '<p style="color:red" onclick="x()">a<span>b</span><u>c</u></p><p class="k">d</p>' +
      '<figure id="f"><img src="https://evil.example/a.png" alt=""><svg><rect fill="red" class="node"/></svg></figure></article>';
    const r = sanitizeSpec(bad, (s) => (/^[a-z]+:|^\/\//i.test(s) ? null : s));
    const removed = r.removed.join('\n');
    for (const t of [
      '<script>',
      '<style>',
      '<span>',
      '<u>',
      'style',
      'onclick',
      'class on <p>',
      'remote src',
      'fill'
    ])
      expect(removed).toContain(t);
    expect(r.fragment.querySelector('svg rect')?.getAttribute('class')).toBe('node');
    expect(r.fragment.textContent).toContain('b');
    expect(r.fragment.querySelector('script, style, span, u, [style], [onclick], p[class]')).toBeNull();
    expect(r.fragment.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(r.fragment.querySelector('rect')?.hasAttribute('fill')).toBe(false);
  });

  it('rewrites a kept src', () => {
    const r = sanitizeSpec(
      '<article><header><h1>T</h1></header><figure id="f"><img src="a.png" alt=""></figure></article>',
      (s) => `/asset/${s}`
    );
    expect(r.fragment.querySelector('img')?.getAttribute('src')).toBe('/asset/a.png');
    expect(r.removed).toEqual([]);
  });

  it('keeps only leading checkbox inputs in list items', () => {
    const cb = sanitizeSpec(
      '<article><header><h1>T</h1></header><ul>' +
        '<li id="a"><input type="checkbox" checked> one</li><li id="b"><input type="text"> two</li>' +
        '<li id="c"><input> three</li><li id="d">x <input type="checkbox"></li></ul>' +
        '<p><input type="checkbox"></p><select></select><button>b</button><textarea></textarea></article>',
      (s) => s
    );
    expect(cb.fragment.querySelectorAll('input').length).toBe(1);
    expect(cb.fragment.querySelector('li#a > input[type="checkbox"]')?.hasAttribute('checked')).toBe(
      true
    );
    const removed = cb.removed.join('\n');
    for (const t of ['<select>', '<button>', '<textarea>']) expect(removed).toContain(t);
    expect(removed).toContain('<input>');
  });

  it('drops type and checked on anything but input', () => {
    const r = sanitizeSpec(
      '<article><header><h1>T</h1></header><ol type="a"><li id="x" checked>s</li></ol></article>',
      (s) => s
    );
    expect(r.fragment.querySelector('ol')?.hasAttribute('type')).toBe(false);
    expect(r.fragment.querySelector('li')?.hasAttribute('checked')).toBe(false);
    expect(r.removed.join('\n')).toMatch(/type[\s\S]*checked|checked[\s\S]*type/);
  });

  it('reports script URLs and diagram elements outside an svg', () => {
    const r = sanitizeSpec(
      '<article><header><h1>T</h1></header><p><a href="javascript:x()">a</a></p>' +
        '<rect x="1"></rect><svg><a href="#x"><text>t</text></a></svg></article>',
      (s) => s
    );
    expect(r.fragment.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(r.fragment.querySelector('svg')?.childNodes.length).toBe(0);
    expect(r.fragment.querySelector('article > rect')).toBeNull();
    const removed = r.removed.join('\n');
    for (const t of ['javascript:x()', '<rect> outside <svg>', '<a> inside <svg>'])
      expect(removed).toContain(t);
  });

  it('reports structure problems on the sanitised fragment', () => {
    const r = sanitizeSpec('<article><h1>a</h1><h1>b</h1></article>', (s) => s);
    expect(r.problems.join()).toContain('exactly one <h1>, found 2');
  });
});

describe('checkStructure', () => {
  it('reports structural problems', () => {
    expect(checkStructure(frag('<p>x</p><article></article>'))).toContain(
      'expected a single <article> root'
    );
    expect(checkStructure(frag('<article><h1>a</h1><h1>b</h1></article>')).join()).toContain(
      'exactly one <h1>, found 2'
    );
    expect(
      checkStructure(
        frag('<article><header><h1>a</h1></header><section><table></table></section></article>')
      ).join()
    ).toMatch(/<section> without an id[\s\S]*<table> without an id/);
    expect(
      checkStructure(
        frag(
          '<article><header><h1>a</h1></header><section id="x"></section><figure id="x"></figure></article>'
        )
      ).join()
    ).toContain('duplicate id "x"');
    expect(
      checkStructure(
        frag(
          '<article><header><h1>a</h1></header><ol><li><input type="checkbox"> s</li></ol></article>'
        )
      ).join()
    ).toContain('checklist <li> without an id');
  });

  it('accepts a well-formed article with surrounding whitespace and comments', () => {
    expect(
      checkStructure(frag('\n<!-- c -->\n<article><header><h1>a</h1></header></article>\n'))
    ).toEqual([]);
  });
});
