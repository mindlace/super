// The semantic-HTML subset a spec file may use. These lists are the tables under
// "The format" in docs/superpowers/specs/2026-11-13-semantic-html-specs-design.md;
// change them only together with that spec.

/** Diagram elements, valid only inside an `svg`. */
export const SVG_TAGS: readonly string[] = [
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'marker'
];

export const INLINE_TAGS: readonly string[] = [
  'a',
  'em',
  'strong',
  'code',
  'kbd',
  'mark',
  'sub',
  'sup',
  'br'
];

/** Elements whose text the reader lets an author edit in place. */
export const EDITABLE_TAGS: readonly string[] = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'dt',
  'dd',
  'td',
  'th',
  'caption',
  'figcaption',
  'summary',
  'aside',
  'blockquote'
];

export const ALLOWED_TAGS: readonly string[] = [
  // Structure
  'article',
  'header',
  'section',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  // Prose
  'p',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'details',
  'summary',
  // Inline
  ...INLINE_TAGS,
  // Checklists (only a leading checkbox in an li; enforced by the sanitiser)
  'input',
  // Callouts
  'aside',
  // Code
  'pre',
  // Tables
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  // Figures
  'figure',
  'figcaption',
  'img',
  'video',
  // Diagrams
  ...SVG_TAGS
];

/** SVG attributes allowed only on `marker`. */
export const MARKER_ATTR: readonly string[] = [
  'refx',
  'refy',
  'markerwidth',
  'markerheight',
  'orient'
];

// Names are lowercase: DOMPurify compares lowercased attribute names, so
// `viewBox` and `refX` are matched as `viewbox` and `refx`. `data-*` and
// `aria-*` are allowed by the sanitiser's config rather than listed here.
export const ALLOWED_ATTR: readonly string[] = [
  'id',
  'class', // SVG only, enforced by the sanitiser
  'href',
  'src',
  'alt',
  'controls',
  'type', // input only, and only "checkbox"
  'checked', // input only
  'scope',
  'colspan',
  'rowspan',
  'open',
  'role',
  // SVG geometry and references
  'viewbox',
  'x',
  'y',
  'width',
  'height',
  'd',
  'points',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'transform',
  'marker-end',
  'marker-start',
  ...MARKER_ATTR
];
