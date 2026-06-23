import { describe, it, expect } from 'vitest';
import { withinWindow, DAY_MS } from './recency';
import type { SpecEntry } from '$lib/types';

function entry(recency: number, filename = 'x.md'): SpecEntry {
  return {
    path: '/p/' + filename,
    filename,
    title: filename,
    project: 'p',
    worktree: null,
    type: 'spec',
    mtime: recency,
    recency
  };
}

describe('withinWindow', () => {
  const now = 1_000_000_000_000;

  it('keeps entries at or after the cutoff, drops older ones', () => {
    const inside = entry(now - DAY_MS + 1, 'inside.md');
    const old = entry(now - DAY_MS - 1, 'old.md');
    const result = withinWindow([inside, old], now);
    expect(result.map((e) => e.filename)).toEqual(['inside.md']);
  });

  it('treats exactly-at-cutoff as inside (inclusive)', () => {
    const boundary = entry(now - DAY_MS, 'boundary.md');
    expect(withinWindow([boundary], now)).toHaveLength(1);
  });

  it('preserves input order and returns [] for empty input', () => {
    const a = entry(now - 10, 'a.md');
    const b = entry(now - 5, 'b.md');
    expect(withinWindow([a, b], now).map((e) => e.filename)).toEqual(['a.md', 'b.md']);
    expect(withinWindow([], now)).toEqual([]);
  });

  it('respects a custom windowMs', () => {
    const e = entry(now - 5000, 'e.md');
    expect(withinWindow([e], now, 1000)).toHaveLength(0);
    expect(withinWindow([e], now, 10000)).toHaveLength(1);
  });
});
