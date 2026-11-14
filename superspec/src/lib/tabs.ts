import { captionFor } from './caption';
import type { DisplayGroup } from './pairing';

export interface PlanLink {
  label: string;
  path: string;
  boxed: boolean;
}

export interface Tab {
  title: string;
  caption: string;
  path: string;
  active: boolean;
  closeable: boolean;
  plans: PlanLink[];
}

export function planLabel(index: number): string {
  return index === 0 ? 'plan' : `plan ${index + 1}`;
}

export function buildTabs(
  groups: DisplayGroup[],
  selectedPath: string | null,
  openedPaths: Set<string> = new Set()
): Tab[] {
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
      closeable: openedPaths.has(g.parent.path),
      plans
    };
  });
}
