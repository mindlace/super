import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { isSpecFile } from '../specfile';
import { assetType } from './assets';
import { MAX_WORKTREE_DEPTH } from './fswalk';
import { isWorktreePath, mainEquivalent } from '../mainpath';

function fail(status: number, message: string): never {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  throw err;
}

function bad(message: string): never {
  return fail(400, message);
}

/** Where a docs file sits: its project and (for a worktree) the worktree name. */
export interface DocPathInfo {
  path: string;
  project: string;
  worktree: string | null;
}

/**
 * Lexical shape check for a readable doc: a `.md`/`.html` file somewhere under
 * `<root>/<project>/docs/` or `<root>/<project>/.claude/worktrees/<wt…>/docs/`,
 * where `<wt…>` is 1..MAX_WORKTREE_DEPTH segments. Touches no disk; symlinks are
 * handled by `locateDoc`, which re-checks the real path.
 */
export function docPathInfo(p: string, root: string = PROJECTS_ROOT): DocPathInfo {
  const path = resolve(p);
  const rel = relative(resolve(root), path);
  const segs = rel.split(sep);
  if (!rel || isAbsolute(rel) || segs[0] === '..') {
    bad(`path is outside the projects root: ${p}`);
  }
  if (!isSpecFile(path)) bad(`path is not a doc file (.md or .html): ${p}`);
  if (segs[1] === 'docs' && segs.length >= 3) {
    return { path, project: segs[0], worktree: null };
  }
  if (segs[1] === '.claude' && segs[2] === 'worktrees') {
    const k = segs.indexOf('docs', 4);
    const depth = k - 3;
    if (k !== -1 && depth >= 1 && depth <= MAX_WORKTREE_DEPTH && k < segs.length - 1) {
      return { path, project: segs[0], worktree: segs.slice(3, k).join('/') };
    }
  }
  bad(`path is not inside a project docs/ directory: ${p}`);
}

export function assertDocPathShape(p: string, root: string = PROJECTS_ROOT): string {
  return docPathInfo(p, root).path;
}

/** The real path of an existing regular doc file, or null when it is missing. */
async function realDoc(path: string, root: string): Promise<string | null> {
  let real: string;
  let realRoot: string;
  try {
    [real, realRoot] = await Promise.all([realpath(path), realpath(root)]);
  } catch {
    return null;
  }
  // A symlink may not lead outside the root or to a non-doc file.
  assertDocPathShape(real, realRoot);
  const st = await stat(real).catch(() => null);
  return st?.isFile() ? real : null;
}

/**
 * Validate a client-supplied doc path and find the file to read. `path` is the
 * lexical path the client keys on; `real` (symlinks resolved, re-validated) is
 * what to read. A worktree doc that is gone falls back to its landed main copy,
 * returned as `path`. Throws status 400 on a bad shape, 404 when missing.
 */
export async function locateDoc(
  p: string,
  root: string = PROJECTS_ROOT
): Promise<{ path: string; real: string }> {
  const path = assertDocPathShape(p, root);
  const real = await realDoc(path, root);
  if (real) return { path, real };
  const mainEq = isWorktreePath(path) ? mainEquivalent(path) : null;
  if (mainEq) {
    const mainPath = assertDocPathShape(mainEq, root);
    const mainReal = await realDoc(mainPath, root);
    if (mainReal) return { path: mainPath, real: mainReal };
  }
  fail(404, `doc not found: ${p}`);
}

export function assertAssetPath(p: string, root: string = PROJECTS_ROOT): string {
  const resolved = resolve(p);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    bad(`path is outside the projects root: ${p}`);
  }
  const marker = sep + SUPERPOWERS_SEGMENT + sep;
  const at = resolved.indexOf(marker);
  if (at === -1) {
    bad(`path is not inside a docs/superpowers directory: ${p}`);
  }
  const parts = resolved.slice(at + marker.length).split(sep);
  // <type>/assets/<one or more segments>
  if (parts.length < 3 || parts[0] === 'assets' || parts[1] !== 'assets') {
    bad(`path is not under docs/superpowers/<type>/assets/: ${p}`);
  }
  if (assetType(resolved) === null) {
    bad(`not a served asset type: ${p}`);
  }
  return resolved;
}
