import DOMPurify from 'dompurify';
import type { DOMPurify as Purifier } from 'dompurify';
import { ALLOWED_ATTR, ALLOWED_TAGS, MARKER_ATTR, SVG_TAGS } from './subset';

// Spec HTML is untrusted input: everything outside the subset is stripped, and
// every strip is reported so the author can see what the reader dropped.

export interface SanitizeResult {
  fragment: DocumentFragment;
  removed: string[];
  problems: string[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ALLOWED_TAG_SET = new Set(ALLOWED_TAGS);
const ALLOWED_ATTR_SET = new Set(ALLOWED_ATTR);
const SVG_TAG_SET = new Set(SVG_TAGS);
const MARKER_ATTR_SET = new Set(MARKER_ATTR);
/** The diagram vocabulary: the only class names the stylesheet paints on SVG. */
const SVG_CLASSES = new Set([
  'diagram',
  'node',
  'edge',
  'group',
  'missing',
  'result',
  'external',
  'muted'
]);

/** Per-call state the shared hooks read and write. */
interface Run {
  rewriteSrc: (src: string) => string | null;
  removed: string[];
  /** Attributes a hook dropped, so DOMPurify's own record of them is not reported twice. */
  hookDropped: WeakMap<Element, Set<string>>;
}

let run: Run | null = null;
let purifier: Purifier | null = null;

const tagOf = (el: Element) => el.localName;

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(src.trim());
}

/** Only a checkbox that is the first thing in an `li` (bar whitespace) may stay. */
function isLeadingCheckbox(input: Element): boolean {
  if ((input.getAttribute('type') ?? '').toLowerCase() !== 'checkbox') return false;
  const li = input.parentElement;
  if (!li || li.localName !== 'li' || li.namespaceURI !== input.namespaceURI) return false;
  for (let n = input.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType === Node.COMMENT_NODE) continue;
    if (n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()) continue;
    return false;
  }
  return true;
}

/** Why a hook drops this attribute, or null to leave it to DOMPurify. */
function attributeRule(el: Element, name: string, value: string, r: Run): string | null {
  const tag = tagOf(el);
  if (name === 'class' && el.namespaceURI !== SVG_NS) return `class on <${tag}>`;
  if (name === 'type' || name === 'checked') {
    if (tag !== 'input') return `${name} on <${tag}>`;
    if (name === 'type' && value.toLowerCase() !== 'checkbox') return `type="${value}" on <input>`;
  }
  if (MARKER_ATTR_SET.has(name) && tag !== 'marker') return `${name} on <${tag}>`;
  if (name === 'src' && r.rewriteSrc(value) === null) {
    return isRemote(value)
      ? `remote src on <${tag}> (${value})`
      : `src on <${tag}> outside the spec's assets (${value})`;
  }
  return null;
}

/** An SVG `class` keeps only the diagram vocabulary; any other token is dropped and reported. */
function keepDiagramClasses(el: Element, r: Run): void {
  if (el.namespaceURI !== SVG_NS || !el.hasAttribute('class')) return;
  const tokens = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => SVG_CLASSES.has(t));
  if (kept.length === tokens.length) return;
  const dropped = tokens.filter((t) => !SVG_CLASSES.has(t));
  r.removed.push(`class "${dropped.join(' ')}" on <${tagOf(el)}>`);
  if (kept.length) el.setAttribute('class', kept.join(' '));
  else el.removeAttribute('class');
}

