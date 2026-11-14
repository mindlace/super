import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locateEditables, cleanInline, spliceRange } from './inplace';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('locateEditables', () => {
  const spec = fixture('sample-spec.html');

  it('finds the editable elements of the sample spec', () => {
    const eds = locateEditables(spec);
    expect(eds.map((e) => e.tag)).toContain('aside');
    expect(eds.some((e) => e.tag === 'pre' || e.tag === 'text')).toBe(false);
  });

  it('splices one paragraph without touching any other byte', () => {
    const eds = locateEditables(spec);
    const firstP = eds.find(
      (e) => e.tag === 'p' && spec.slice(e.range!.start, e.range!.end).startsWith('When a worktree')
    )!;
    expect(spec.slice(firstP.range!.start, firstP.range!.end)).toContain(
      "the tab can't be switched to."
    );
    const edited = spliceRange(spec, firstP.range!, 'Replaced <code>text</code>.');
    const before = spec.slice(0, firstP.range!.start);
    const after = spec.slice(firstP.range!.end);
    expect(edited.startsWith(before)).toBe(true);
    expect(edited.endsWith(after)).toBe(true);
    expect(edited.length).toBe(before.length + 'Replaced <code>text</code>.'.length + after.length);
  });

  it('marks an element with no end tag as not editable', () => {
    expect(locateEditables('<article><p>a<p>b</p></article>')[0].range).toBeNull();
  });

  it('does not nest: a td holding a p yields the p only', () => {
    const eds = locateEditables('<table><tr><td><p>x</p></td></tr></table>');
    expect(eds.map((e) => e.tag)).toEqual(['p']);
  });

  it('treats an element containing a comment as not editable', () => {
    expect(locateEditables('<p>a<!-- c -->b</p>')).toEqual([]);
  });

  it('does not descend into svg', () => {
    expect(locateEditables('<svg><text>t</text></svg>')).toEqual([]);
  });

  it('starts a checklist item after its checkbox', () => {
    const plan = fixture('sample-plan.html');
    const s3 = locateEditables(plan).find((e) =>
      plan.slice(e.range?.start ?? 0, e.range?.end ?? 0).includes('Commit with')
    )!;
    expect(s3.tag).toBe('li');
    expect(plan.slice(s3.range!.start, s3.range!.end).trim()).toBe('Commit with <code>git</code>');
    const spliced = spliceRange(plan, s3.range!, ' Commit it');
    expect(spliced).toContain('<li id="t1-s3"><input type="checkbox"> Commit it</li>');
  });

  it('does not edit an item that holds a pre', () => {
    const plan = fixture('sample-plan.html');
    expect(
      locateEditables(plan).some(
        (e) => e.range && plan.slice(e.range.start, e.range.end).includes('Run it')
      )
    ).toBe(false);
  });
});

describe('cleanInline', () => {
  it('maps b and i to strong and em', () => {
    expect(cleanInline('a <b>bold</b> <i>it</i>')).toBe('a <strong>bold</strong> <em>it</em>');
  });
  it('unwraps disallowed elements keeping their text', () => {
    expect(cleanInline('x<span style="color:red">y</span><div>z</div>')).toBe('xyz');
  });
  it('keeps only href on links', () => {
    expect(cleanInline('<a href="https://x" target="_blank" rel="noopener">l</a>')).toBe(
      '<a href="https://x">l</a>'
    );
  });
  it('keeps id and data attributes, unwraps u', () => {
    expect(cleanInline('<code data-k="1" id="c">c</code><u>u</u>')).toBe(
      '<code data-k="1" id="c">c</code>u'
    );
  });
  it('drops reader-added elements', () => {
    expect(cleanInline('t<a data-sr-added href="#s">#</a>')).toBe('t');
  });
  it('turns nbsp into a plain space', () => {
    expect(cleanInline('a' + String.fromCharCode(160) + 'b')).toBe('a b');
  });
  it('re-escapes text and keeps br', () => {
    expect(cleanInline('a &lt; b &amp; c<br>d')).toBe('a &lt; b &amp; c<br>d');
  });
});
