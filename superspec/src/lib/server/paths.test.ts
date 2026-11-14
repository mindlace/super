import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { assertSpecPath } from './paths';

const ROOT = '/tmp/projects-root';
const good = join(ROOT, 'planafoot/docs/superpowers/specs/2026-06-22-x-design.md');
const goodWorktree = join(
  ROOT,
  'planafoot/.claude/worktrees/wt1/docs/superpowers/specs/2026-06-22-y-design.md'
);

describe('assertSpecPath', () => {
  it('accepts a valid main spec path', () => {
    expect(assertSpecPath(good, ROOT)).toBe(good);
  });

  it('accepts a valid worktree spec path', () => {
    expect(assertSpecPath(goodWorktree, ROOT)).toBe(goodWorktree);
  });

  it('rejects a path outside the root', () => {
    expect(() => assertSpecPath('/etc/passwd', ROOT)).toThrow();
  });

  it('rejects traversal escaping the root', () => {
    const evil = join(ROOT, '../../etc/docs/superpowers/specs/x.md');
    expect(() => assertSpecPath(evil, ROOT)).toThrow();
  });

  it('rejects a non-markdown file', () => {
    const txt = join(ROOT, 'p/docs/superpowers/specs/x.txt');
    expect(() => assertSpecPath(txt, ROOT)).toThrow();
  });

  it('rejects a markdown file not under specs', () => {
    const elsewhere = join(ROOT, 'p/README.md');
    expect(() => assertSpecPath(elsewhere, ROOT)).toThrow();
  });

  it('accepts a plans path (any superpowers subdir)', () => {
    const plan = join(ROOT, 'planafoot/docs/superpowers/plans/2026-06-22-x.md');
    expect(assertSpecPath(plan, ROOT)).toBe(plan);
  });
});
