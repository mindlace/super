import { captionFor } from './caption';
import { byCreatedDesc, type DisplayGroup } from './pairing';
import { DAY_MS } from './recency';
import { isHidden, isHighlighted, type SeenState } from './seen';

export interface PlanLink {
  label: string;
  path: string;
  boxed: boolean;
}

export interface SidebarEntry {
  title: string;
  caption: string;
  path: string;
  active: boolean;
  highlighted: boolean;
  plans: PlanLink[];
}

export function planLabel(index: number): string {
  return index === 0 ? 'plan' : `plan ${index + 1}`;
}

/**
 * Discovered groups inside the 24h window and not closed, plus explicitly opened groups
 * not already among them, newest-created first.
 */
export function listGroups(
  discovered: DisplayGroup[],
  opened: DisplayGroup[],
  s: SeenState,
  now: number
): DisplayGroup[] {
  const shown = discovered.filter((g) => g.updated >= now - DAY_MS && !isHidden(g, s));
  const paths = new Set(shown.map((g) => g.parent.path));
  const extra: DisplayGroup[] = [];
  for (const g of opened) {
    if (paths.has(g.parent.path)) continue;
    paths.add(g.parent.path);
    extra.push(g);
  }
  return [...shown, ...extra].sort(byCreatedDesc);
}

export function buildEntries(
  groups: DisplayGroup[],
  selectedPath: string | null,
  s: SeenState
): SidebarEntry[] {
  return groups.map((g) => {
    const plans: PlanLink[] = g.children.map((c, i) => ({
      label: planLabel(i),
      path: c.path,
      boxed: selectedPath === c.path
    }));
    const active = selectedPath === g.parent.path || plans.some((p) => p.boxed);
    return {
      title: g.parent.title,
      caption: captionFor(g),
      path: g.parent.path,
      active,
      highlighted: !active && isHighlighted(g, s),
      plans
    };
  });
}
