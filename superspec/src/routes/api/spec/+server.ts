import { json, error } from '@sveltejs/kit';
import { readFile, stat } from 'node:fs/promises';
import { assertSpecPath } from '$lib/server/paths';
import { isWorktreePath, mainEquivalent } from '$lib/mainpath';
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

async function readSpec(path: string): Promise<{ content: string; mtime: number } | null> {
  try {
    const content = await readFile(path, 'utf8');
    const { mtimeMs } = await stat(path);
    return { content, mtime: mtimeMs };
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const path = safePath(url);
  let effectivePath = path;
  let data = await readSpec(path);

  // The worktree copy is gone (merged to main). Fall back to the landed main
  // file, re-validating the computed path before reading it.
  if (!data && isWorktreePath(path)) {
    const mainEq = mainEquivalent(path);
    if (mainEq) {
      let validMain: string | null = null;
      try {
        validMain = assertSpecPath(mainEq);
      } catch {
        validMain = null;
      }
      if (validMain) {
        const mainData = await readSpec(validMain);
        if (mainData) {
          data = mainData;
          effectivePath = validMain;
        }
      }
    }
  }

  if (!data) throw error(404, 'spec not found');
  return json({ content: data.content, mtime: data.mtime, path: effectivePath });
};
