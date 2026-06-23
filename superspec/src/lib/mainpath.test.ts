import { describe, it, expect } from 'vitest';
import { isWorktreePath, isMainPath, mainEquivalent } from './mainpath';

const wt =
  '/Users/x/Projects/p/.claude/worktrees/wt1/docs/superpowers/specs/2026-06-22-y-design.md';
const main = '/Users/x/Projects/p/docs/superpowers/specs/2026-06-22-y-design.md';

describe('mainpath', () => {
  it('classifies a worktree path', () => {
    expect(isWorktreePath(wt)).toBe(true);
    expect(isMainPath(wt)).toBe(false);
  });

  it('classifies a main path', () => {
    expect(isWorktreePath(main)).toBe(false);
    expect(isMainPath(main)).toBe(true);
  });

  it('strips the worktree segment to the main equivalent', () => {
    expect(mainEquivalent(wt)).toBe(main);
  });

  it('returns null for a non-worktree path', () => {
    expect(mainEquivalent(main)).toBeNull();
  });
});
