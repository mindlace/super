// Pure helpers for in-place text edits: locate the editable elements in a spec's
// source, clean what a contenteditable produced, and splice it back byte-exactly.
// Runs in node and in the browser: parse5 only, no DOM.

import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { EDITABLE_TAGS, INLINE_TAGS } from './subset';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface Range {
  start: number;
  end: number;
}
/** `range` null: the element has no end tag in the source, so it is not editable. */
export interface Editable {
  tag: string;
  range: Range | null;
}
/**
 * `tag` returns null for a text node and any non-null string for everything else.
 * Comments must return a non-null, non-allowed name (e.g. '#comment') so an element
 * holding one is not editable. `skip` marks nodes the rule ignores entirely.
 */
export interface TreeAdapter<N> {
  tag(n: N): string | null;
  children(n: N): N[];
  skip?(n: N): boolean;
  /** Text of a text node; needed to tell whitespace before a checklist checkbox. */
  text?(n: N): string;
}

const OPAQUE = new Set(['pre', 'svg']);

/** Pre-order list of editable elements; the single implementation of the editable rule. */
export function collectEditables<N>(root: N, a: TreeAdapter<N>): N[] {
  const out: N[] = [];
  const kids = (n: N) => a.children(n).filter((c) => !a.skip?.(c));

  function inlineOnly(n: N): boolean {
    return kids(n).every((c) => {
      const t = a.tag(c);
      return t === null || (INLINE_TAGS.includes(t) && inlineOnly(c));
    });
  }

  // An li may start with a checkbox input (whitespace text only before it).
  function checkboxIndex(n: N): number {
    const cs = kids(n);
    for (let i = 0; i < cs.length; i++) {
      const t = a.tag(cs[i]);
      if (t === null) {
        if (isBlankText(cs[i])) continue;
        return -1;
      }
      return t === 'input' ? i : -1;
    }
    return -1;
  }
  const isBlankText = (n: N): boolean => (a.text?.(n) ?? 'x').trim() === '';

  function editable(n: N, t: string): boolean {
    if (!EDITABLE_TAGS.includes(t)) return false;
    if (t === 'li') {
      const i = checkboxIndex(n);
      if (i >= 0) {
        const cs = kids(n);
        return cs.slice(i + 1).every((c) => {
          const ct = a.tag(c);
          return ct === null || (INLINE_TAGS.includes(ct) && inlineOnly(c));
        });
      }
    }
    return inlineOnly(n);
  }

  function visit(n: N): void {
    const t = a.tag(n);
    if (t === null || OPAQUE.has(t)) return;
    if (editable(n, t)) {
      out.push(n);
      return;
    }
    for (const c of kids(n)) visit(c);
  }
  visit(root);
  return out;
}

const parse5Adapter: TreeAdapter<Node> = {
  tag: (n) => (n.nodeName === '#text' ? null : n.nodeName),
  children: (n) => ('childNodes' in n ? n.childNodes : []),
  text: (n) => (n.nodeName === '#text' ? (n as { value: string }).value : '')
};

/** Source ranges of every editable element, in document order. */
export function locateEditables(source: string): Editable[] {
  const root = parseFragment(source, { sourceCodeLocationInfo: true });
  return collectEditables<Node>(root, parse5Adapter).map((n) => {
    const el = n as Element;
    const loc = el.sourceCodeLocation;
    if (!loc || !loc.startTag || !loc.endTag) return { tag: el.tagName, range: null };
    let start = loc.startTag.endOffset;
    if (el.tagName === 'li') {
      const first = el.childNodes.find((c) => c.nodeName !== '#text') as Element | undefined;
      if (first && first.nodeName === 'input') {
        const l = first.sourceCodeLocation;
        start = (l?.startTag ?? l)?.endOffset ?? start;
      }
    }
    return { tag: el.tagName, range: { start, end: loc.endTag.startOffset } };
  });
}

const KEEP_ATTR = (tag: string, name: string): boolean =>
  name === 'id' ||
  (name.startsWith('data-') && !name.startsWith('data-sr-')) ||
  name.startsWith('aria-') ||
  (tag === 'a' && name === 'href');

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Reduce contenteditable output to text plus the inline subset, in canonical form. */
export function cleanInline(html: string): string {
  const root = parseFragment(html);
  const walk = (nodes: Node[]): string =>
    nodes
      .map((n): string => {
        if (n.nodeName === '#text') {
          return esc((n as { value: string }).value.replace(/ /g, ' '));
        }
        if (n.nodeName === '#comment') return '';
        const el = n as Element;
        if (el.attrs.some((a) => a.name.startsWith('data-sr-added'))) return '';
        const inner = walk(el.childNodes);
        const tag = el.tagName === 'b' ? 'strong' : el.tagName === 'i' ? 'em' : el.tagName;
        if (!INLINE_TAGS.includes(tag)) return inner;
        if (tag === 'br') return '<br>';
        const attrs = el.attrs
          .filter((a) => KEEP_ATTR(tag, a.name))
          .map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`))
          .join('');
        return `<${tag}${attrs}>${inner}</${tag}>`;
      })
      .join('');
  return walk(root.childNodes);
}

export function spliceRange(source: string, range: Range, replacement: string): string {
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}
