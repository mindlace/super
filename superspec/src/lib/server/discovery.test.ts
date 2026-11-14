import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs, parseFilenameDateMs, extractTitle, extractHtmlTitle, listSuperpowersLocations, entryTimes } from './discovery';
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

describe('extractHtmlTitle', () => {
  it('reads the first h1', () => {
    expect(
      extractHtmlTitle('<article><header><h1>Worktree→main path fallback, with main as read-only</h1>')
    ).toBe('Worktree→main path fallback, with main as read-only');
  });
  it('strips tags, decodes entities and collapses whitespace', () => {
    expect(extractHtmlTitle('<h1 id="t">\n  A <code>b</code> &amp; c\n</h1>')).toBe('A b & c');
  });
  it('returns null with no h1 or an empty one', () => {
    expect(extractHtmlTitle('<article><p>no heading</p></article>')).toBeNull();
    expect(extractHtmlTitle('<h1>  </h1>')).toBeNull();
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
  it('returns a flat array sorted by created descending', async () => {
    const list = await scanSpecs(root);
    expect(Array.isArray(list)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].created).toBeGreaterThanOrEqual(list[i].created);
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

});

describe('entryTimes', () => {
  const base = { filename: '2026-01-05-x.md', mtime: 5000, birthtime: 3000 };

  it('uses mtime for both when git is unknown', () => {
    expect(entryTimes({ ...base, dirty: null, git: undefined })).toEqual({ created: 5000, updated: 5000 });
  });

  it('dirty: created from git, updated from mtime', () => {
    expect(entryTimes({ ...base, dirty: true, git: { created: 1000, updated: 2000 } })).toEqual({
      created: 1000,
      updated: 5000
    });
  });

  it('dirty and untracked: created is the birthtime', () => {
    expect(entryTimes({ ...base, dirty: true, git: undefined })).toEqual({ created: 3000, updated: 5000 });
  });

  it('clean: both from git', () => {
    expect(entryTimes({ ...base, dirty: false, git: { created: 1000, updated: 2000 } })).toEqual({
      created: 1000,
      updated: 2000
    });
  });

  it('clean without git history falls back to mtime', () => {
    expect(entryTimes({ ...base, dirty: false, git: undefined })).toEqual({ created: 5000, updated: 5000 });
  });

  it('birthtime 0 falls back to mtime', () => {
    expect(entryTimes({ ...base, birthtime: 0, dirty: true, git: undefined })).toEqual({
      created: 5000,
      updated: 5000
    });
  });

  it('falls back to the filename date when mtime is also unusable', () => {
    const t = entryTimes({ filename: '2026-01-05-x.md', mtime: 0, birthtime: 0, dirty: null, git: undefined });
    expect(t).toEqual({ created: parseFilenameDateMs('2026-01-05-x.md'), updated: parseFilenameDateMs('2026-01-05-x.md') });
  });
});

describe('scanSpecs times', () => {
  const SPECS = 'proj/.claude/worktrees/wt/docs/superpowers/specs';
  const AAA = '2026-11-13-aaa-design.md';
  const ZZZ = '2026-11-13-zzz-design.md';
  const REL = 'docs/superpowers/specs';

  function runner(log: string, status = ''): GitRunner {
    return async (_cwd, args) => (args.includes('log') ? log : args.includes('status') ? status : null);
  }
  const logOf = (...entries: [number, string][]) =>
    entries.map(([t, f]) => `\x01${t}\n\nA\t${REL}/${f}\n`).join('');

  async function tree() {
    return makeTree({
      'proj/.claude/worktrees/wt/.git': 'gitdir: x',
      [`${SPECS}/${AAA}`]: '# A\n',
      [`${SPECS}/${ZZZ}`]: '# Z\n'
    });
  }

  it('orders same-day committed specs by commit time, not name', async () => {
    const r = await tree();
    const log = logOf([200, ZZZ], [100, AAA]); // newest commit first
    const list = await scanSpecs(r, runner(log));
    expect(list[0].filename).toBe(ZZZ);
    expect(list[0].created).toBe(200_000);
    expect(list[1].created).toBe(100_000);
  });

  it('takes created from git and updated from mtime for a modified file', async () => {
    const r = await tree();
    const log = logOf([200, ZZZ], [100, AAA]);
    const status = ` M ${REL}/${ZZZ}\0`;
    const e = byName(await scanSpecs(r, runner(log, status)), ZZZ)!;
    expect(e.created).toBe(200_000);
    expect(e.updated).toBe(e.mtime);
  });

  it('uses birthtime as created for an untracked file', async () => {
    const r = await tree();
    const status = `?? ${REL}/${ZZZ}\0`;
    const e = byName(await scanSpecs(r, runner('', status)), ZZZ)!;
    const st = await stat(e.path);
    expect(e.created).toBe(st.birthtimeMs || st.mtimeMs);
    expect(e.updated).toBe(e.mtime);
  });

  it("falls back to mtime when git paths don't match any file", async () => {
    const r = await tree();
    const log = `\x01100\n\nA\tother/x.md\n`;
    const list = await scanSpecs(r, runner(log));
    expect(list).toHaveLength(2);
    for (const e of list) {
      expect(e.created).toBe(e.mtime);
      expect(e.updated).toBe(e.mtime);
    }
  });

  it('uses mtime for both when git cannot answer', async () => {
    const r = await tree();
    const list = await scanSpecs(r, async () => null);
    for (const e of list) {
      expect(e.created).toBe(e.mtime);
      expect(e.updated).toBe(e.mtime);
    }
  });
});

describe('scanSpecs html specs', () => {
  const SP = 'docs/superpowers';
  const WT = '.claude/worktrees/wt';

  it('lists an .html worktree spec', async () => {
    const r = await makeTree({ [`p/${WT}/${SP}/specs/2026-06-20-a-design.html`]: '<h1>A</h1>' });
    const list = await scanSpecs(r);
    expect(list.map((e) => e.filename)).toEqual(['2026-06-20-a-design.html']);
  });

  it('suppresses a worktree .html spec when main has the same name as .md', async () => {
    const r = await makeTree({
      [`p/${SP}/specs/2026-06-20-land-design.md`]: '# Land',
      [`p/${WT}/${SP}/specs/2026-06-20-land-design.html`]: '<h1>Land</h1>'
    });
    expect(await scanSpecs(r)).toEqual([]);
  });

  it('lists both forms when foo.md and foo.html sit in one worktree', async () => {
    const r = await makeTree({
      [`p/${WT}/${SP}/specs/2026-06-20-foo-design.md`]: '# Foo',
      [`p/${WT}/${SP}/specs/2026-06-20-foo-design.html`]: '<h1>Foo</h1>'
    });
    const names = (await scanSpecs(r)).map((e) => e.filename).sort();
    expect(names).toEqual(['2026-06-20-foo-design.html', '2026-06-20-foo-design.md']);
  });

  it('re-surfaces a landed .html main spec for a live worktree plan', async () => {
    const r = await makeTree({
      [`p/${SP}/specs/2026-06-19-q-design.html`]: '<h1>Q</h1>',
      [`p/${WT}/${SP}/plans/2026-06-23-q.md`]: '# Q Plan'
    });
    const spec = (await scanSpecs(r)).find((e) => e.filename === '2026-06-19-q-design.html');
    expect(spec?.onMain).toBe(true);
  });

  it('does not list files under specs/assets', async () => {
    const r = await makeTree({
      [`p/${WT}/${SP}/specs/assets/x/shot.png`]: 'png',
      [`p/${WT}/${SP}/specs/assets/x/mock.html`]: '<p>x</p>'
    });
    expect(await scanSpecs(r)).toEqual([]);
  });

  it('titles an .html spec from its h1 and falls back to the filename', async () => {
    const r = await makeTree({
      [`p/${WT}/${SP}/specs/2026-06-20-t-design.html`]: '<h1>Html Title</h1>',
      [`p/${WT}/${SP}/specs/2026-06-21-u-design.html`]: '<article></article>'
    });
    const list = await scanSpecs(r);
    expect(byName(list, '2026-06-20-t-design.html')?.title).toBe('Html Title');
    expect(byName(list, '2026-06-21-u-design.html')?.title).toBe('2026-06-21-u-design.html');
  });
});
