import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import type { SpecEntry } from '$lib/types';
import { normalizedSlug } from '../pairing';
import { exists, listDirs, listMarkdown } from './fswalk';

// A branch name with slashes ("support/foo") nests its worktree that many levels
// below .claude/worktrees, so we can't assume worktrees are direct children.
const MAX_WORKTREE_DEPTH = 3;

/**
 * Worktree directories under `wtRoot`, as paths relative to it ("foo",
 * "support/foo"). A directory is a worktree if it holds a `.git` link or a
 * superpowers dir; anything else is treated as a container of worktrees and
 * descended into. Stopping at worktree roots keeps us out of their source trees.
 */
export async function listWorktrees(wtRoot: string, prefix = '', depth = 1): Promise<string[]> {
  const out: string[] = [];
  for (const name of await listDirs(wtRoot)) {
    const dir = join(wtRoot, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if ((await exists(join(dir, '.git'))) || (await exists(join(dir, SUPERPOWERS_SEGMENT)))) {
      out.push(rel);
    } else if (depth < MAX_WORKTREE_DEPTH) {
      out.push(...(await listWorktrees(dir, rel, depth + 1)));
    }
  }
  return out;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?/;

export function parseFilenameDateMs(filename: string): number {
  const m = DATE_RE.exec(filename);
  if (!m) return 0;
  const [, y, mo, d, hh, mm] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), hh ? Number(hh) : 0, mm ? Number(mm) : 0).getTime();
}

export function extractTitle(content: string): string | null {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const h = /^#{1,6}\s+(.+)$/.exec(t);
    return h ? h[1].trim() : t;
  }
  return null;
}

function typeLabel(subdir: string): string {
  if (subdir === 'specs') return 'spec';
  if (subdir === 'plans') return 'plan';
  return subdir;
}

export async function makeEntry(
  dir: string,
  filename: string,
  project: string,
  worktree: string | null,
  subdir: string
): Promise<SpecEntry> {
  const path = join(dir, filename);
  const raw = await readFile(path, 'utf8').catch(() => '');
  const st = await stat(path);
  const mtime = st.mtimeMs;
  return {
    path,
    filename,
    title: extractTitle(raw) ?? filename,
    project,
    worktree,
    type: typeLabel(subdir),
    mtime,
    recency: Math.max(mtime, parseFilenameDateMs(filename))
  };
}

export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<SpecEntry[]> {
  const out: SpecEntry[] = [];

  for (const project of await listDirs(root)) {
    // Specs in the main checkout are intentionally not listed; we only surface
    // active worktree work. We still record them so a worktree copy that has
    // already landed on main drops off the list too.
    const mainSuper = join(root, project, SUPERPOWERS_SEGMENT);
    const mainSet = new Set<string>();
    for (const sub of await listDirs(mainSuper)) {
      const dir = join(mainSuper, sub);
      for (const name of await listMarkdown(dir)) {
        mainSet.add(`${sub}/${name}`);
      }
    }

    const wtRoot = join(root, project, '.claude', 'worktrees');
    const planSlugs = new Set<string>();
    for (const wt of await listWorktrees(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      for (const sub of await listDirs(wtSuper)) {
        const dir = join(wtSuper, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          const entry = await makeEntry(dir, name, project, wt, sub);
          out.push(entry);
          if (entry.type === 'plan') planSlugs.add(normalizedSlug(name));
        }
      }
    }

    // Re-surface a landed main spec when a live worktree plan still references
    // it (same project, same slug), so the plan keeps its nested parent.
    const mainSpecsDir = join(mainSuper, 'specs');
    for (const name of await listMarkdown(mainSpecsDir)) {
      if (!planSlugs.has(normalizedSlug(name))) continue;
      const entry = await makeEntry(mainSpecsDir, name, project, null, 'specs');
      entry.onMain = true;
      out.push(entry);
    }
  }

  // secondary sort by type is a stable display tiebreaker for equal-recency entries
  out.sort((a, b) => b.recency - a.recency || b.type.localeCompare(a.type));
  return out;
}
