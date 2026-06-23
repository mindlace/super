import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs, parseFilenameDateMs, extractTitle } from './discovery';

let root: string;

async function write(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'specreader-'));
  const aSpecs = join(root, 'projA/docs/superpowers/specs');
  const aPlans = join(root, 'projA/docs/superpowers/plans');
  const aWt = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const bSpecs = join(root, 'projB/docs/superpowers/specs');

  await write(aSpecs, '2026-06-20-foo-design.md', '# Foo Spec\n\nbody');
  await write(aPlans, '2026-06-20-foo-design.md', '# Foo Plan\n'); // same basename, other subdir -> kept
  await write(aWt, '2026-06-20-foo-design.md', '# Foo (wt copy)\n'); // dup of main specs -> excluded
  await write(aWt, '2026-06-21-bar-design.md', '## Bar Heading\n'); // unique -> kept, worktree wt1
  await write(bSpecs, '2026-06-22-baz-design.md', 'no heading here\nsecond line'); // first-line title
  await write(aSpecs, 'zzz-untitled.md', ''); // empty -> title falls back to filename

  // recency = max(mtime, filenameDate): old mtime + future-ish filename date -> filename wins
  await write(bSpecs, '2026-06-22-recency-design.md', '# Recency\n');
  const old = new Date(2020, 0, 1).getTime() / 1000;
  await utimes(join(bSpecs, '2026-06-22-recency-design.md'), old, old);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function byName(list: Awaited<ReturnType<typeof scanSpecs>>, name: string) {
  return list.find((e) => e.filename === name);
}

describe('parseFilenameDateMs', () => {
  it('parses YYYY-MM-DD and YYYY-MM-DD-HHMM, HHMM later than midnight', () => {
    expect(parseFilenameDateMs('2026-06-20-x.md')).toBeGreaterThan(0);
    expect(parseFilenameDateMs('2026-06-20-1200-x.md')).toBeGreaterThan(
      parseFilenameDateMs('2026-06-20-x.md')
    );
  });
  it('returns 0 when no date prefix', () => {
    expect(parseFilenameDateMs('no-date.md')).toBe(0);
  });
});

describe('extractTitle', () => {
  it('uses the first heading, stripped', () => {
    expect(extractTitle('# Hello World\n\nbody')).toBe('Hello World');
    expect(extractTitle('## Sub\n')).toBe('Sub');
  });
  it('falls back to the first non-empty line when no heading', () => {
    expect(extractTitle('\n\nplain first line\nmore')).toBe('plain first line');
  });
  it('returns null for empty/whitespace content', () => {
    expect(extractTitle('   \n\n')).toBeNull();
  });
});

describe('scanSpecs', () => {
  it('returns a flat array sorted by recency descending', async () => {
    const list = await scanSpecs(root);
    expect(Array.isArray(list)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].recency).toBeGreaterThanOrEqual(list[i].recency);
    }
  });

  it('includes plans alongside specs with distinct type labels', async () => {
    const list = await scanSpecs(root);
    const specFoo = list.find((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'spec');
    const planFoo = list.find((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'plan');
    expect(specFoo).toBeTruthy();
    expect(planFoo).toBeTruthy();
  });

  it('excludes worktree files that duplicate a main file (same subdir+name)', async () => {
    const list = await scanSpecs(root);
    const foos = list.filter((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'spec');
    expect(foos).toHaveLength(1);
    expect(foos[0].worktree).toBeNull();
  });

  it('includes worktree-unique files tagged with the worktree name', async () => {
    const bar = byName(await scanSpecs(root), '2026-06-21-bar-design.md');
    expect(bar?.worktree).toBe('wt1');
    expect(bar?.type).toBe('spec');
    expect(bar?.project).toBe('projA');
  });

  it('extracts titles with heading, first-line, and filename fallbacks', async () => {
    const list = await scanSpecs(root);
    const specFoo = list.find((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'spec');
    expect(specFoo?.title).toBe('Foo Spec');
    expect(byName(list, '2026-06-22-baz-design.md')?.title).toBe('no heading here');
    expect(byName(list, 'zzz-untitled.md')?.title).toBe('zzz-untitled.md');
  });

  it('recency takes the max of mtime and filename date', async () => {
    const e = byName(await scanSpecs(root), '2026-06-22-recency-design.md')!;
    expect(e.recency).toBe(parseFilenameDateMs('2026-06-22-recency-design.md'));
    expect(e.recency).toBeGreaterThan(e.mtime);
  });
});
