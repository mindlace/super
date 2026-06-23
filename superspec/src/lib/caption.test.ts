import { describe, it, expect } from 'vitest';
import { captionFor } from './caption';
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
    mtime: part.recency ?? 1000,
    recency: part.recency ?? 1000,
    onMain: part.onMain
  };
}

function group(parent: SpecEntry, children: SpecEntry[] = []): DisplayGroup {
  return { parent, children, recency: parent.recency };
}

describe('captionFor', () => {
  it('orders a worktree spec as branch then project, dropping the type', () => {
    const g = group(entry({ filename: 's-design.md', type: 'spec', project: 'spec_reader', worktree: 'fix-foo' }));
    expect(captionFor(g)).toBe('fix-foo · spec_reader');
  });

  it('hoists the child plan branch onto a branch-less re-surfaced main spec', () => {
    const parent = entry({ filename: 's-design.md', type: 'spec', project: 'spec_reader', worktree: null, onMain: true });
    const child = entry({ filename: 'p.md', type: 'plan', project: 'spec_reader', worktree: 'fix-foo' });
    expect(captionFor(group(parent, [child]))).toBe('fix-foo · spec_reader');
  });

  it('joins distinct child branches when several worktrees share the spec', () => {
    const parent = entry({ filename: 's-design.md', type: 'spec', worktree: null, onMain: true });
    const c1 = entry({ filename: 'p1.md', type: 'plan', worktree: 'wtA' });
    const c2 = entry({ filename: 'p2.md', type: 'plan', worktree: 'wtB' });
    const c3 = entry({ filename: 'p3.md', type: 'plan', worktree: 'wtA' });
    expect(captionFor(group(parent, [c1, c2, c3]))).toBe('wtA · wtB · proj');
  });

  it('drops the type for a standalone plan', () => {
    const g = group(entry({ filename: 'p.md', type: 'plan', project: 'proj', worktree: 'wt1' }));
    expect(captionFor(g)).toBe('wt1 · proj');
  });

  it('keeps a non plan/spec type, ordered after project', () => {
    const g = group(entry({ filename: 'n.md', type: 'analysis', project: 'proj', worktree: 'wt1' }));
    expect(captionFor(g)).toBe('wt1 · proj · analysis');
  });

  it('drops an empty branch segment', () => {
    const g = group(entry({ filename: 's-design.md', type: 'spec', project: 'proj', worktree: null }));
    expect(captionFor(g)).toBe('proj');
  });
});
