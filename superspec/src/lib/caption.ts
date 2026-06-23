import type { DisplayGroup } from './pairing';
import { isMainPath } from './mainpath';

function childBranches(group: DisplayGroup): string {
  const seen = new Set<string>();
  for (const c of group.children) if (c.worktree) seen.add(c.worktree);
  return [...seen].join(' · ');
}

export function captionFor(group: DisplayGroup): string {
  const p = group.parent;
  const branch = p.worktree ?? (childBranches(group) || (isMainPath(p.path) ? 'main' : ''));
  const type = p.type === 'plan' || p.type === 'spec' ? '' : p.type;
  return [branch, p.project, type].filter(Boolean).join(' · ');
}
