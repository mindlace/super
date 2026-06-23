import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SPECS_SEGMENT } from './config';
import type { SpecEntry, ProjectGroup } from '$lib/types';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?/;

export function specSortKey(filename: string): string {
  const m = DATE_RE.exec(filename);
  if (!m) return '0000000000000000' + filename;
  const date = m[1].replace(/-/g, '');
  const time = m[2] ?? '0000';
  return date + time;
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
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function makeEntry(dir: string, filename: string, worktree: string | null): SpecEntry {
  const m = DATE_RE.exec(filename);
  return {
    path: join(dir, filename),
    filename,
    date: m ? m[1] : '',
    worktree
  };
}

export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<ProjectGroup[]> {
  const projects = await listDirs(root);
  const groups: ProjectGroup[] = [];

  for (const project of projects) {
    const mainDir = join(root, project, SPECS_SEGMENT);
    const mainNames = await listMarkdown(mainDir);
    const mainSet = new Set(mainNames);

    const specs: SpecEntry[] = mainNames.map((n) => makeEntry(mainDir, n, null));

    const worktreesRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(worktreesRoot)) {
      const wtDir = join(worktreesRoot, wt, SPECS_SEGMENT);
      for (const n of await listMarkdown(wtDir)) {
        if (!mainSet.has(n)) specs.push(makeEntry(wtDir, n, wt));
      }
    }

    if (specs.length === 0) continue;

    specs.sort((a, b) => specSortKey(b.filename).localeCompare(specSortKey(a.filename)));
    groups.push({ project, specs });
  }

  groups.sort((a, b) =>
    specSortKey(b.specs[0].filename).localeCompare(specSortKey(a.specs[0].filename))
  );
  return groups;
}
