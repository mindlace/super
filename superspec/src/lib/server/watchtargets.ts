import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listSuperpowersLocations } from './discovery';
import { exists, listDirs } from './fswalk';

const MAX_WORKTREE_DEPTH = 3;

/**
 * Container directories under a .claude/worktrees root. A slashed branch name
 * ("support/foo") means a new worktree can appear one or more levels down, so we
 * watch the intermediate dirs too — otherwise its creation goes unnoticed.
 *
 * The "is this a worktree root?" test must match listWorktrees() in discovery.ts
 * exactly: a .git link or a superpowers dir. Stopping there is what keeps the
 * worktree's own source tree out of the watch set. Note .git in a worktree is a
 * *file*, so this uses exists() rather than checking listDirs output.
 */
async function worktreeContainers(wtRoot: string, depth = 1): Promise<string[]> {
  const out = [wtRoot];
  if (depth >= MAX_WORKTREE_DEPTH) return out;
  for (const name of await listDirs(wtRoot)) {
    const dir = join(wtRoot, name);
    const isWorktree =
      (await exists(join(dir, '.git'))) || (await exists(join(dir, SUPERPOWERS_SEGMENT)));
    if (isWorktree) continue;
    out.push(...(await worktreeContainers(dir, depth + 1)));
  }
  return out;
}

/**
 * Absolute directories to place non-recursive watches on. Deliberately narrow:
 * only spec-bearing leaves plus the structural dirs where new projects and
 * worktrees appear. Never the project source trees.
 */
export async function listWatchTargets(root: string = PROJECTS_ROOT): Promise<string[]> {
  const targets = new Set<string>([root]);

  for (const project of await listDirs(root)) {
    for (const c of await worktreeContainers(join(root, project, '.claude', 'worktrees'))) {
      targets.add(c);
    }
  }

  for (const loc of await listSuperpowersLocations(root)) {
    targets.add(loc.dir);
    for (const sub of await listDirs(loc.dir)) {
      targets.add(join(loc.dir, sub));
    }
  }

  return [...targets].sort();
}
