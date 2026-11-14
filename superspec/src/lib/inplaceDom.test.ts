// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSpecHtml } from './render';
import { addListItemAfter, locateEditables, spliceRange } from './inplace';
import {
  blocksInput,
  boundaryInsert,
  canArm,
  caretAtEnd,
  caretToEnd,
  collectRenderedEditables,
  editedInner,
  editingAligned,
  editingOffReason,
  isEmptyItem,
  insertAtBoundary,
  isImeEnter,
  noticeSummary,
  pastedText,
  toggleInline
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

describe('editingOffReason', () => {
  const decide = async (src: string, except?: number) => {
    const out = await renderSpecHtml(src, SPEC);
    const root = container(out.html);
    return {
      out,
      root,
      reason: (removed: string[]) =>
        editingOffReason(removed, collectRenderedEditables(root), locateEditables(src), except)
    };
  };

  it('allows editing the sample spec and plan', async () => {
    for (const name of ['sample-spec.html', 'sample-plan.html']) {
      const { out, reason } = await decide(fixture(name));
      expect(reason(out.removed)).toBeNull();
    }
  });

  it('refuses when markup was removed', async () => {
    const { out, reason } = await decide(
      '<article><header><h1>T</h1></header><p>a</p><button>b</button></article>'
    );
    expect(out.removed).not.toEqual([]);
    expect(reason(out.removed)).toBe('removed');
  });

  it('refuses when the tags line up but the text does not', async () => {
    // The comment makes the source p non-editable and leaves the rendered one
    // editable; the audio and its p are removed from the render only. Both
    // sides list one p, holding different text.
    const src = '<article><header><h1>T</h1></header><p>x<!--c--></p><audio><p>z</p></audio></article>';
    const { out, root, reason } = await decide(src);
    expect(editingAligned(collectRenderedEditables(root), locateEditables(src))).toBe(true);
    expect(out.removed).not.toEqual([]);
    // Even with no removal reported, the text cross-check refuses.
    expect(reason([])).toBe('misaligned');
  });

  it('refuses when the tags differ', async () => {
    const src = '<article><header><h1>T</h1></header><p>a<!--c--></p><p>b</p></article>';
    expect((await decide(src)).reason([])).toBe('misaligned');
  });

  it('ignores the text of the element being edited', async () => {
    const src = fixture('sample-plan.html');
    const { root } = await decide(src);
    const eds = collectRenderedEditables(root);
    const i = eds.findIndex((e) => e.id === 't1-s3');
    eds[i].lastChild!.textContent = 'typed';
    const source = locateEditables(src);
    expect(editingOffReason([], eds, source)).toBe('misaligned');
    expect(editingOffReason([], eds, source, i)).toBeNull();
  });

  it('compares whitespace-normalised text without reader additions', async () => {
    const src =
      '<article><header><h1>T</h1></header><section id="s"><h2>Head  &amp;\n  more</h2>' +
      '<ol><li id="c">\n <input type="checkbox">  step&nbsp;<code>x</code></li></ol></section></article>';
    const { reason } = await decide(src);
    expect(reason([])).toBeNull();
    expect(locateEditables(src).map((e) => e.text)).toEqual(['T', 'Head & more', 'step x']);
  });
});

describe('isImeEnter', () => {
  it('treats a composing Enter, and Safari keyCode 229, as an IME commit', () => {
    expect(isImeEnter({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeEnter({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeEnter({ isComposing: false, keyCode: 13 })).toBe(false);
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
  it('blocks new lines, drops and the browser own formatting, nothing else', () => {
    expect(blocksInput('insertParagraph')).toBe(true);
    expect(blocksInput('insertLineBreak')).toBe(true);
    expect(blocksInput('insertFromDrop')).toBe(true);
    expect(blocksInput('formatBold')).toBe(true);
    expect(blocksInput('formatItalic')).toBe(true);
    expect(blocksInput('formatUnderline')).toBe(true);
    expect(blocksInput('insertText')).toBe(false);
    expect(blocksInput('deleteContentBackward')).toBe(false);
  });
});

describe('toggleInline', () => {
  const p = (html: string) => container(`<p>${html}</p>`).firstElementChild as HTMLElement;
  const select = (node: Node, start: number, endNode: Node = node, end = start) => {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(endNode, end);
    return r;
  };

  it('wraps the selection in strong or em', () => {
    const el = p('one two three');
    const text = el.firstChild!;
    toggleInline(el, select(text, 4, text, 7), 'strong');
    expect(editedInner(el)).toBe('one <strong>two</strong> three');
    const el2 = p('one two');
    toggleInline(el2, select(el2.firstChild!, 0, el2.firstChild!, 3), 'em');
    expect(editedInner(el2)).toBe('<em>one</em> two');
  });

  it('unwraps when the selection is inside one already, b and i included', () => {
    const el = p('one <strong>two</strong> three');
    const inner = el.querySelector('strong')!.firstChild!;
    const caret = select(inner, 1);
    toggleInline(el, caret, 'strong');
    expect(editedInner(el)).toBe('one two three');
    // The unwrapped text ends up selected.
    expect(caret.toString()).toBe('two');
    const el2 = p('<i>x</i>y');
    const x = el2.querySelector('i')!.firstChild!;
    toggleInline(el2, select(x, 0, x, 1), 'em');
    expect(editedInner(el2)).toBe('xy');
  });

  it('does nothing for a collapsed caret outside one, or outside the element', () => {
    const el = p('one');
    toggleInline(el, select(el.firstChild!, 1), 'strong');
    expect(el.innerHTML).toBe('one');
    const other = p('two');
    toggleInline(el, select(other.firstChild!, 0, other.firstChild!, 2), 'strong');
    expect(el.innerHTML).toBe('one');
    expect(other.innerHTML).toBe('two');
  });

  it('never produces u, b or i', () => {
    const el = p('a b');
    toggleInline(el, select(el.firstChild!, 0, el.firstChild!, 1), 'strong');
    toggleInline(el, select(el.lastChild!, 1, el.lastChild!, 2), 'em');
    expect(editedInner(el)).toBe('<strong>a</strong> <em>b</em>');
  });
});

describe('caretAtEnd', () => {
  it('is true only when nothing but whitespace follows the caret in the element', () => {
    const li = container('<ul><li>one <code>two</code>\n  </li></ul>').querySelector('li')!;
    const code = li.querySelector('code')!.firstChild!;
    expect(caretAtEnd(li, code, 3)).toBe(true);
    expect(caretAtEnd(li, code, 1)).toBe(false);
    expect(caretAtEnd(li, li.firstChild!, 4)).toBe(false);
    expect(caretAtEnd(li, li, li.childNodes.length)).toBe(true);
  });
});

describe('caretToEnd', () => {
  it('puts a collapsed caret at the end of the element', () => {
    const root = container('<ul><li contenteditable="true">one <code>two</code></li></ul>');
    document.body.append(root);
    const li = root.querySelector('li')!;
    caretToEnd(li);
    const sel = document.getSelection()!;
    expect(sel.isCollapsed).toBe(true);
    expect(caretAtEnd(li, sel.focusNode!, sel.focusOffset)).toBe(true);
    expect(li.contains(sel.focusNode)).toBe(true);
    root.remove();
  });
});

describe('isEmptyItem', () => {
  it('ignores a leading checkbox, whitespace and line breaks', () => {
    const root = container(
      '<ul><li></li><li><input type="checkbox" disabled> </li><li><br></li><li>x</li></ul>'
    );
    expect([...root.querySelectorAll('li')].map((li) => isEmptyItem(li))).toEqual([
      true,
      true,
      true,
      false
    ]);
  });
});

describe('list item flow', () => {
  it('a new item renders as an editable aligned with the source', async () => {
    const src = fixture('sample-plan.html');
    const source = locateEditables(src);
    const i = source.findIndex((e) =>
      src.slice(e.range?.start ?? 0, e.range?.end ?? 0).includes('Commit with')
    );
    const s3 = source[i];
    const next = addListItemAfter(src, s3);
    const root = container((await renderSpecHtml(next, SPEC)).html);
    const eds = collectRenderedEditables(root);
    expect(editingAligned(eds, locateEditables(next))).toBe(true);
    expect(eds[i + 1].id).toBe('t1-s3-n');
    expect(isEmptyItem(eds[i + 1])).toBe(true);
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

describe('boundaryInsert', () => {
  const first = (html: string) => container(html).firstElementChild as HTMLElement;
  const li = () =>
    first('<li id="t1-s3"><input type="checkbox"> Commit with <code>git</code></li>');

  it('puts text typed at the end of a trailing inline element after it', () => {
    const el = li();
    const code = el.querySelector('code')!;
    expect(boundaryInsert(el, code.firstChild!, 3)).toEqual({ node: code, side: 'after' });
  });

  it('uses the outermost inline element that ends the editable', () => {
    const el = first('<p>see <strong><a href="#x">the <em>map</em></a></strong></p>');
    const em = el.querySelector('em')!;
    expect(boundaryInsert(el, em.firstChild!, 3)).toEqual({
      node: el.querySelector('strong'),
      side: 'after'
    });
  });

  it('treats trailing whitespace after the element as the end', () => {
    const el = first('<p>run <code>git</code>\n  </p>');
    const code = el.querySelector('code')!;
    expect(boundaryInsert(el, code.firstChild!, 3)).toEqual({ node: code, side: 'after' });
  });

  it('handles a caret on the editable itself, just after a trailing element', () => {
    const el = first('<p>run <code>git</code></p>');
    expect(boundaryInsert(el, el, 2)).toEqual({ node: el.querySelector('code'), side: 'after' });
  });

  it('leaves typing inside an element that more text follows', () => {
    const el = first('<p>run <code>git</code> now</p>');
    expect(boundaryInsert(el, el.querySelector('code')!.firstChild!, 3)).toBeNull();
  });

  it('leaves typing in the middle of a trailing element', () => {
    const el = li();
    expect(boundaryInsert(el, el.querySelector('code')!.firstChild!, 1)).toBeNull();
  });

  it('leaves plain text at the end alone', () => {
    const el = first('<p>plain text</p>');
    expect(boundaryInsert(el, el.firstChild!, 10)).toBeNull();
  });

  it('puts text typed at the start of a leading inline element before it', () => {
    const el = first('<p><code>git</code> commits</p>');
    const code = el.querySelector('code')!;
    expect(boundaryInsert(el, code.firstChild!, 0)).toEqual({ node: code, side: 'before' });
  });

  it('counts a checklist checkbox as nothing before the text', () => {
    const el = first('<li><input type="checkbox"> <code>git</code> now</li>');
    const code = el.querySelector('code')!;
    expect(boundaryInsert(el, code.firstChild!, 0)).toEqual({ node: code, side: 'before' });
  });

  it('ignores an empty editable and a caret outside it', () => {
    const el = first('<li><input type="checkbox"> </li>');
    expect(boundaryInsert(el, el, 2)).toBeNull();
    expect(boundaryInsert(li(), document.body, 0)).toBeNull();
  });
});

describe('insertAtBoundary', () => {
  it('puts text after a trailing element, caret after it, read back as plain text', () => {
    const el = container('<li><input type="checkbox"> Commit with <code>git</code></li>')
      .firstElementChild as HTMLElement;
    document.body.append(el);
    const sel = document.getSelection()!;
    const code = el.querySelector('code')!;
    insertAtBoundary({ node: code, side: 'after' }, ' ', sel);
    expect(editedInner(el)).toBe(' Commit with <code>git</code> ');
    expect(boundaryInsert(el, sel.focusNode!, sel.focusOffset)).toBeNull();
    el.remove();
  });

  it('puts text before a leading element', () => {
    const el = container('<p><code>git</code> commits</p>').firstElementChild as HTMLElement;
    document.body.append(el);
    const sel = document.getSelection()!;
    insertAtBoundary({ node: el.querySelector('code')!, side: 'before' }, 'run ', sel);
    expect(editedInner(el)).toBe('run <code>git</code> commits');
    expect(sel.focusNode?.parentNode).toBe(el);
    el.remove();
  });
});

describe('noticeSummary', () => {
  it('joins the parts with a comma and a space', () => {
    expect(noticeSummary(['<span>', '<font>'], [], 'removed')).toBe(
      'Removed <span>, <font>; in-place editing off'
    );
    expect(noticeSummary(['<span>'], ['p1', 'p2'], null)).toBe('Removed <span>, 2 problems');
    expect(noticeSummary([], ['p1'], 'misaligned')).toBe('1 problem; in-place editing off');
    expect(noticeSummary([], [], 'misaligned')).toBe('In-place editing off');
  });

  it('counts removed markup when naming it would be long', () => {
    expect(noticeSummary(['<span>', '<font>', '<blink>', '<marquee>'], [], null)).toBe(
      '4 removed'
    );
    expect(noticeSummary(['<custom-element-with-long-name>'], [], null)).toBe('1 removed');
  });
});
