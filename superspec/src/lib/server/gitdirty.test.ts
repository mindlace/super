import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parsePorcelainZ, listDirtyDocs, type GitRunner } from './gitdirty';

const NUL = '\0';

describe('parsePorcelainZ', () => {
  it('returns the path of each status entry', () => {
    const raw = ` M docs/superpowers/specs/a.md${NUL}?? docs/superpowers/plans/b.md${NUL}`;
    expect(parsePorcelainZ(raw)).toEqual([
      'docs/superpowers/specs/a.md',
      'docs/superpowers/plans/b.md'
    ]);
  });

  it('consumes the extra origin field a rename or copy emits', () => {
    // "R  new\0old\0" — the origin path is a bare field, not a status entry.
    const raw = `R  docs/superpowers/specs/new.md${NUL}docs/superpowers/specs/old.md${NUL} M docs/superpowers/specs/c.md${NUL}`;
    expect(parsePorcelainZ(raw)).toEqual([
      'docs/superpowers/specs/new.md',
      'docs/superpowers/specs/c.md'
    ]);
  });

  it('handles a rename recorded in the worktree column', () => {
    const raw = ` R docs/superpowers/plans/new.md${NUL}docs/superpowers/plans/old.md${NUL}`;
    expect(parsePorcelainZ(raw)).toEqual(['docs/superpowers/plans/new.md']);
  });

  it('leaves spaces in paths intact', () => {
    const raw = ` M docs/superpowers/specs/two words.md${NUL}`;
    expect(parsePorcelainZ(raw)).toEqual(['docs/superpowers/specs/two words.md']);
  });

  it('returns nothing for empty output', () => {
    expect(parsePorcelainZ('')).toEqual([]);
  });
});

describe('listDirtyDocs', () => {
  const root = join('/repo', 'proj');

  it('resolves reported paths against the repo root', async () => {
    const run: GitRunner = async () => ` M docs/superpowers/specs/a.md${NUL}`;
    const dirty = await listDirtyDocs(root, run);
    expect(dirty).toEqual(new Set([join(root, 'docs/superpowers/specs/a.md')]));
  });

  it('asks git only about the superpowers subtree, listing untracked files individually', async () => {
    let seen: string[] = [];
    const run: GitRunner = async (_root, args) => {
      seen = args;
      return '';
    };
    await listDirtyDocs(root, run);
    expect(seen).toContain('--porcelain');
    expect(seen).toContain('-z');
    expect(seen).toContain('--untracked-files=all');
    expect(seen.at(-1)).toBe(join('docs', 'superpowers'));
  });

  it('returns null when git cannot answer, so callers can fall back', async () => {
    const run: GitRunner = async () => null;
    expect(await listDirtyDocs(root, run)).toBeNull();
  });

  it('returns an empty set for a clean checkout', async () => {
    const run: GitRunner = async () => '';
    expect(await listDirtyDocs(root, run)).toEqual(new Set());
  });
});
