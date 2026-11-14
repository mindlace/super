import { json, error } from '@sveltejs/kit';
import { readFile, stat } from 'node:fs/promises';
import { locateDoc } from '$lib/server/paths';
import type { RequestHandler } from './$types';

// locateDoc validates the shape (lexical, then on the realpath) and handles the
// worktree -> landed-main fallback; we read `real` and report the lexical `path`.
export const GET: RequestHandler = async ({ url }) => {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  let loc: { path: string; real: string };
  try {
    loc = await locateDoc(raw);
  } catch (e) {
    throw error((e as { status?: number }).status === 404 ? 404 : 400, (e as Error).message);
  }
  try {
    const [content, { mtimeMs }] = await Promise.all([readFile(loc.real, 'utf8'), stat(loc.real)]);
    return json({ content, mtime: mtimeMs, path: loc.path });
  } catch {
    throw error(404, 'spec not found');
  }
};
