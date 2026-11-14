import { describe, it, expect } from 'vitest';
import { buildEntries, listGroups, planLabel } from './sidebar';
import { markClosed, markOpened, type SeenState } from './seen';
import { DAY_MS } from './recency';
import type { DisplayGroup } from './pairing';
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

function group(parent: SpecEntry, children: SpecEntry[] = []): DisplayGroup {
  return {
    parent,
    children,
    created: parent.created,
    updated: Math.max(parent.updated, ...children.map((c) => c.updated))
  };
}

const empty = (): SeenState => ({ seen: {}, closed: {} });
const NOW = 10 * DAY_MS;
const g = (name: string, created: number, updated = created) =>
  group(entry({ filename: name, created, updated }));

describe('planLabel', () => {
  it('labels the first plan "plan" and later plans by position', () => {
    expect(planLabel(0)).toBe('plan');
    expect(planLabel(1)).toBe('plan 2');
    expect(planLabel(2)).toBe('plan 3');
  });
});

describe('listGroups', () => {
  it('sorts by created desc, ties by path', () => {
    const a = g('a.md', NOW - 100);
    const b = g('b.md', NOW - 50);
    const c = g('c.md', NOW - 100);
    const out = listGroups([c, b, a], [], empty(), NOW);
    expect(out.map((x) => x.parent.filename)).toEqual(['b.md', 'a.md', 'c.md']);
  });

  it('drops discovered groups not updated within 24h', () => {
    const fresh = g('fresh.md', NOW - 10);
    const stale = g('stale.md', NOW - DAY_MS - 1);
    expect(listGroups([fresh, stale], [], empty(), NOW)).toEqual([fresh]);
  });

  it('drops hidden groups until updated passes the close', () => {
    const a = g('a.md', NOW - 1000, NOW - 500);
    const s = markClosed(empty(), a.parent.path, NOW - 400);
    expect(listGroups([a], [], s, NOW)).toEqual([]);
    const bumped = { ...a, updated: NOW - 300 };
    expect(listGroups([bumped], [], s, NOW)).toEqual([bumped]);
  });

  it('keeps opened groups not shown by discovery and dedupes the rest', () => {
    const shown = g('shown.md', NOW - 10);
    const old = g('old.md', NOW - 5 * DAY_MS);
    const out = listGroups([shown], [old, shown], empty(), NOW);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((x) => x.parent.path)).size).toBe(2);
  });

  it('opened groups sort in with discovered ones by created', () => {
    const d1 = g('d1.md', NOW - 10);
    const d2 = g('d2.md', NOW - 30);
    const o = { ...g('o.md', NOW - 20), updated: NOW - 5 * DAY_MS };
    const out = listGroups([d1, d2], [o], empty(), NOW);
    expect(out.map((x) => x.parent.filename)).toEqual(['d1.md', 'o.md', 'd2.md']);
  });

  it('keeps an opened group even if it was closed', () => {
    const o = g('o.md', NOW - 5 * DAY_MS);
    const s = markClosed(empty(), o.parent.path, NOW);
    expect(listGroups([], [o], s, NOW)).toEqual([o]);
  });
});

describe('buildEntries', () => {
  it('uses captionFor and the parent title and path', () => {
    const grp = group(entry({ filename: 'a-design.md', title: 'Alpha', worktree: 'wtA' }));
    const [e] = buildEntries([grp], null, empty());
    expect(e.title).toBe('Alpha');
    expect(e.caption).toBe('wtA · proj');
    expect(e.path).toBe(grp.parent.path);
  });

  it('marks nothing active when nothing is selected', () => {
    const child = entry({ filename: 'p.md', type: 'plan' });
    const [e] = buildEntries([group(entry({ filename: 's-design.md' }), [child])], null, empty());
    expect(e.active).toBe(false);
    expect(e.plans.map((p) => p.boxed)).toEqual([false]);
  });

  it('plan links are labelled plan, plan 2 and boxed when open', () => {
    const newest = entry({ filename: 'p-new.md', type: 'plan' });
    const older = entry({ filename: 'p-old.md', type: 'plan' });
    const parent = entry({ filename: 's-design.md' });
    const [e] = buildEntries([group(parent, [newest, older])], older.path, empty());
    expect(e.active).toBe(true);
    expect(e.plans).toEqual([
      { label: 'plan', path: newest.path, boxed: false },
      { label: 'plan 2', path: older.path, boxed: true }
    ]);
  });

  it('activates when the parent is selected', () => {
    const parent = entry({ filename: 's-design.md' });
    const [e] = buildEntries([group(parent)], parent.path, empty());
    expect(e.active).toBe(true);
  });

  it('the active entry is never highlighted', () => {
    const grp = g('a.md', 100, 900);
    const s: SeenState = { seen: { [grp.parent.path]: 500 }, closed: {} };
    expect(buildEntries([grp], null, s)[0].highlighted).toBe(true);
    expect(buildEntries([grp], grp.parent.path, s)[0].highlighted).toBe(false);
  });

  it('re-marking the selected group on refresh keeps it unhighlighted after deselect', () => {
    const grp = g('a.md', 100, 900);
    let s: SeenState = { seen: { [grp.parent.path]: 500 }, closed: {} };
    const bumped = { ...grp, updated: 1200 };
    s = markOpened(s, bumped.parent.path, 1300);
    expect(buildEntries([bumped], null, s)[0].highlighted).toBe(false);
  });

  it('returns an empty array for no groups', () => {
    expect(buildEntries([], null, empty())).toEqual([]);
  });
});
