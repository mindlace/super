// The browser side of in-place editing: find the editable elements in the rendered
// DOM with the same rule the source side uses, and read back what an edit produced.

import {
  collectEditables,
  cleanInline,
  isEmptyInner,
  normText,
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

/** The element's visible text as the source side computes it: reader additions left out. */
function renderedText(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const added of copy.querySelectorAll('[data-sr-added]')) added.remove();
  if (copy.localName === 'li') copy.querySelector(':scope > input')?.remove();
  return normText(copy.textContent ?? '');
}

/**
 * Why in-place editing is off: markup was removed from the render, or the
 * rendered editables do not line up with the source's.
 */
export type EditingOff = 'removed' | 'misaligned';

/**
 * Whether the rendered editables may be edited against `source`; null when they
 * may, else why not. They must list the same elements in the same order with
 * the same visible text, so a keystroke is never spliced into the wrong element
 * (a removal that drops an editable can leave the tags lined up, see the tests).
 * `editing` is the index of the element being typed into, whose text runs one
 * edit ahead of the source; the other elements still pin the alignment.
 */
export function editingOffReason(
  removed: readonly string[],
  rendered: HTMLElement[],
  source: Editable[],
  editing?: number
): EditingOff | null {
  if (removed.length) return 'removed';
  if (!editingAligned(rendered, source)) return 'misaligned';
  const textMatches = rendered.every(
    (el, i) => i === editing || renderedText(el) === source[i].text
  );
  return textMatches ? null : 'misaligned';
}

/**
 * A keydown that belongs to an IME composition (Safari reports the Enter that
 * commits one with `isComposing` false and keyCode 229).
 */
export function isImeEnter(e: { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === 229;
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

/** Where typed text goes instead of the caret's spot: before or after `node`. */
export interface BoundaryInsert {
  node: Element;
  side: 'before' | 'after';
}

const NOT_INLINE = ['input', 'br'];
const isInlineEl = (n: Node | null | undefined): n is Element =>
  !!n && n.nodeType === Node.ELEMENT_NODE && !NOT_INLINE.includes((n as Element).localName);
const isBlankText = (n: Node): boolean =>
  n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() === '';

/**
 * A caret at the very end of `el` that sits at the end of a trailing inline
 * element (code, a link, bold): the browser would put typed text inside that
 * element, but it belongs after it. Returns the outermost such element within
 * `el` and 'after'. The same at the very start, before a leading inline element
 * ('before'; a checklist checkbox counts as nothing). Null anywhere else, where
 * typing goes where the browser puts it.
 */
export function boundaryInsert(el: HTMLElement, node: Node, offset: number): BoundaryInsert | null {
  if (!el.contains(node)) return null;
  const doc = el.ownerDocument;
  const rest = doc.createRange();
  rest.selectNodeContents(el);
  rest.setStart(node, offset);
  const lead = doc.createRange();
  lead.selectNodeContents(el);
  lead.setEnd(node, offset);
  const atEnd = rest.toString().trim() === '';
  const atStart = lead.toString().trim() === '';
  if (!atEnd && !atStart) return null;

  if (node !== el) {
    // The caret is inside a child of `el`: insert around that child if it is an element.
    let top: Node = node;
    while (top.parentNode !== el) top = top.parentNode!;
    if (!isInlineEl(top)) return null;
    return { node: top, side: atEnd ? 'after' : 'before' };
  }
  // The caret is on `el` itself, between children: look past blank text.
  const kids = [...el.childNodes];
  if (atEnd) {
    let i = offset - 1;
    while (i >= 0 && isBlankText(kids[i])) i--;
    if (isInlineEl(kids[i])) return { node: kids[i] as Element, side: 'after' };
  }
  if (atStart) {
    let i = offset;
    while (i < kids.length && isBlankText(kids[i])) i++;
    if (isInlineEl(kids[i])) return { node: kids[i] as Element, side: 'before' };
  }
  return null;
}

/**
 * Put `text` into `el` before or after `at.node` and leave a collapsed caret
 * after it. A space at either edge becomes a no-break space so it shows and
 * holds the caret (the source side reads it back as a plain space).
 */
export function insertAtBoundary(at: BoundaryInsert, text: string, sel: Selection): void {
  const shown = text.replace(/^ | $/g, ' ');
  const t = at.node.ownerDocument.createTextNode(shown);
  if (at.side === 'after') at.node.after(t);
  else at.node.before(t);
  const r = at.node.ownerDocument.createRange();
  r.setStart(t, t.length);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Longest list of removed markup the collapsed notice names rather than counts. */
const NAMED_REMOVED_MAX = 24;

/** The collapsed notice line: what was removed, problems, and whether editing is off. */
export function noticeSummary(
  removed: readonly string[],
  problems: readonly string[],
  editingOff: EditingOff | null
): string {
  const parts: string[] = [];
  if (removed.length) {
    const named = removed.join(', ');
    parts.push(
      removed.length <= 3 && named.length <= NAMED_REMOVED_MAX
        ? `Removed ${named}`
        : `${removed.length} removed`
    );
  }
  if (problems.length) {
    parts.push(`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`);
  }
  const summary = parts.join(', ');
  if (!editingOff) return summary;
  return summary ? `${summary}; in-place editing off` : 'In-place editing off';
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
