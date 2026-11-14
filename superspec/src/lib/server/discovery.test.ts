import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs, parseFilenameDateMs, extractTitle, listSuperpowersLocations } from './discovery';
import { makeTree } from './testtree';
import type { GitRunner } from './gitdirty';

let root: string;

async function write(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'specreader-'));
  const aSpecs = join(root, 'projA/docs/superpowers/specs');
  const aPlans = join(root, 'projA/docs/superpowers/plans');
  const aWtSpecs = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const aWtPlans = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/plans');
  const bWtSpecs = join(root, 'projB/.claude/worktrees/wt2/docs/superpowers/specs');

  // Main-checkout specs are never listed; they only serve to suppress merged
  // worktree copies of the same file.
  await write(aSpecs, '2026-06-20-foo-design.md', '# Foo Spec\n\nbody'); // main -> excluded
  await write(aPlans, '2026-06-20-foo-design.md', '# Foo Plan\n'); // main -> excluded
  await write(aWtSpecs, '2026-06-20-foo-design.md', '# Foo (wt copy)\n'); // dup of main -> excluded

  // Worktree-unique files are the ones that show up.
  await write(aWtSpecs, '2026-06-21-bar-design.md', '## Bar Heading\n'); // kept, wt1, type spec
  await write(aWtPlans, '2026-06-21-bar-design.md', '# Bar Plan\n'); // kept, wt1, type plan
  await write(bWtSpecs, '2026-06-22-baz-design.md', 'no heading here\nsecond line'); // first-line title
  await write(bWtSpecs, 'zzz-untitled.md', ''); // empty -> title falls back to filename

  // recency = max(mtime, filenameDate): old mtime + future-ish filename date -> filename wins
  await write(bWtSpecs, '2026-06-22-recency-design.md', '# Recency\n');
  const old = new Date(2020, 0, 1).getTime() / 1000;
  await utimes(join(bWtSpecs, '2026-06-22-recency-design.md'), old, old);

  // A branch with a slash ("support/thing") nests the worktree one level deeper.
  const dNested = join(root, 'projD/.claude/worktrees/support/thing/docs/superpowers/specs');
  await write(dNested, '2026-06-24-nested-design.md', '# Nested\n');
  // A container dir holding no worktree at all must not break the walk.
  await mkdir(join(root, 'projD/.claude/worktrees/feature'), { recursive: true });

  // projC: spec landed on main, plan still in a worktree -> spec is re-surfaced.
  const cSpecs = join(root, 'projC/docs/superpowers/specs');
  const cWtPlans = join(root, 'projC/.claude/worktrees/wt3/docs/superpowers/plans');
  await write(cSpecs, '2026-06-19-qux-design.md', '# Qux Spec\n');
  await write(cWtPlans, '2026-06-23-qux.md', '# Qux Plan\n');
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

