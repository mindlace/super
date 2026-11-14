import { extname } from 'node:path';

export const ASSET_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm'
};

/**
 * The content type a path is served with, from its extension; null when it is
 * not a served asset type. A file named only by its extension (`.png`) has none.
 * The one derivation of an asset's extension, for the path check and the route.
 */
export function assetType(path: string): string | null {
  const ext = extname(path).slice(1).toLowerCase();
  return Object.hasOwn(ASSET_TYPES, ext) ? ASSET_TYPES[ext] : null;
}

/** Parse a single `bytes=` Range header. null = absent/ignored -> serve the full body. */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (m[2] !== '' && Number(m[2]) < start) return null;
  }
  if (start >= size) return 'unsatisfiable';
  return { start, end };
}
