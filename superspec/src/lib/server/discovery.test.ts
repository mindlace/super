import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs } from './discovery';

let root: string;

async function spec(dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), `# ${name}\n`);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'specreader-'));
  const aMain = join(root, 'projA/docs/superpowers/specs');
  const aWt = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const bMain = join(root, 'projB/docs/superpowers/specs');
  await spec(aMain, '2026-01-01-foo-design.md');
  await spec(aMain, '2026-02-02-bar-design.md');
  await spec(aWt, '2026-01-01-foo-design.md'); // inherited dup -> excluded
  await spec(aWt, '2026-03-03-1200-new-design.md'); // unique -> included
  await spec(bMain, '2026-05-05-baz-design.md');
  await mkdir(join(root, 'projC'), { recursive: true }); // no specs -> excluded
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scanSpecs', () => {
  it('groups by project, excludes empty projects', async () => {
    const groups = await scanSpecs(root);
    expect(groups.map((g) => g.project)).toEqual(['projB', 'projA']);
  });

  it('sorts projects by newest spec descending', async () => {
    const groups = await scanSpecs(root);
    expect(groups[0].project).toBe('projB'); // 2026-05-05 newest overall
  });

  it('excludes worktree specs that duplicate a main spec', async () => {
    const groups = await scanSpecs(root);
    const a = groups.find((g) => g.project === 'projA')!;
    const foos = a.specs.filter((s) => s.filename === '2026-01-01-foo-design.md');
    expect(foos).toHaveLength(1);
    expect(foos[0].worktree).toBeNull();
  });

  it('includes worktree-only specs with a worktree tag, newest first', async () => {
    const groups = await scanSpecs(root);
    const a = groups.find((g) => g.project === 'projA')!;
    expect(a.specs.map((s) => s.filename)).toEqual([
      '2026-03-03-1200-new-design.md',
      '2026-02-02-bar-design.md',
      '2026-01-01-foo-design.md'
    ]);
    expect(a.specs[0].worktree).toBe('wt1');
  });
});
