import { resolve as resolvePath, join, sep } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listDirs, listMarkdown } from './fswalk';
import { makeEntry } from './discovery';
import { pairAndGroup, type DisplayGroup } from '../pairing';
import type { SpecEntry } from '../types';

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
      for (const filename of await listMarkdown(dir)) {
        out.push({ dir, filename, project, worktree, subdir: sub, path: join(dir, filename) });
      }
    }
  };

  for (const project of await listDirs(root)) {
    await addSuperdir(join(root, project, SUPERPOWERS_SEGMENT), project, null);
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(wtRoot)) {
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

  const qMd = q.endsWith('.md') ? q : `${q}.md`;
  const abs = resolvePath(qMd);

  const candidates = await collectCandidates(root);
  const matches = candidates.filter((c) => c.path === abs || c.path.endsWith(sep + qMd));
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