describe('listSuperpowersLocations', () => {
  it('returns main-checkout and worktree superpowers dirs, including nested worktrees', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/.claude/worktrees/feat/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/feat/docs/superpowers/plans/b.md': '# B',
      'proj/.claude/worktrees/support/nested/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/support/nested/docs/superpowers/specs/c.md': '# C'
    });

    const locs = await listSuperpowersLocations(root);
    const got = locs.map((l) => `${l.project}:${l.worktree ?? '(main)'}`).sort();

    expect(got).toEqual(['proj:(main)', 'proj:feat', 'proj:support/nested']);
    expect(locs.every((l) => l.dir.startsWith(root))).toBe(true);
    expect(locs.every((l) => l.dir.endsWith(join('docs', 'superpowers')))).toBe(true);
  });

  it('omits projects that have no superpowers dir at all', async () => {
    const root = await makeTree({ 'plain/README.md': 'hi' });
    expect(await listSuperpowersLocations(root)).toEqual([]);
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
    const specBar = list.find((e) => e.filename === '2026-06-21-bar-design.md' && e.type === 'spec');
    const planBar = list.find((e) => e.filename === '2026-06-21-bar-design.md' && e.type === 'plan');
    expect(specBar).toBeTruthy();
    expect(planBar).toBeTruthy();
  });

  it('re-surfaces a main spec when a live worktree plan matches it by slug', async () => {
    const list = await scanSpecs(root);
    const quxSpec = list.find((e) => e.filename === '2026-06-19-qux-design.md');
    expect(quxSpec?.type).toBe('spec');
    expect(quxSpec?.onMain).toBe(true);
    expect(quxSpec?.worktree).toBeNull();
    expect(quxSpec?.project).toBe('projC');
    const quxPlan = list.find((e) => e.filename === '2026-06-23-qux.md');
    expect(quxPlan?.type).toBe('plan');
    expect(quxPlan?.worktree).toBe('wt3');
  });

  it('does not re-surface a main spec that has no matching worktree plan', async () => {
    // projA's foo spec is on main but no live worktree plan matches its slug.
    const list = await scanSpecs(root);
    expect(list.some((e) => e.filename === '2026-06-20-foo-design.md')).toBe(false);
  });

  it('never tags an ordinary worktree entry as main', async () => {
    const list = await scanSpecs(root);
    for (const e of list) {
      if (e.onMain) expect(e.worktree).toBeNull();
      else expect(e.worktree).not.toBeNull();
    }
  });

  it('excludes a worktree file once it also exists in the main checkout', async () => {
    const list = await scanSpecs(root);
    const foos = list.filter((e) => e.filename === '2026-06-20-foo-design.md');
    expect(foos).toHaveLength(0);
  });

  it('includes worktree-unique files tagged with the worktree name', async () => {
    const list = await scanSpecs(root);
    const bar = list.find((e) => e.filename === '2026-06-21-bar-design.md' && e.type === 'spec');
    expect(bar?.worktree).toBe('wt1');
    expect(bar?.project).toBe('projA');
  });

  it('finds specs in a worktree nested under a slashed branch name', async () => {
    const nested = byName(await scanSpecs(root), '2026-06-24-nested-design.md');
    expect(nested?.project).toBe('projD');
    expect(nested?.worktree).toBe('support/thing');
    expect(nested?.type).toBe('spec');
  });

  it('extracts titles with heading, first-line, and filename fallbacks', async () => {
    const list = await scanSpecs(root);
    const barSpec = list.find((e) => e.filename === '2026-06-21-bar-design.md' && e.type === 'spec');
    expect(barSpec?.title).toBe('Bar Heading');
    expect(byName(list, '2026-06-22-baz-design.md')?.title).toBe('no heading here');
    expect(byName(list, 'zzz-untitled.md')?.title).toBe('zzz-untitled.md');
  });

  it('recency takes the max of mtime and filename date', async () => {
    const e = byName(await scanSpecs(root), '2026-06-22-recency-design.md')!;
    expect(e.recency).toBe(parseFilenameDateMs('2026-06-22-recency-design.md'));
    expect(e.recency).toBeGreaterThan(e.mtime);
  });
});

describe('scanSpecs recency vs. checkout mtime', () => {
  // A fresh `git worktree add` stamps every file with the checkout time, which
  // would otherwise report a whole backlog of old specs as edited today.
  const DATED = '2026-01-05-backlog-design.md';
  const UNDATED = 'undated-design.md';

  async function treeWithWorktreeSpecs() {
    return makeTree({
      [`proj/.claude/worktrees/wt/.git`]: 'gitdir: whatever',
      [`proj/.claude/worktrees/wt/docs/superpowers/specs/${DATED}`]: '# Backlog\n',
      [`proj/.claude/worktrees/wt/docs/superpowers/specs/${UNDATED}`]: '# Undated\n'
    });
  }

  it('ignores the checkout mtime of a clean file and uses its filename date', async () => {
    const treeRoot = await treeWithWorktreeSpecs();
    const clean: GitRunner = async () => '';

    const e = byName(await scanSpecs(treeRoot, clean), DATED)!;
    expect(e.recency).toBe(parseFilenameDateMs(DATED));
    expect(e.recency).toBeLessThan(e.mtime);
  });

  it('keeps the mtime of a file git reports as modified', async () => {
    const treeRoot = await treeWithWorktreeSpecs();
    const dirty: GitRunner = async () => ` M docs/superpowers/specs/${DATED}\0`;

    const e = byName(await scanSpecs(treeRoot, dirty), DATED)!;
    expect(e.recency).toBe(e.mtime);
    expect(e.recency).toBeGreaterThan(parseFilenameDateMs(DATED));
  });

  it('falls back to mtime for a clean file with no date in its name', async () => {
    const treeRoot = await treeWithWorktreeSpecs();
    const clean: GitRunner = async () => '';

    const e = byName(await scanSpecs(treeRoot, clean), UNDATED)!;
    expect(e.recency).toBe(e.mtime);
  });

  it('treats every file as recent when git cannot answer', async () => {
    const treeRoot = await treeWithWorktreeSpecs();
    const noGit: GitRunner = async () => null;

    const e = byName(await scanSpecs(treeRoot, noGit), DATED)!;
    expect(e.recency).toBe(e.mtime);
  });
});
