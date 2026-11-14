import { resolve as resolvePath, join, sep } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listDirs, listSpecFiles } from './fswalk';
import { isSpecFile } from '../specfile';
import { listWorktrees, makeEntry } from './discovery';
import { pairAndGroup, type DisplayGroup } from '../pairing';
import type { SpecEntry } from '../types';
import { isWorktreePath, mainEquivalent } from '../mainpath';

interface Candidate {
  dir: string;
  filename: string;
  project: string;
  worktree: string | null;
  subdir: string;
  path: string;
}

async function collectCandidates(root: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const addSuperdir = async (superDir: string, project: string, worktree: string | null) => {
    for (const sub of await listDirs(superDir)) {
      const dir = join(superDir, sub);
      for (const filename of await listSpecFiles(dir)) {
        out.push({ dir, filename, project, worktree, subdir: sub, path: join(dir, filename) });
      }
    }
  };

  for (const project of await listDirs(root)) {
    await addSuperdir(join(root, project, SUPERPOWERS_SEGMENT), project, null);
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listWorktrees(wtRoot)) {
      await addSuperdir(join(wtRoot, wt, SUPERPOWERS_SEGMENT), project, wt);
    }
  }

  return out;
}

export async function resolveDoc(
  query: string,
  root: string = PROJECTS_ROOT
): Promise<DisplayGroup | null> {
  const q = query.trim();
  if (!q) return null;

  const forms = isSpecFile(q) ? [q] : [`${q}.md`, `${q}.html`];

  const candidates = await collectCandidates(root);
  let matches = candidates.filter((c) =>
    forms.some((f) => c.path === resolvePath(f) || c.path.endsWith(sep + f))
  );
  if (matches.length === 0) {
    for (const f of forms) {
      const abs = resolvePath(f);
      if (!isWorktreePath(abs)) continue;
      const mainEq = mainEquivalent(abs);
      if (mainEq) matches.push(...candidates.filter((c) => c.path === mainEq));
    }
  }
  if (matches.length === 0) return null;

  // Newest match wins; build entries only for matches (limits stat/read IO).
  const entries = await Promise.all(
    matches.map((c) => makeEntry(c.dir, c.filename, c.project, c.worktree, c.subdir))
  );
  let winnerIdx = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].recency > entries[winnerIdx].recency) winnerIdx = i;
  }
  const winner = entries[winnerIdx];
  const winnerCand = matches[winnerIdx];

  if (winner.type !== 'spec') {
    return { parent: winner, children: [], recency: winner.recency };
  }

  // Attach sibling plans from the same superpowers root (same project + worktree).
  const planCands = candidates.filter(
    (c) => c.subdir === 'plans' && c.project === winnerCand.project && c.worktree === winnerCand.worktree
  );
  const plans: SpecEntry[] = await Promise.all(
    planCands.map((c) => makeEntry(c.dir, c.filename, c.project, c.worktree, c.subdir))
  );
  const group = pairAndGroup([winner, ...plans]).find((g) => g.parent.path === winner.path);
  return group ?? { parent: winner, children: [], recency: winner.recency };
}
