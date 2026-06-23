import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDirs, listMarkdown } from './fswalk';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'fswalk-'));
  await mkdir(join(root, 'sub-a'), { recursive: true });
  await mkdir(join(root, 'sub-b'), { recursive: true });
  await writeFile(join(root, 'keep.md'), '# keep');
  await writeFile(join(root, 'skip.txt'), 'nope');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('listDirs', () => {
  it('returns only subdirectory names', async () => {
    expect((await listDirs(root)).sort()).toEqual(['sub-a', 'sub-b']);
  });
  it('returns [] for a missing path', async () => {
    expect(await listDirs(join(root, 'nope'))).toEqual([]);
  });
});

describe('listMarkdown', () => {
  it('returns only .md filenames', async () => {
    expect(await listMarkdown(root)).toEqual(['keep.md']);
  });
  it('returns [] for a missing dir', async () => {
    expect(await listMarkdown(join(root, 'nope'))).toEqual([]);
  });
});
