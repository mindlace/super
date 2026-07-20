import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import type { SpecEntry } from '$lib/types';
import { normalizedSlug } from '../pairing';
import { exists, isWorktreeRoot, listDirs, listMarkdown, MAX_WORKTREE_DEPTH } from './fswalk';

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
    if (await isWorktreeRoot(dir)) {
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

export interface SuperpowersLocation {
  project: string;
  worktree: string | null;
  dir: string;
}

/**
 * Every docs/superpowers directory that exists under `root` — main checkouts and
 * worktrees alike. Single source of truth for both scanSpecs (what to read) and
 * the watcher (what to watch), so the two can never drift apart.
 */
export async function listSuperpowersLocations(
  root: string = PROJECTS_ROOT
): Promise<SuperpowersLocation[]> {
  const out: SuperpowersLocation[] = [];
  for (const project of await listDirs(root)) {
    const mainSuper = join(root, project, SUPERPOWERS_SEGMENT);
    if (await exists(mainSuper)) {
      out.push({ project, worktree: null, dir: mainSuper });
    }
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listWorktrees(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      if (await exists(wtSuper)) {
        out.push({ project, worktree: wt, dir: wtSuper });
      }
    }
  }
  return out;
}

export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<SpecEntry[]> {
  const out: SpecEntry[] = [];

  const byProject = new Map<string, SuperpowersLocation[]>();
  for (const loc of await listSuperpowersLocations(root)) {
    const arr = byProject.get(loc.project) ?? [];
    arr.push(loc);
    byProject.set(loc.project, arr);
  }

  for (const [project, locs] of byProject) {
    const mainLoc = locs.find((l) => l.worktree === null);

    // Specs in the main checkout are intentionally not listed; we only surface
    // active worktree work. We still record them so a worktree copy that has
    // already landed on main drops off the list too.
    const mainSet = new Set<string>();
    if (mainLoc) {
      for (const sub of await listDirs(mainLoc.dir)) {
        for (const name of await listMarkdown(join(mainLoc.dir, sub))) {
          mainSet.add(`${sub}/${name}`);
        }
      }
    }

    const planSlugs = new Set<string>();
    for (const loc of locs) {
      if (loc.worktree === null) continue;
      for (const sub of await listDirs(loc.dir)) {
        const dir = join(loc.dir, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          const entry = await makeEntry(dir, name, project, loc.worktree, sub);
          out.push(entry);
          if (entry.type === 'plan') planSlugs.add(normalizedSlug(name));
        }
      }
    }

    // Re-surface a landed main spec when a live worktree plan still references
    // it (same project, same slug), so the plan keeps its nested parent.
    if (mainLoc) {
      const mainSpecsDir = join(mainLoc.dir, 'specs');
      for (const name of await listMarkdown(mainSpecsDir)) {
        if (!planSlugs.has(normalizedSlug(name))) continue;
        const entry = await makeEntry(mainSpecsDir, name, project, null, 'specs');
        entry.onMain = true;
        out.push(entry);
      }
    }
  }

  // secondary sort by type is a stable display tiebreaker for equal-recency entries
  out.sort((a, b) => b.recency - a.recency || b.type.localeCompare(a.type));
  return out;
}
