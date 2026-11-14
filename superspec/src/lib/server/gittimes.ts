import { join } from 'node:path';
import { SUPERPOWERS_SEGMENT } from './config';
import { runGit, type GitRunner } from './gitdirty';

/** Commit times in epoch milliseconds. */
export interface GitFileTimes {
  created: number;
  updated: number;
}

/**
 * Per-file times from `git log --format=%x01%ct --name-status -M` output
 * (newest commit first). Keys are repo-relative paths as git prints them.
 * Walks oldest-first so each file's first add is `created` and its last
 * touch `updated`; renames carry the origin's creation time; deleted files
 * are dropped.
 */
export function parseNameStatusLog(raw: string): Map<string, GitFileTimes> {
  const times = new Map<string, GitFileTimes>();
  const chunks = raw.split('\x01').filter((c) => c.length > 0);
  for (const chunk of chunks.reverse()) {
    const [first, ...lines] = chunk.split('\n');
    const t = Number(first) * 1000;
    if (!Number.isFinite(t)) continue;
    for (const line of lines) {
      if (!line) continue;
      const fields = line.split('\t');
      const status = fields[0];
      const path = fields[fields.length - 1];
      if (status === 'A' || status.startsWith('C')) {
        times.set(path, { created: t, updated: t });
      } else if (status === 'M' || status === 'T') {
        times.set(path, { created: times.get(path)?.created ?? t, updated: t });
      } else if (status.startsWith('R')) {
        times.set(path, { created: times.get(fields[1])?.created ?? t, updated: t });
        times.delete(fields[1]);
      } else if (status === 'D') {
        times.delete(path);
      }
    }
  }
  return times;
}

/**
 * Created/updated times of every file under `pathspec`, keyed by absolute
 * path. Null when git cannot answer (not a checkout, git missing).
 */
export async function listDocTimes(
  repoRoot: string,
  pathspec: string = SUPERPOWERS_SEGMENT,
  run: GitRunner = runGit
): Promise<Map<string, GitFileTimes> | null> {
  const raw = await run(repoRoot, [
    '-c',
    'core.quotePath=false',
    'log',
    '--format=%x01%ct',
    '--name-status',
    '-M',
    '--',
    pathspec
  ]);
  if (raw === null) return null;
  const out = new Map<string, GitFileTimes>();
  for (const [rel, t] of parseNameStatusLog(raw)) out.set(join(repoRoot, rel), t);
  return out;
}

/** The checkout root containing `dir`, or null when it is not in a repo. */
export async function gitTopLevel(dir: string, run: GitRunner = runGit): Promise<string | null> {
  const raw = await run(dir, ['rev-parse', '--show-toplevel']);
  return raw === null ? null : raw.trim();
}
