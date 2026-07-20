import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SUPERPOWERS_SEGMENT } from './config';

// A branch name with slashes ("support/foo") nests its worktree that many levels
// below .claude/worktrees, so we can't assume worktrees are direct children.
export const MAX_WORKTREE_DEPTH = 3;

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Whether `dir` is a worktree root: it holds a `.git` link (a *file* in git
 * worktrees, not a directory) or a superpowers dir. Shared by listWorktrees()
 * (discovery.ts) and worktreeContainers() (watchtargets.ts) — they must agree,
 * or a project's entire source tree can leak into the watch set.
 */
export async function isWorktreeRoot(dir: string): Promise<boolean> {
  return (await exists(join(dir, '.git'))) || (await exists(join(dir, SUPERPOWERS_SEGMENT)));
}
