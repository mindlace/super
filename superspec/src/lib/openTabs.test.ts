import { describe, it, expect } from 'vitest';
import { selectionMatches, findSelectedGroup, groupToPromote } from './openTabs';
import type { DisplayGroup } from './pairing';
import type { SpecEntry } from '$lib/types';

function entry(path: string, type: SpecEntry['type'] = 'spec'): SpecEntry {
  return {
    path,
    filename: path.split('/').pop()!,
    title: path,
    project: 'proj',
    worktree: 'wt',
    type,
    mtime: 1000,
    recency: 1000
  };
}

function group(parentPath: string, childPaths: string[] = []): DisplayGroup {
  return {
    parent: entry(parentPath),
    children: childPaths.map((p) => entry(p, 'plan')),
    recency: 1000
  };
}

describe('selectionMatches', () => {
  it('matches the parent path', () => {
    expect(selectionMatches(group('/a/spec.md'), '/a/spec.md')).toBe(true);
  });
  it('matches a child plan path', () => {
    expect(selectionMatches(group('/a/spec.md', ['/a/plan.md']), '/a/plan.md')).toBe(true);
  });
  it('does not match an unrelated path', () => {
    expect(selectionMatches(group('/a/spec.md', ['/a/plan.md']), '/b/spec.md')).toBe(false);
  });
});

describe('findSelectedGroup', () => {
  it('finds the group whose parent or child matches', () => {
    const g1 = group('/a/spec.md', ['/a/plan.md']);
    const g2 = group('/b/spec.md');
    expect(findSelectedGroup([g1, g2], '/a/plan.md')).toBe(g1);
    expect(findSelectedGroup([g1, g2], '/b/spec.md')).toBe(g2);
  });
  it('returns null when nothing matches or path is null', () => {
    const g1 = group('/a/spec.md');
    expect(findSelectedGroup([g1], '/x/spec.md')).toBeNull();
    expect(findSelectedGroup([g1], null)).toBeNull();
  });
});

describe('groupToPromote', () => {
  const culled = group('/a/spec.md', ['/a/plan.md']);

  it('promotes the cached selection when it is no longer in tabGroups', () => {
    // selection points at the culled group's child; tabGroups no longer contains it
    expect(groupToPromote('/a/plan.md', [group('/b/spec.md')], culled, [])).toBe(culled);
  });

  it('does not promote while the selection is still live in tabGroups', () => {
    expect(groupToPromote('/a/spec.md', [culled], culled, [])).toBeNull();
  });

  it('does not promote when already in openedGroups', () => {
    expect(groupToPromote('/a/spec.md', [group('/b/spec.md')], culled, [culled])).toBeNull();
  });

  it('does not promote when the cache does not match the current selection', () => {
    expect(groupToPromote('/c/spec.md', [group('/b/spec.md')], culled, [])).toBeNull();
  });

  it('does not promote when there is no selection or no cache', () => {
    expect(groupToPromote(null, [], culled, [])).toBeNull();
    expect(groupToPromote('/a/spec.md', [], null, [])).toBeNull();
  });
});
