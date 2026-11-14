import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addListItemAfter,
  cleanInline,
  locateEditables,
  locateListInner,
  removeEmptyListItem,
  spliceRange
} from './inplace';

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

describe('list items', () => {
  const UL = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
  const item = (src: string, text: string) =>
    locateEditables(src).find(
      (e) => e.tag === 'li' && e.range && src.slice(e.range.start, e.range.end).trim() === text
    )!;

  it('locates the inner range of the parent list', () => {
    const inner = locateListInner(UL, item(UL, 'b'))!;
    expect(UL.slice(inner.start, inner.end)).toBe('\n  <li>a</li>\n  <li>b</li>\n');
    expect(locateListInner('<p>x</p>', locateEditables('<p>x</p>')[0])).toBeNull();
  });

  it('adds an empty item after, copying the indentation of the preceding item', () => {
    expect(addListItemAfter(UL, item(UL, 'b'))).toBe(
      '<ul>\n  <li>a</li>\n  <li>b</li>\n  <li></li>\n</ul>'
    );
    expect(addListItemAfter(UL, item(UL, 'a'))).toBe(
      '<ul>\n  <li>a</li>\n  <li></li>\n  <li>b</li>\n</ul>'
    );
    const tight = '<ol><li>a</li></ol>';
    expect(addListItemAfter(tight, item(tight, 'a'))).toBe('<ol><li>a</li><li></li></ol>');
  });

  it('removes an empty item, restoring the original exactly', () => {
    for (const text of ['a', 'b']) {
      const added = addListItemAfter(UL, item(UL, text));
      expect(removeEmptyListItem(added, item(added, ''))).toBe(UL);
    }
  });

  it('removes only empty items', () => {
    expect(removeEmptyListItem(UL, item(UL, 'a'))).toBe(UL);
    const br = '<ul>\n  <li>a</li>\n  <li><br></li>\n</ul>';
    expect(removeEmptyListItem(br, locateEditables(br)[1])).toBe('<ul>\n  <li>a</li>\n</ul>');
  });

  it('adds a checklist item with a unique id derived from the previous one', () => {
    const plan = fixture('sample-plan.html');
    const s3 = item(plan, 'Commit with <code>git</code>');
    const added = addListItemAfter(plan, s3);
    expect(added).toContain(
      '<li id="t1-s3"><input type="checkbox"> Commit with <code>git</code></li>\n' +
        '      <li id="t1-s3-n"><input type="checkbox"> </li>\n    </ol>'
    );
    // The new item is an editable whose text is empty.
    const fresh = item(added, '');
    expect(fresh.tag).toBe('li');
    expect(added.slice(fresh.range!.start, fresh.range!.end)).toBe(' ');
    // Adding after t1-s3 again: t1-s3-n is taken, so the id grows again.
    const again = addListItemAfter(added, item(added, 'Commit with <code>git</code>'));
    expect(again).toContain('<li id="t1-s3-n-n"><input type="checkbox"> </li>');
    expect(removeEmptyListItem(added, fresh)).toBe(plan);
  });

  // sample-spec.html holds no list, so the list fixture is sample-plan.html.
  it('confines both changes to the parent list in a fixture', () => {
    const plan = fixture('sample-plan.html');
    const s1 = item(plan, 'Write the failing test');
    const inner = locateListInner(plan, s1)!;
    const added = addListItemAfter(plan, s1);
    const grown = added.length - plan.length;
    expect(grown).toBeGreaterThan(0);
    expect(added.slice(0, inner.start)).toBe(plan.slice(0, inner.start));
    expect(added.slice(inner.end + grown)).toBe(plan.slice(inner.end));
    expect(added).toContain('<li id="t1-s1-n"><input type="checkbox"> </li>');
    const fresh = item(added, '');
    expect(locateListInner(added, fresh)).toEqual({ start: inner.start, end: inner.end + grown });
    expect(removeEmptyListItem(added, fresh)).toBe(plan);
  });

  it('never emits u, b or i', () => {
    expect(cleanInline('<b>x</b>')).toBe('<strong>x</strong>');
    expect(cleanInline('<i>x</i><u>y</u>')).toBe('<em>x</em>y');
    expect(addListItemAfter(UL, item(UL, 'b'))).not.toMatch(/<(u|b|i)>/);
  });
});
