import {
  resolve as resolvePath,
  join,
  sep,
  isAbsolute,
  dirname,
  basename,
  relative
} from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listDirs, listSpecFiles } from './fswalk';
import { isSpecFile } from '../specfile';
import { listWorktrees, makeEntry, readGitView, NO_GIT, type GitView } from './discovery';
import type { GitRunner } from './gitdirty';
import { pairAndGroup, soloGroup, type DisplayGroup } from '../pairing';
import type { SpecEntry } from '../types';
import { isWorktreePath, mainEquivalent } from '../mainpath';
import { gitTopLevel } from './gittimes';
import { docPathInfo, locateDoc } from './paths';

interface Candidate {
  dir: string;
  filename: string;
  project: string;
  worktree: string | null;
  subdir: string;
  path: string;
  /** the git repo root holding `dir` */
  checkout: string;
}

async function collectCandidates(root: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const addSuperdir = async (
    superDir: string,
    checkout: string,
    project: string,
    worktree: string | null
  ) => {
    for (const sub of await listDirs(superDir)) {
      const dir = join(superDir, sub);
      for (const filename of await listSpecFiles(dir)) {
        out.push({
          dir,
          filename,
          project,
          worktree,
          subdir: sub,
          path: join(dir, filename),
          checkout
        });
      }
    }
  };

  for (const project of await listDirs(root)) {
    const mainCheckout = join(root, project);
    await addSuperdir(join(mainCheckout, SUPERPOWERS_SEGMENT), mainCheckout, project, null);
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listWorktrees(wtRoot)) {
      const wtCheckout = join(wtRoot, wt);
      await addSuperdir(join(wtCheckout, SUPERPOWERS_SEGMENT), wtCheckout, project, wt);
    }
  }

  return out;
}

/**
 * Any other `.md`/`.html` under a project's `docs/` (main or worktree), opened
 * by absolute path: a childless group of type `doc`. Null when it fails
 * `locateDoc`'s shape/realpath checks or is missing.
 */
async function looseDoc(q: string, root: string, run?: GitRunner): Promise<DisplayGroup | null> {
  let loc: { path: string; real: string };
  try {
    loc = await locateDoc(q, root);
  } catch {
    return null;
  }
  const { project, worktree } = docPathInfo(loc.path, root);
  const dir = dirname(loc.real);
  const top = await gitTopLevel(dir, run).catch(() => null);
  const git = top
    ? await readGitView(top, relative(top, loc.real), run).catch(() => NO_GIT)
    : NO_GIT;
  // Built from the real path so git's (real) keys match; shown under the lexical one.
  const entry = await makeEntry(dir, basename(loc.real), project, worktree, 'doc', git);
  return soloGroup({ ...entry, path: loc.path, filename: basename(loc.path) });
}

export async function resolveDoc(
  query: string,
  root: string = PROJECTS_ROOT,
  run?: GitRunner
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
  if (matches.length === 0) {
    return isAbsolute(q) && isSpecFile(q) ? looseDoc(q, root, run) : null;
  }

  // One status + log per distinct checkout among the candidates we materialise.
  const gitByCheckout = new Map<string, Promise<GitView>>();
  const gitFor = (checkout: string) => {
    let p = gitByCheckout.get(checkout);
    if (!p) {
      p = readGitView(checkout, SUPERPOWERS_SEGMENT, run).catch(() => NO_GIT);
      gitByCheckout.set(checkout, p);
    }
    return p;
  };
  const build = async (c: Candidate) =>
    makeEntry(c.dir, c.filename, c.project, c.worktree, c.subdir, await gitFor(c.checkout));

  // Most recently updated match wins; build entries only for matches (limits stat/read IO).
  const entries = await Promise.all(matches.map(build));
  let winnerIdx = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].updated > entries[winnerIdx].updated) winnerIdx = i;
  }
  const winner = entries[winnerIdx];
  const winnerCand = matches[winnerIdx];

  if (winner.type !== 'spec') return soloGroup(winner);

  // Attach sibling plans from the same superpowers root (same project + worktree).
  const planCands = candidates.filter(
    (c) => c.subdir === 'plans' && c.project === winnerCand.project && c.worktree === winnerCand.worktree
  );
  const plans: SpecEntry[] = await Promise.all(planCands.map(build));
  const group = pairAndGroup([winner, ...plans]).find((g) => g.parent.path === winner.path);
  return group ?? soloGroup(winner);
}
