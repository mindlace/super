import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDirs, listSpecFiles, isWorktreeRoot } from './fswalk';
import { makeTree } from './testtree';
import { SUPERPOWERS_SEGMENT } from './config';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'fswalk-'));
  await mkdir(join(root, 'sub-a'), { recursive: true });
  await mkdir(join(root, 'sub-b'), { recursive: true });
  await writeFile(join(root, 'keep.md'), '# keep');
  await writeFile(join(root, 'skip.txt'), 'nope');
  await writeFile(join(root, 'b.html'), '<h1>b</h1>');
  await writeFile(join(root, 'c.png'), 'png');
  await mkdir(join(root, 'assets'), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('listDirs', () => {
  it('returns only subdirectory names', async () => {
    expect((await listDirs(root)).sort()).toEqual(['assets', 'sub-a', 'sub-b']);
  });
  it('returns [] for a missing path', async () => {
    expect(await listDirs(join(root, 'nope'))).toEqual([]);
  });
});

describe('listSpecFiles', () => {
  it('listSpecFiles returns .md and .html filenames only', async () => {
    expect((await listSpecFiles(root)).sort()).toEqual(['b.html', 'keep.md']);
  });
  it('returns [] for a missing dir', async () => {
    expect(await listSpecFiles(join(root, 'nope'))).toEqual([]);
  });
});

describe('isWorktreeRoot', () => {
  it('is true for a dir with a .git file (how git worktrees mark themselves)', async () => {
    const tree = await makeTree({ 'wt/.git': 'gitdir: /somewhere/.git/worktrees/wt\n' });
    expect(await isWorktreeRoot(join(tree, 'wt'))).toBe(true);
  });

  it('is true for a dir with a docs/superpowers dir', async () => {
    const tree = await makeTree({ [join('wt', SUPERPOWERS_SEGMENT, 'specs', '.keep')]: '' });
    expect(await isWorktreeRoot(join(tree, 'wt'))).toBe(true);
  });

  it('is false for a plain dir that is neither', async () => {
    const tree = await makeTree({ 'wt/README.md': '# hi' });
    expect(await isWorktreeRoot(join(tree, 'wt'))).toBe(false);
  });
});
