// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSpecHtml } from './render';
import { locateEditables, spliceRange } from './inplace';
import {
  blocksInput,
  canArm,
  collectRenderedEditables,
  editedInner,
  editingAligned,
  pastedText
} from './inplaceDom';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const container = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};
const SPEC = '/r/p/.claude/worktrees/w/docs/superpowers/specs/2026-11-13-foo-design.html';
const tags = (els: HTMLElement[]) => els.map((e) => e.tagName.toLowerCase());

describe('collectRenderedEditables', () => {
  it('agrees with the source editables for the sample spec and plan', async () => {
    const src = fixture('sample-spec.html');
    const root = container((await renderSpecHtml(src, SPEC)).html);
    expect(tags(collectRenderedEditables(root))).toEqual(locateEditables(src).map((e) => e.tag));

    const planSrc = fixture('sample-plan.html');
    const planRoot = container((await renderSpecHtml(planSrc, SPEC)).html);
    expect(tags(collectRenderedEditables(planRoot))).toEqual(
      locateEditables(planSrc).map((e) => e.tag)
    );
  });

  it('agrees when whitespace precedes a checklist checkbox', async () => {
    const src =
      '<article><header><h1>T</h1></header><ol><li id="x">\n  <input type="checkbox"> step</li></ol></article>';
    const root = container((await renderSpecHtml(src, SPEC)).html);
    const rendered = collectRenderedEditables(root);
    const source = locateEditables(src);
    expect(tags(rendered)).toEqual(source.map((e) => e.tag));
    expect(tags(rendered)).toContain('li');
    expect(editingAligned(rendered, source)).toBe(true);
    const li = root.querySelector('li#x') as HTMLElement;
    expect(editedInner(li)).toBe(' step');
  });
});

describe('editedInner', () => {
  it('excludes the leading checkbox', async () => {
    const planRoot = container((await renderSpecHtml(fixture('sample-plan.html'), SPEC)).html);
    const li = planRoot.querySelector('li#t1-s3') as HTMLElement;
    expect(editedInner(li).trim()).toBe('Commit with <code>git</code>');
    expect(editedInner(li)).not.toContain('input');
  });

  it('drops reader-added markup', async () => {
    const root = container((await renderSpecHtml(fixture('sample-spec.html'), SPEC)).html);
    const h2 = [...root.querySelectorAll('h2')][0] as HTMLElement;
    expect(editedInner(h2)).toBe('Problem');
    const p = container('<p>see <a href="https://x" target="_blank" rel="noopener">x</a></p>')
      .firstElementChild as HTMLElement;
    expect(editedInner(p)).toBe('see <a href="https://x">x</a>');
  });
});

describe('editingAligned', () => {
  it('disables editing when rendered and source editables disagree', async () => {
    const stray = '<article><header><h1>T</h1></header><p>a<span>b</span></p></article>';
    const strayRoot = container((await renderSpecHtml(stray, SPEC)).html);
    // source p has a non-inline child: not editable; rendered p (span stripped) is: mismatch
    expect(editingAligned(collectRenderedEditables(strayRoot), locateEditables(stray))).toBe(false);

    const src = fixture('sample-spec.html');
    const root = container((await renderSpecHtml(src, SPEC)).html);
    expect(editingAligned(collectRenderedEditables(root), locateEditables(src))).toBe(true);
  });
});

describe('editing flow', () => {
  // What DocPane does on each input: re-locate against the current source and
  // splice the edited element by index.
  const apply = (content: string, eds: HTMLElement[], el: HTMLElement) => {
    const i = eds.indexOf(el);
    return spliceRange(content, locateEditables(content)[i].range!, editedInner(el));
  };

  it('splices successive edits into the edited element only', async () => {
    const src = fixture('sample-plan.html');
    const root = container((await renderSpecHtml(src, SPEC)).html);
    const eds = collectRenderedEditables(root);
    const li = root.querySelector('li#t1-s3') as HTMLElement;
    const code = li.querySelector('code')!;

    code.textContent = 'gitx';
    const once = apply(src, eds, li);
    code.textContent = 'git commit';
    const twice = apply(once, eds, li);

    const expected = src.replace(
      '<input type="checkbox"> Commit with <code>git</code></li>',
      '<input type="checkbox"> Commit with <code>git commit</code></li>'
    );
    expect(expected).not.toBe(src);
    expect(twice).toBe(expected);
  });
});

describe('pastedText', () => {
  it('collapses each run of line breaks, with the whitespace around it, to one space', () => {
    expect(pastedText('one\ntwo')).toBe('one two');
    expect(pastedText('one  \r\n\n  two\rthree')).toBe('one two three');
    expect(pastedText('plain text')).toBe('plain text');
  });
});

describe('blocksInput', () => {
  it('blocks new lines and drops, nothing else', () => {
    expect(blocksInput('insertParagraph')).toBe(true);
    expect(blocksInput('insertLineBreak')).toBe(true);
    expect(blocksInput('insertFromDrop')).toBe(true);
    expect(blocksInput('insertText')).toBe(false);
    expect(blocksInput('deleteContentBackward')).toBe(false);
    expect(blocksInput('formatBold')).toBe(false);
  });
});

describe('canArm', () => {
  const ok = {
    view: 'rendered',
    kind: 'html',
    readOnly: false,
    renderPending: false,
    domCurrent: true
  } as const;

  it('arms an html file off main, rendered, whose DOM shows the current content', () => {
    expect(canArm(ok)).toBe(true);
  });

  it('does not arm otherwise', () => {
    expect(canArm({ ...ok, view: 'source' })).toBe(false);
    expect(canArm({ ...ok, kind: 'markdown' })).toBe(false);
    expect(canArm({ ...ok, kind: null })).toBe(false);
    expect(canArm({ ...ok, readOnly: true })).toBe(false);
    expect(canArm({ ...ok, renderPending: true })).toBe(false);
    expect(canArm({ ...ok, domCurrent: false })).toBe(false);
  });
});
