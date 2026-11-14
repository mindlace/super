import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import type { SpecEntry } from '$lib/types';
import { normalizedSlug } from '../pairing';
import { exists, isWorktreeRoot, listDirs, listSpecFiles, MAX_WORKTREE_DEPTH } from './fswalk';
import { specKind, stripSpecExt } from '../specfile';
import { listDirtyDocs, type GitRunner } from './gitdirty';
import { listDocTimes, type GitFileTimes } from './gittimes';

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

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

/** Text of the first <h1>, tags stripped and entities decoded. No DOM: runs on the server. */
export function extractHtmlTitle(content: string): string | null {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(content);
  if (!m) return null;
  const text = m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => HTML_ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function typeLabel(subdir: string): string {
  if (subdir === 'specs') return 'spec';
  if (subdir === 'plans') return 'plan';
  return subdir;
}

/** What git said about one checkout; a null half means git had no answer. */
export interface GitView {
  dirty: Set<string> | null;
  times: Map<string, GitFileTimes> | null;
}

export const NO_GIT: GitView = { dirty: null, times: null };

/** `git status` and `git log` for one checkout, run concurrently. */
export async function readGitView(
  repoRoot: string,
  pathspec: string = SUPERPOWERS_SEGMENT,
  run?: GitRunner
): Promise<GitView> {
  const [dirty, times] = await Promise.all([
    listDirtyDocs(repoRoot, run, pathspec),
    listDocTimes(repoRoot, pathspec, run)
  ]);
  return { dirty, times };
}

/**
 * When a doc first appeared and last changed. A checkout stamps every file it
 * writes with the checkout time, so mtime only means "edited" for a file git
 * reports as dirty; otherwise git's commit times are the truth. Any unusable
 * (<= 0) result falls back to mtime, then to the date in the filename.
 */
export function entryTimes(i: {
  filename: string;
  mtime: number;
  birthtime: number;
  dirty: boolean | null;
  git: GitFileTimes | undefined;
}): { created: number; updated: number } {
  const named = parseFilenameDateMs(i.filename);
  const usable = (...candidates: (number | undefined)[]) =>
    candidates.find((t): t is number => t !== undefined && t > 0) ?? named;
  if (i.dirty === null) {
    const t = usable(i.mtime);
    return { created: t, updated: t };
  }
  if (i.dirty) {
    return { created: usable(i.git?.created, i.birthtime, i.mtime), updated: usable(i.mtime) };
  }
  return { created: usable(i.git?.created, i.mtime), updated: usable(i.git?.updated, i.mtime) };
}

export async function makeEntry(
  dir: string,
  filename: string,
  project: string,
  worktree: string | null,
  subdir: string,
  git: GitView = NO_GIT
): Promise<SpecEntry> {
  const path = join(dir, filename);
  const raw = await readFile(path, 'utf8').catch(() => '');
  const st = await stat(path);
  const mtime = st.mtimeMs;
  const { created, updated } = entryTimes({
    filename,
    mtime,
    birthtime: st.birthtimeMs,
    dirty: git.dirty && git.times ? git.dirty.has(path) : null,
    git: git.times?.get(path)
  });
  return {
    path,
    filename,
    title: (specKind(filename) === 'html' ? extractHtmlTitle(raw) : extractTitle(raw)) ?? filename,
    project,
    worktree,
    type: typeLabel(subdir),
    mtime,
    created,
    updated
  };
}

export interface SuperpowersLocation {
  project: string;
  worktree: string | null;
  /** The docs/superpowers dir itself. */
  dir: string;
  /** The checkout holding `dir` — a git repo root, which `dir` sits two levels below. */
  checkout: string;
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
    const mainCheckout = join(root, project);
    const mainSuper = join(mainCheckout, SUPERPOWERS_SEGMENT);
    if (await exists(mainSuper)) {
      out.push({ project, worktree: null, dir: mainSuper, checkout: mainCheckout });
    }
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listWorktrees(wtRoot)) {
      const wtCheckout = join(wtRoot, wt);
      const wtSuper = join(wtCheckout, SUPERPOWERS_SEGMENT);
      if (await exists(wtSuper)) {
        out.push({ project, worktree: wt, dir: wtSuper, checkout: wtCheckout });
      }
    }
  }
  return out;
}

export async function scanSpecs(
  root: string = PROJECTS_ROOT,
  run?: GitRunner
): Promise<SpecEntry[]> {
  const out: SpecEntry[] = [];

  const byProject = new Map<string, SuperpowersLocation[]>();
  for (const loc of await listSuperpowersLocations(root)) {
    const arr = byProject.get(loc.project) ?? [];
    arr.push(loc);
    byProject.set(loc.project, arr);
  }

  // One status + log per checkout, up front, so each file's times come from
  // git rather than the checkout's timestamps. A null half means git had no
  // answer, in which case that checkout's files fall back to mtime.
  const gitByDir = new Map<string, GitView>();
  await Promise.all(
    [...byProject.values()].flat().map(async (loc) => {
      gitByDir.set(loc.dir, await readGitView(loc.checkout, SUPERPOWERS_SEGMENT, run));
    })
  );
  const gitFor = (loc: SuperpowersLocation) => gitByDir.get(loc.dir) ?? NO_GIT;

  for (const [project, locs] of byProject) {
    const mainLoc = locs.find((l) => l.worktree === null);

    // Specs in the main checkout are intentionally not listed; we only surface
    // active worktree work. We still record them so a worktree copy that has
    // already landed on main drops off the list too.
    const mainSet = new Set<string>();
    if (mainLoc) {
      for (const sub of await listDirs(mainLoc.dir)) {
        for (const name of await listSpecFiles(join(mainLoc.dir, sub))) {
          mainSet.add(`${sub}/${stripSpecExt(name)}`);
        }
      }
    }

    const planSlugs = new Set<string>();
    for (const loc of locs) {
      if (loc.worktree === null) continue;
      for (const sub of await listDirs(loc.dir)) {
        const dir = join(loc.dir, sub);
        for (const name of await listSpecFiles(dir)) {
          if (mainSet.has(`${sub}/${stripSpecExt(name)}`)) continue;
          const entry = await makeEntry(dir, name, project, loc.worktree, sub, gitFor(loc));
          out.push(entry);
          if (entry.type === 'plan') planSlugs.add(normalizedSlug(name));
        }
      }
    }

    // Re-surface a landed main spec when a live worktree plan still references
    // it (same project, same slug), so the plan keeps its nested parent.
    if (mainLoc) {
      const mainSpecsDir = join(mainLoc.dir, 'specs');
      for (const name of await listSpecFiles(mainSpecsDir)) {
        if (!planSlugs.has(normalizedSlug(name))) continue;
        const entry = await makeEntry(mainSpecsDir, name, project, null, 'specs', gitFor(mainLoc));
        entry.onMain = true;
        out.push(entry);
      }
    }
  }

  out.sort((a, b) => b.created - a.created || a.path.localeCompare(b.path));
  return out;
}
