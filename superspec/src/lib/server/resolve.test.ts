import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDoc } from './resolve';

let root: string;

async function write(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'resolve-'));

  // projA worktree: a spec with a sibling plan (same slug) -> plan should attach.
  const aWtSpecs = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const aWtPlans = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/plans');
  await write(aWtSpecs, '2026-06-21-bar-design.md', '# Bar\n');
  await write(aWtPlans, '2026-06-21-bar.md', '# Bar Plan\n');

  // projB main checkout: a doc that only lives on main (escape-hatch scope).
  const bMainSpecs = join(root, 'projB/docs/superpowers/specs');
  await write(bMainSpecs, '2026-06-10-onmain-design.md', '# On Main\n');

  // Same basename in two projects, different recency -> newest must win.
  const cWtSpecs = join(root, 'projC/.claude/worktrees/wtc/docs/superpowers/specs');
  const dWtSpecs = join(root, 'projD/.claude/worktrees/wtd/docs/superpowers/specs');
  await write(cWtSpecs, 'dupe.md', '# Older Dupe\n');
  await write(dWtSpecs, 'dupe.md', '# Newer Dupe\n');
  const older = new Date(2020, 0, 1).getTime() / 1000;
  await utimes(join(cWtSpecs, 'dupe.md'), older, older);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('resolveDoc', () => {
  it('matches a bare name without .md and attaches sibling plans for a spec', async () => {
    const g = await resolveDoc('2026-06-21-bar-design', root);
    expect(g?.parent.filename).toBe('2026-06-21-bar-design.md');
    expect(g?.parent.type).toBe('spec');
    expect(g?.children.map((c) => c.filename)).toEqual(['2026-06-21-bar.md']);
    expect(g?.children[0].type).toBe('plan');
  });

  it('matches a bare name with .md', async () => {
    const g = await resolveDoc('2026-06-21-bar-design.md', root);
    expect(g?.parent.filename).toBe('2026-06-21-bar-design.md');
  });

  it('matches a relative path fragment by suffix', async () => {
    const g = await resolveDoc('specs/2026-06-10-onmain-design.md', root);
    expect(g?.parent.project).toBe('projB');
    expect(g?.parent.worktree).toBeNull();
  });

  it('matches a fully-qualified absolute path', async () => {
    const abs = join(root, 'projB/docs/superpowers/specs/2026-06-10-onmain-design.md');
    const g = await resolveDoc(abs, root);
    expect(g?.parent.filename).toBe('2026-06-10-onmain-design.md');
  });

  it('opens the newest file when the name is ambiguous', async () => {
    const g = await resolveDoc('dupe', root);
    expect(g?.parent.project).toBe('projD');
    expect(g?.parent.title).toBe('Newer Dupe');
  });

  it('returns a childless group when the matched doc is a plan', async () => {
    const g = await resolveDoc('2026-06-21-bar', root);
    expect(g?.parent.type).toBe('plan');
    expect(g?.children).toEqual([]);
  });

  it('returns null when nothing matches', async () => {
    expect(await resolveDoc('does-not-exist', root)).toBeNull();
  });

  it('returns null for an absolute path outside the glob', async () => {
    expect(await resolveDoc('/etc/passwd', root)).toBeNull();
  });
});
