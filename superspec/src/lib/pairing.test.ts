import { describe, it, expect } from 'vitest';
import { normalizedSlug, pairAndGroup, byCreatedDesc, soloGroup, type DisplayGroup } from './pairing';
import type { SpecEntry } from '$lib/types';

function entry(part: Partial<SpecEntry> & { filename: string }): SpecEntry {
  return {
    path: '/p/' + (part.project ?? 'proj') + '/' + part.filename,
    filename: part.filename,
    title: part.title ?? part.filename,
    project: part.project ?? 'proj',
    worktree: part.worktree ?? null,
    type: part.type ?? 'spec',
    mtime: part.updated ?? 1000,
    created: part.created ?? 1000,
    updated: part.updated ?? part.created ?? 1000,
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

describe('normalizedSlug html', () => {
  it('strips .html like .md', () => {
    expect(normalizedSlug('2026-11-13-foo-design.html')).toBe('foo');
  });
});

describe('pairAndGroup', () => {
  it('pairs an .html spec with an .md plan', () => {
    const spec = entry({ filename: '2026-11-13-foo-design.html', type: 'spec', created: 100 });
    const plan = entry({ filename: '2026-11-13-foo.md', type: 'plan', created: 200 });
    expect(ids(pairAndGroup([spec, plan]))).toEqual([
      { parent: '2026-11-13-foo-design.html', children: ['2026-11-13-foo.md'] }
    ]);
  });

  it('pairs a spec with its plan in the same project (plan indented)', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', created: 100 });
    const plan = entry({ filename: '2026-06-21-foo.md', type: 'plan', created: 200 });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-foo-design.md', children: ['2026-06-21-foo.md'] }
    ]);
    expect(groups[0].created).toBe(100); // the spec's
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
    const orphanPlan = entry({ filename: '2026-06-20-lonely.md', type: 'plan', created: 300 });
    const soloSpec = entry({ filename: '2026-06-20-solo-design.md', type: 'spec', created: 200 });
    const other = entry({ filename: '2026-06-20-notes.md', type: 'analysis', created: 100 });
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
    const older = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', created: 10 });
    const newer = entry({ filename: '2026-06-21-foo-design.md', type: 'spec', created: 50 });
    const plan = entry({ filename: '2026-06-22-foo.md', type: 'plan', created: 30 });
    const groups = pairAndGroup([older, newer, plan]);
    const newerGroup = groups.find((g) => g.parent.filename === '2026-06-21-foo-design.md');
    const olderGroup = groups.find((g) => g.parent.filename === '2026-06-20-foo-design.md');
    expect(newerGroup?.children.map((c) => c.filename)).toEqual(['2026-06-22-foo.md']);
    expect(olderGroup?.children).toEqual([]);
  });

  it('children sort by created desc', () => {
    const spec = entry({ filename: '2026-06-20-a-design.md', type: 'spec', project: 'A', created: 10 });
    const p1 = entry({ filename: '2026-06-20-a.md', type: 'plan', project: 'A', created: 50 });
    const p2 = entry({ filename: '2026-06-21-a.md', type: 'plan', project: 'A', created: 40 });
    const groups = pairAndGroup([spec, p1, p2]);
    expect(groups[0].children.map((c) => c.filename)).toEqual(['2026-06-20-a.md', '2026-06-21-a.md']);
  });

  it('sorts groups by created desc', () => {
    const a = entry({ filename: '2026-06-20-a-design.md', type: 'spec', project: 'A', created: 10 });
    const b = entry({ filename: '2026-06-20-b-design.md', type: 'spec', project: 'B', created: 20 });
    expect(pairAndGroup([a, b]).map((g) => g.parent.filename)).toEqual([
      '2026-06-20-b-design.md',
      '2026-06-20-a-design.md'
    ]);
  });

  it("group created is the spec's even when its plan is newer", () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', created: 10 });
    const plan = entry({ filename: '2026-06-21-foo.md', type: 'plan', created: 500 });
    expect(pairAndGroup([spec, plan])[0].created).toBe(10);
  });

  it('group updated is the max over spec and plans', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', created: 10, updated: 20 });
    const plan = entry({ filename: '2026-06-21-foo.md', type: 'plan', created: 15, updated: 300 });
    expect(pairAndGroup([spec, plan])[0].updated).toBe(300);
  });

  it('a plan update never reorders groups', () => {
    const a = entry({ filename: '2026-06-20-a-design.md', type: 'spec', project: 'A', created: 10 });
    const planA = entry({ filename: '2026-06-20-a.md', type: 'plan', project: 'A', created: 11, updated: 999 });
    const b = entry({ filename: '2026-06-20-b-design.md', type: 'spec', project: 'B', created: 20 });
    expect(pairAndGroup([a, planA, b]).map((g) => g.parent.filename)).toEqual([
      '2026-06-20-b-design.md',
      '2026-06-20-a-design.md'
    ]);
  });

  it('equal created breaks by parent path', () => {
    const z = entry({ filename: '2026-06-20-z-design.md', type: 'spec', created: 10 });
    const a = entry({ filename: '2026-06-20-a-design.md', type: 'spec', created: 10 });
    expect(pairAndGroup([z, a]).map((g) => g.parent.filename)).toEqual([
      '2026-06-20-a-design.md',
      '2026-06-20-z-design.md'
    ]);
    expect(byCreatedDesc(soloGroup(a), soloGroup(z))).toBeLessThan(0);
  });

  it('newest-created spec wins a slug collision', () => {
    const older = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', created: 10, updated: 900 });
    const newer = entry({ filename: '2026-06-21-foo-design.md', type: 'spec', created: 50, updated: 60 });
    const plan = entry({ filename: '2026-06-22-foo.md', type: 'plan', created: 30 });
    const g = pairAndGroup([older, newer, plan]).find((x) => x.parent === newer);
    expect(g?.children).toHaveLength(1);
  });

  it('nests a worktree plan under a re-surfaced main spec', () => {
    const spec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, created: 10 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', created: 50 });
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
    const mainSpec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, created: 10 });
    const wtSpec = entry({ filename: '2026-06-22-qux-design.md', type: 'spec', worktree: 'wt3', created: 40 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', created: 50 });
    const groups = pairAndGroup([mainSpec, wtSpec, plan]);
    // newest spec wins the plan; the now-childless main spec is dropped.
    expect(ids(groups)).toEqual([
      { parent: '2026-06-22-qux-design.md', children: ['2026-06-23-qux.md'] }
    ]);
  });
});
