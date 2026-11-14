import { describe, it, expect } from 'vitest';
import { buildTabs, planLabel } from './tabs';
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
  return { parent, children, created: parent.created, updated: parent.updated };
}

describe('planLabel', () => {
  it('labels the first plan "plan" and later plans by position', () => {
    expect(planLabel(0)).toBe('plan');
    expect(planLabel(1)).toBe('plan 2');
    expect(planLabel(2)).toBe('plan 3');
  });
});

describe('buildTabs', () => {
  it('returns one tab per group in input order with the captionFor caption', () => {
    const g1 = group(entry({ filename: 'a-design.md', title: 'Alpha', worktree: 'wtA' }));
    const g2 = group(entry({ filename: 'b-design.md', title: 'Beta', worktree: 'wtB' }));
    const tabs = buildTabs([g1, g2], null);
    expect(tabs.map((t) => t.title)).toEqual(['Alpha', 'Beta']);
    expect(tabs[0].caption).toBe('wtA · proj');
    expect(tabs[0].path).toBe(g1.parent.path);
  });

  it('marks no tab active and no plan boxed when nothing is selected', () => {
    const child = entry({ filename: 'p.md', type: 'plan' });
    const g = group(entry({ filename: 's-design.md' }), [child]);
    const [tab] = buildTabs([g], null);
    expect(tab.active).toBe(false);
    expect(tab.plans.map((p) => p.boxed)).toEqual([false]);
  });

  it('activates the tab in spec mode when the parent path is selected', () => {
    const child = entry({ filename: 'p.md', type: 'plan' });
    const parent = entry({ filename: 's-design.md' });
    const [tab] = buildTabs([group(parent, [child])], parent.path);
    expect(tab.active).toBe(true);
    expect(tab.plans.every((p) => !p.boxed)).toBe(true);
  });

  it('activates the parent tab and boxes the matching plan when a plan is selected', () => {
    const newest = entry({ filename: 'p-new.md', type: 'plan' });
    const older = entry({ filename: 'p-old.md', type: 'plan' });
    const parent = entry({ filename: 's-design.md' });
    // children arrive newest-first, as pairAndGroup sorts them
    const [tab] = buildTabs([group(parent, [newest, older])], older.path);
    expect(tab.active).toBe(true);
    expect(tab.plans).toEqual([
      { label: 'plan', path: newest.path, boxed: false },
      { label: 'plan 2', path: older.path, boxed: true }
    ]);
  });

  it('renders a standalone plan as a tab with no plan links', () => {
    const standalone = group(entry({ filename: 'loose-plan.md', type: 'plan', title: 'Loose' }));
    const [tab] = buildTabs([standalone], null);
    expect(tab.title).toBe('Loose');
    expect(tab.plans).toEqual([]);
  });

  it('returns an empty array for no groups', () => {
    expect(buildTabs([], null)).toEqual([]);
  });

  it('marks a tab closeable only when its path is in openedPaths', () => {
    const opened = group(entry({ filename: 'opened-design.md', title: 'Opened' }));
    const normal = group(entry({ filename: 'normal-design.md', title: 'Normal' }));
    const tabs = buildTabs([opened, normal], null, new Set([opened.parent.path]));
    expect(tabs[0].closeable).toBe(true);
    expect(tabs[1].closeable).toBe(false);
  });

  it('defaults closeable to false when openedPaths is omitted', () => {
    const [tab] = buildTabs([group(entry({ filename: 's-design.md' }))], null);
    expect(tab.closeable).toBe(false);
  });
});