function getPurifier(): Purifier {
  if (purifier) return purifier;
  const p = DOMPurify(window);

  p.addHook('uponSanitizeElement', (node, data) => {
    const r = run;
    if (!r || node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = data.tagName;
    let reason: string | null = null;
    if (tag === 'input' && !isLeadingCheckbox(el)) {
      reason = '<input> (only a checkbox at the start of an <li> is allowed)';
    } else if (SVG_TAG_SET.has(tag) && tag !== 'svg' && el.namespaceURI !== SVG_NS) {
      reason = `<${tag}> outside <svg>`;
    } else if (ALLOWED_TAG_SET.has(tag) && !SVG_TAG_SET.has(tag) && el.namespaceURI === SVG_NS) {
      reason = `<${tag}> inside <svg>`;
    }
    if (reason) {
      r.removed.push(reason);
      el.remove();
    }
  });

  p.addHook('uponSanitizeAttribute', (node, data) => {
    const r = run;
    if (!r) return;
    const reason = attributeRule(node, data.attrName, data.attrValue, r);
    if (!reason) return;
    data.keepAttr = false;
    r.removed.push(reason);
    let names = r.hookDropped.get(node);
    if (!names) r.hookDropped.set(node, (names = new Set()));
    names.add(data.attrName);
  });

  p.addHook('afterSanitizeAttributes', (node) => {
    const r = run;
    if (!r) return;
    keepDiagramClasses(node, r);
    if (!node.hasAttribute('src')) return;
    const rewritten = r.rewriteSrc(node.getAttribute('src') ?? '');
    if (rewritten === null) node.removeAttribute('src');
    else node.setAttribute('src', rewritten);
  });

  purifier = p;
  return p;
}

/** Turn DOMPurify's own removal records into report lines, skipping harmless ones. */
function describeRemovals(p: Purifier, r: Run): string[] {
  const out: string[] = [];
  let sentinelSeen = false;
  for (const entry of p.removed) {
    if ('element' in entry) {
      const node = entry.element;
      if (node.nodeType !== Node.ELEMENT_NODE) continue; // comments and the like
      const tag = (node as Element).localName;
      // `body` is the root DOMPurify parsed into, not the spec's markup (the
      // HTML parser drops a spec's own html/head/body tags before this point).
      if (tag === 'body') continue;
      // FORCE_BODY prepends a `<remove>` placeholder and removes it again; it
      // is always the first one removed. A spec's own `<remove>` is still reported.
      if (tag === 'remove' && !sentinelSeen) {
        sentinelSeen = true;
        continue;
      }
      out.push(ALLOWED_TAG_SET.has(tag) ? `<${tag}> (unsafe)` : `<${tag}>`);
    } else {
      const { attribute } = entry;
      const from = entry.from as Element | null;
      if (!attribute || !from) continue;
      const name = attribute.name.toLowerCase();
      if (r.hookDropped.get(from)?.has(name)) continue;
      const tag = tagOf(from);
      const listed =
        ALLOWED_ATTR_SET.has(name) || name.startsWith('data-') || name.startsWith('aria-');
      // A listed attribute only goes when DOMPurify rejects its value, such as
      // a script URL.
      out.push(
        listed ? `${name}="${attribute.value}" on <${tag}> (unsafe value)` : `${name} on <${tag}>`
      );
    }
  }
  return out;
}

export function sanitizeSpec(
  source: string,
  rewriteSrc: (src: string) => string | null
): SanitizeResult {
  const p = getPurifier();
  const r: Run = { rewriteSrc, removed: [], hookDropped: new WeakMap() };
  run = r;
  let fragment: DocumentFragment;
  try {
    fragment = p.sanitize(source, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTR],
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
      // Parse everything into the body, so a `style`, `script`, `link`, `meta`
      // or `title` before the article is removed and reported, not hoisted into
      // a head and dropped silently.
      FORCE_BODY: true,
      // SANITIZE_DOM drops ids that match document or form properties (`title`,
      // `links`, `timeline`, ...), which are natural section ids. Its purpose,
      // DOM clobbering, cannot happen here: named document properties come only
      // from form, embed, iframe, object and named img elements, none of which
      // is in the subset, and `name` is not an allowed attribute. An id only adds
      // a window named property, which never shadows an existing global.
      SANITIZE_DOM: false,
      RETURN_DOM_FRAGMENT: true
    });
  } finally {
    run = null;
  }
  const removed = [...new Set([...r.removed, ...describeRemovals(p, r)])];
  return { fragment, removed, problems: checkStructure(fragment) };
}

function isCheckboxInput(el: Element | null): boolean {
  return (
    !!el && el.localName === 'input' && (el.getAttribute('type') ?? '').toLowerCase() === 'checkbox'
  );
}

/** Structural rules of the format. Problems are reported; the spec still renders. */
export function checkStructure(root: ParentNode): string[] {
  const problems: string[] = [];

  const significant = [...root.childNodes].filter(
    (n) =>
      n.nodeType === Node.ELEMENT_NODE ||
      (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
  );
  if (significant.length !== 1 || (significant[0] as Element).localName !== 'article') {
    problems.push('expected a single <article> root');
  }

  const h1s = root.querySelectorAll('h1').length;
  if (h1s !== 1) problems.push(`exactly one <h1>, found ${h1s}`);

  for (const el of root.querySelectorAll('section, figure, table')) {
    if (!el.id) problems.push(`<${el.localName}> without an id`);
  }

  const seen = new Set<string>();
  for (const el of root.querySelectorAll('[id]')) {
    if (seen.has(el.id)) problems.push(`duplicate id "${el.id}"`);
    seen.add(el.id);
  }

  for (const li of root.querySelectorAll('li')) {
    if (isCheckboxInput(li.firstElementChild) && !li.id) {
      problems.push('checklist <li> without an id');
    }
  }

  return [...new Set(problems)];
}
