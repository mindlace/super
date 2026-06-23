import { describe, it, expect } from 'vitest';
import { normalizedSlug, pairAndGroup, type DisplayGroup } from './pairing';
import type { SpecEntry } from '$lib/types';

function entry(part: Partial<SpecEntry> & { filename: string }): SpecEntry {
  return {
    path: '/p/' + (part.project ?? 'proj') + '/' + part.filename,
    filename: part.filename,
    title: part.title ?? part.filename,
    project: part.project ?? 'proj',
    worktree: part.worktree ?? null,
    type: part.type ?? 'spec',
    mtime: part.recency ?? 1000,
    recency: part.recency ?? 1000,
    onMain: part.onMain
  };
}

function ids(groups: DisplayGroup[]) {
  return groups.map((g) => ({
    parent: g.parent.filename,
    children: g.children.map((c) => c.filename)
  }));
}

describe('normalizedSlug', () => {
  it('strips date prefix, .md, and trailing -design, lowercases', () => {
    expect(normalizedSlug('2026-06-22-spec-reader-live-list-design.md')).toBe('spec-reader-live-list');
    expect(normalizedSlug('2026-06-22-spec-reader-live-list.md')).toBe('spec-reader-live-list');
    expect(normalizedSlug('2026-06-22-1712-Foo-Bar-design.md')).toBe('foo-bar');
    expect(normalizedSlug('no-date-here.md')).toBe('no-date-here');
  });
});

describe('pairAndGroup', () => {
  it('pairs a spec with its plan in the same project (plan indented)', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', recency: 100 });
    const plan = entry({ filename: '2026-06-21-foo.md', type: 'plan', recency: 200 });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-foo-design.md', children: ['2026-06-21-foo.md'] }
    ]);
    expect(groups[0].recency).toBe(200); // max of the two
  });

  it('does NOT pair across different projects', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', project: 'A' });
    const plan = entry({ filename: '2026-06-20-foo.md', type: 'plan', project: 'B' });
    const groups = pairAndGroup([spec, plan]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('pairs a worktree plan with the project main spec (worktree excluded from key)', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', worktree: null });
    const plan = entry({ filename: '2026-06-20-foo.md', type: 'plan', worktree: 'wt1' });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-foo-design.md', children: ['2026-06-20-foo.md'] }
    ]);
  });

  it('pairs by identical title when slugs differ', () => {
    const spec = entry({ filename: '2026-06-20-alpha-design.md', type: 'spec', title: 'Same Title' });
    const plan = entry({ filename: '2026-06-20-beta.md', type: 'plan', title: 'Same Title' });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-alpha-design.md', children: ['2026-06-20-beta.md'] }
    ]);
  });

  it('leaves an orphan plan, a plan-less spec, and a non-spec/plan file standalone', () => {
    const orphanPlan = entry({ filename: '2026-06-20-lonely.md', type: 'plan', recency: 300 });
    const soloSpec = entry({ filename: '2026-06-20-solo-design.md', type: 'spec', recency: 200 });
    const other = entry({ filename: '2026-06-20-notes.md', type: 'analysis', recency: 100 });
    const groups = pairAndGroup([soloSpec, orphanPlan, other]);
    expect(groups.map((g) => g.parent.filename)).toEqual([
      '2026-06-20-lonely.md', // 300
      '2026-06-20-solo-design.md', // 200
      '2026-06-20-notes.md' // 100
    ]);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('does not pair via title fallback across different projects', () => {
    const spec = entry({ filename: '2026-06-20-alpha-design.md', type: 'spec', project: 'A', title: 'Shared' });
    const plan = entry({ filename: '2026-06-20-beta.md', type: 'plan', project: 'B', title: 'Shared' });
    const groups = pairAndGroup([spec, plan]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('attaches the plan to the newest spec when two specs share a pair key', () => {
    const older = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', recency: 10 });
    const newer = entry({ filename: '2026-06-21-foo-design.md', type: 'spec', recency: 50 });
    const plan = entry({ filename: '2026-06-22-foo.md', type: 'plan', recency: 30 });
    const groups = pairAndGroup([older, newer, plan]);
    const newerGroup = groups.find((g) => g.parent.filename === '2026-06-21-foo-design.md');
    const olderGroup = groups.find((g) => g.parent.filename === '2026-06-20-foo-design.md');
    expect(newerGroup?.children.map((c) => c.filename)).toEqual(['2026-06-22-foo.md']);
    expect(olderGroup?.children).toEqual([]);
  });

  it('sorts groups by group recency desc and children by recency desc', () => {
    const specA = entry({ filename: '2026-06-20-a-design.md', type: 'spec', project: 'A', recency: 10 });
    const planA1 = entry({ filename: '2026-06-20-a.md', type: 'plan', project: 'A', recency: 50 });
    const planA2 = entry({ filename: '2026-06-21-a.md', type: 'plan', project: 'A', recency: 40 });
    const specB = entry({ filename: '2026-06-20-b-design.md', type: 'spec', project: 'B', recency: 5 });
    const groups = pairAndGroup([specA, planA1, planA2, specB]);
    expect(groups[0].parent.filename).toBe('2026-06-20-a-design.md'); // group recency 50
    expect(groups[0].children.map((c) => c.filename)).toEqual([
      '2026-06-20-a.md', // 50
      '2026-06-21-a.md' // 40
    ]);
    expect(groups[1].parent.filename).toBe('2026-06-20-b-design.md');
  });

  it('nests a worktree plan under a re-surfaced main spec', () => {
    const spec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, recency: 10 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', recency: 50 });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-19-qux-design.md', children: ['2026-06-23-qux.md'] }
    ]);
  });

  it('drops a re-surfaced main spec that ends up childless', () => {
    const spec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true });
    const groups = pairAndGroup([spec]);
    expect(groups).toEqual([]);
  });

  it('keeps an ordinary childless worktree spec', () => {
    const spec = entry({ filename: '2026-06-19-solo-design.md', type: 'spec', worktree: 'wt1' });
    const groups = pairAndGroup([spec]);
    expect(groups.map((g) => g.parent.filename)).toEqual(['2026-06-19-solo-design.md']);
  });

  it('prefers a worktree spec over a re-surfaced main spec for the same plan', () => {
    const mainSpec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, recency: 10 });
    const wtSpec = entry({ filename: '2026-06-22-qux-design.md', type: 'spec', worktree: 'wt3', recency: 40 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', recency: 50 });
    const groups = pairAndGroup([mainSpec, wtSpec, plan]);
    // newest spec wins the plan; the now-childless main spec is dropped.
    expect(ids(groups)).toEqual([
      { parent: '2026-06-22-qux-design.md', children: ['2026-06-23-qux.md'] }
    ]);
  });
});
