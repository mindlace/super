import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SUPERPOWERS_SEGMENT } from './config';

const execFileAsync = promisify(execFile);

/** Runs git in `repoRoot`; returns stdout, or null if git could not answer. */
export type GitRunner = (repoRoot: string, args: string[]) => Promise<string | null>;

const runGit: GitRunner = async (repoRoot, args) => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...args], {
      maxBuffer: 32 * 1024 * 1024
    });
    return stdout;
  } catch {
    // Not a repo, git missing, or the command failed — the caller falls back.
    return null;
  }
};

/**
 * Paths from `git status --porcelain -z` output. Each status entry is
 * "XY <path>\0"; a rename or copy appends the origin path as its own field,
 * which we consume so it is not mistaken for another entry.
 */
export function parsePorcelainZ(raw: string): string[] {
  const fields = raw.split('\0');
  const out: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const [x, y] = field;
    const path = field.slice(3);
    if (path) out.push(path);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++;
  }
  return out;
}

/**
 * Absolute paths under `repoRoot`'s superpowers dir that differ from HEAD —
 * modified, staged, or untracked. Returns null when git cannot answer (the dir
 * is not a checkout, git is unavailable), which callers must read as "unknown"
 * rather than "clean".
 *
 * This exists because a fresh `git worktree add` stamps *every* checked-out file
 * with the checkout time, so mtime alone reports a whole backlog of specs as
 * edited today. Git is the only reliable witness to which of them you touched.
 */
export async function listDirtyDocs(
  repoRoot: string,
  run: GitRunner = runGit
): Promise<Set<string> | null> {
  const raw = await run(repoRoot, [
    'status',
    '--porcelain',
    '-z',
    '--untracked-files=all',
    '--',
    SUPERPOWERS_SEGMENT
  ]);
  if (raw === null) return null;
  return new Set(parsePorcelainZ(raw).map((rel) => join(repoRoot, rel)));
}
