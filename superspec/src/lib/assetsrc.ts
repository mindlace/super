// Maps a spec's relative asset reference to the reader's asset endpoint.
// Pure POSIX string handling so it also runs in the browser.

function normalise(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return '/' + out.join('/');
}

export function assetSrc(specPath: string, src: string): string | null {
  const s = src.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/')) return null;
  const dir = specPath.slice(0, specPath.lastIndexOf('/'));
  const base = normalise(dir);
  const abs = normalise(`${dir}/${s}`);
  if (base === null || abs === null) return null;
  const prefix = base === '/' ? '/' : base + '/';
  if (!abs.startsWith(prefix)) return null;
  return `/api/asset?path=${encodeURIComponent(abs)}`;
}
