import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import type { SpecEntry } from '$lib/types';

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

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

async function makeEntry(
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
    const mainSuper = join(root, project, SUPERPOWERS_SEGMENT);
    const mainSet = new Set<string>();
    for (const sub of await listDirs(mainSuper)) {
      const dir = join(mainSuper, sub);
      for (const name of await listMarkdown(dir)) {
        mainSet.add(`${sub}/${name}`);
        out.push(await makeEntry(dir, name, project, null, sub));
      }
    }

    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      for (const sub of await listDirs(wtSuper)) {
        const dir = join(wtSuper, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          out.push(await makeEntry(dir, name, project, wt, sub));
        }
      }
    }
  }

  // secondary sort by type is a stable display tiebreaker for equal-recency entries
  out.sort((a, b) => b.recency - a.recency || b.type.localeCompare(a.type));
  return out;
}
