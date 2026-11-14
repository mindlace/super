import { describe, it, expect } from 'vitest';
import { listWatchTargets } from './watchtargets';
import { makeTree } from './testtree';

describe('listWatchTargets', () => {
  it('includes the root, worktree containers, superpowers dirs, and their leaf subdirs', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/.claude/worktrees/feat/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/feat/docs/superpowers/plans/b.md': '# B'
    });

    const targets = await listWatchTargets(root);
    const rel = targets.map((t) => t.slice(root.length + 1) || '.');

    expect(rel).toContain('.');
    expect(rel).toContain('proj/.claude/worktrees');
    expect(rel).toContain('proj/docs/superpowers');
    expect(rel).toContain('proj/docs/superpowers/specs');
    expect(rel).toContain('proj/.claude/worktrees/feat/docs/superpowers');
    expect(rel).toContain('proj/.claude/worktrees/feat/docs/superpowers/plans');
  });

  it('never includes a source tree or node_modules directory', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/node_modules/pkg/index.js': '',
      'proj/src/lib/thing.ts': ''
    });
    const targets = await listWatchTargets(root);
    expect(targets.some((t) => t.includes('node_modules'))).toBe(false);
    expect(targets.some((t) => t.endsWith('/proj/src'))).toBe(false);
  });

  it('returns a deduplicated, sorted list', async () => {
    const root = await makeTree({ 'proj/docs/superpowers/specs/a.md': '# A' });
    const targets = await listWatchTargets(root);
    expect(targets).toEqual([...new Set(targets)].sort());
  });
});
