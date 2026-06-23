import type { DisplayGroup } from './pairing';

export function selectionMatches(group: DisplayGroup, path: string): boolean {
  return (
    group.parent.path === path || group.children.some((c) => c.path === path)
  );
}

export function findSelectedGroup(
  groups: DisplayGroup[],
  path: string | null
): DisplayGroup | null {
  if (!path) return null;
  return groups.find((g) => selectionMatches(g, path)) ?? null;
}

/**
 * The group that should be appended to openedGroups: the cached selection
 * (lastSelectedGroup) once it has been culled from tabGroups, still matches the
 * current selection, and is not already opened. Otherwise null.
 */
export function groupToPromote(
  selectedPath: string | null,
  tabGroups: DisplayGroup[],
  lastSelectedGroup: DisplayGroup | null,
  openedGroups: DisplayGroup[]
): DisplayGroup | null {
  if (!selectedPath || !lastSelectedGroup) return null;
  if (findSelectedGroup(tabGroups, selectedPath)) return null; // still live
  if (!selectionMatches(lastSelectedGroup, selectedPath)) return null;
  if (
    openedGroups.some((o) => o.parent.path === lastSelectedGroup.parent.path)
  )
    return null;
  return lastSelectedGroup;
}
