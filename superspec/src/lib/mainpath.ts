// Path-shape helpers shared by client (tab caption, read-only state) and server
// (fallback, write guard). Pure string ops on the absolute POSIX paths this
// local-only app deals in — deliberately no node:path / FS / PROJECTS_ROOT so
// this imports cleanly into browser code.

const WORKTREE_SEGMENT = '/.claude/worktrees/';

export function isWorktreePath(p: string): boolean {
  return p.includes(WORKTREE_SEGMENT);
}

export function isMainPath(p: string): boolean {
  return !isWorktreePath(p);
}

export function mainEquivalent(p: string): string | null {
  const stripped = p.replace(/\/\.claude\/worktrees\/[^/]+\//, '/');
  return stripped === p ? null : stripped;
}
