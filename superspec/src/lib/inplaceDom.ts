// The browser side of in-place editing: find the editable elements in the rendered
// DOM with the same rule the source side uses, and read back what an edit produced.

import {
  collectEditables,
  cleanInline,
  isEmptyInner,
  type Editable,
  type TreeAdapter
} from './inplace';

const domAdapter: TreeAdapter<Node> = {
  tag: (n) => {
    if (n.nodeType === Node.TEXT_NODE) return null;
    if (n.nodeType === Node.ELEMENT_NODE) return (n as Element).localName;
    return '#' + n.nodeName.replace(/^#/, '').toLowerCase();
  },
  children: (n) => [...n.childNodes],
  skip: (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute('data-sr-added'),
  text: (n) => n.textContent ?? ''
};

/** Editable elements of a rendered spec, in document order; reader-added markup is ignored. */
export function collectRenderedEditables(root: ParentNode): HTMLElement[] {
  // The root itself is a container, never an editable.
  return [...root.childNodes].flatMap(
    (c) => collectEditables<Node>(c, domAdapter) as HTMLElement[]
  );
}

/** The element's inner html, minus a leading checklist checkbox, reduced to the inline subset. */
export function editedInner(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  if (copy.localName === 'li') {
    // The source range starts after the checkbox, so the checkbox and any
    // whitespace before it are not part of the edited text.
    const lead: ChildNode[] = [];
    for (const c of [...copy.childNodes]) {
      if (c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() === '') {
        lead.push(c);
        continue;
      }
      if (c.nodeType === Node.ELEMENT_NODE && (c as Element).localName === 'input') {
        for (const w of lead) w.remove();
        c.remove();
      }
      break;
    }
  }
  return cleanInline(copy.innerHTML);
}

/** Editing is safe only when both sides list the same elements in the same order. */
export function editingAligned(rendered: HTMLElement[], source: Editable[]): boolean {
  return (
    rendered.length === source.length && rendered.every((el, i) => el.localName === source[i].tag)
  );
}

/**
 * Pasted text as one line: each run of line breaks, with the whitespace around
 * it, becomes a single space. An editable element holds one line of text.
 */
export function pastedText(text: string): string {
  return text.replace(/\s*[\r\n]\s*/g, ' ');
}

const BLOCKED_INPUT = new Set(['insertParagraph', 'insertLineBreak', 'insertFromDrop']);

/**
 * `beforeinput` types an editable refuses: new lines, dropped content and the
 * browser's own formatting (it writes `b`, `u` and styled spans; bold and italic
 * go through `toggleInline` instead).
 */
export function blocksInput(inputType: string): boolean {
  return BLOCKED_INPUT.has(inputType) || inputType.startsWith('format');
}

const SAME_INLINE: Record<'strong' | 'em', string[]> = { strong: ['strong', 'b'], em: ['em', 'i'] };

/**
 * Bold or italic for a selection inside `el`: inside a `tag` (or its `b`/`i`
 * twin) already, unwrap that element; otherwise wrap a non-empty selection in a
 * new `tag` and select its contents. Anything else is left alone.
 */
export function toggleInline(el: HTMLElement, range: Range, tag: 'strong' | 'em'): void {
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
  let n: Node | null = range.commonAncestorContainer;
  for (; n && n !== el; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE && SAME_INLINE[tag].includes((n as Element).localName)) {
      const kids = [...n.childNodes];
      (n as Element).replaceWith(...kids);
      if (kids.length) {
        range.setStartBefore(kids[0]);
        range.setEndAfter(kids[kids.length - 1]);
      }
      return;
    }
  }
  if (range.collapsed) return;
  const wrap = el.ownerDocument.createElement(tag);
  wrap.append(range.extractContents());
  range.insertNode(wrap);
  range.selectNodeContents(wrap);
}

/** The caret sits at the end of `el`'s text: only whitespace follows it. */
export function caretAtEnd(el: HTMLElement, node: Node, offset: number): boolean {
  if (!el.contains(node)) return false;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.setStart(node, offset);
  return r.toString().trim() === '';
}

/** Focus `el` and put a collapsed caret at the end of its contents. */
export function caretToEnd(el: HTMLElement): void {
  el.focus();
  const sel = el.ownerDocument.getSelection();
  if (!sel) return;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** A list item showing nothing but its checkbox, whitespace and line breaks. */
export function isEmptyItem(el: HTMLElement): boolean {
  return isEmptyInner(editedInner(el));
}

export interface ArmState {
  view: 'rendered' | 'source';
  kind: 'html' | 'markdown' | null;
  readOnly: boolean;
  /** A render of this file has started and not landed yet. */
  renderPending: boolean;
  /** The rendered DOM on screen shows the current content of the current file. */
  domCurrent: boolean;
}

/** Whether the rendered pane may be made editable right now. */
export function canArm(s: ArmState): boolean {
  return (
    s.view === 'rendered' && s.kind === 'html' && !s.readOnly && !s.renderPending && s.domCurrent
  );
}
