import { json, error } from '@sveltejs/kit';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { assertSpecPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

function safePath(url: URL): string {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  try {
    return assertSpecPath(raw);
  } catch (e) {
    throw error(400, (e as Error).message);
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const path = safePath(url);
  try {
    const content = await readFile(path, 'utf8');
    const { mtimeMs } = await stat(path);
    return json({ content, mtime: mtimeMs });
  } catch {
    throw error(404, 'spec not found');
  }
};

export const PUT: RequestHandler = async ({ url, request }) => {
  const path = safePath(url);
  const content = await request.text();
  await writeFile(path, content, 'utf8');
  const { mtimeMs } = await stat(path);
  return json({ mtime: mtimeMs });
};
