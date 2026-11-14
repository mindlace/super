import { describe, it, expect } from 'vitest';
import {
  CLOSED_KEY,
  SEEN_KEY,
  isHidden,
  isHighlighted,
  loadSeenState,
  markClosed,
  markOpened,
  pruneSeenState,
  recordFirstSight,
  saveSeenState,
  type SeenState
} from './seen';
import { DAY_MS } from './recency';
import type { DisplayGroup } from './pairing';

function group(path: string, created: number, updated = created): DisplayGroup {
  const parent = {
    path,
    filename: path.split('/').pop()!,
    title: path,
    project: 'proj',
    worktree: null,
    type: 'spec',
    mtime: updated,
    created,
    updated
  };
  return { parent, children: [], created, updated };
}

const empty = (): SeenState => ({ seen: {}, closed: {} });

describe('recordFirstSight', () => {
  it('first sight before page load is recorded as seen now, not highlighted', () => {
    const g = group('/a', 500);
    const s = recordFirstSight([g], empty(), 1000, 2000);
    expect(s.seen['/a']).toBe(2000);
    expect(isHighlighted(g, s)).toBe(false);
  });

  it('a doc created after page load starts highlighted', () => {
    const g = group('/a', 1500);
    const s = recordFirstSight([g], empty(), 1000, 2000);
    expect(s.seen['/a']).toBe(1499);
    expect(isHighlighted(g, s)).toBe(true);
  });

  it('first sight never overwrites an existing record', () => {
    const s0: SeenState = { seen: { '/a': 10 }, closed: {} };
    const s = recordFirstSight([group('/a', 500)], s0, 1000, 2000);
    expect(s.seen['/a']).toBe(10);
  });

  it('returns the same object when nothing is new', () => {
    const s0: SeenState = { seen: { '/a': 10 }, closed: {} };
    expect(recordFirstSight([group('/a', 5)], s0, 1000, 2000)).toBe(s0);
  });
});

describe('markOpened / markClosed / isHidden', () => {
  it('markOpened clears the highlight and any close', () => {
    const g = group('/a', 100, 900);
    const s0: SeenState = { seen: { '/a': 100 }, closed: { '/a': 500 } };
    expect(isHighlighted(g, s0)).toBe(true);
    const s = markOpened(s0, '/a', 1000);
    expect(s.seen['/a']).toBe(1000);
    expect(s.closed['/a']).toBeUndefined();
    expect(isHighlighted(g, s)).toBe(false);
  });

  it('markClosed records the close time', () => {
    expect(markClosed(empty(), '/a', 700).closed['/a']).toBe(700);
  });

  it('isHidden while updated <= closedAt, visible once updated passes it', () => {
    const s = markClosed(empty(), '/a', 700);
    expect(isHidden(group('/a', 100, 700), s)).toBe(true);
    expect(isHidden(group('/a', 100, 701), s)).toBe(false);
    expect(isHidden(group('/b', 100, 100), s)).toBe(false);
  });
});

describe('loadSeenState / saveSeenState', () => {
  const store = (map: Record<string, string>) => ({ getItem: (k: string) => map[k] ?? null });

  it('loads valid state', () => {
    const s = loadSeenState(store({ [SEEN_KEY]: '{"/a":1}', [CLOSED_KEY]: '{"/b":2}' }));
    expect(s).toEqual({ seen: { '/a': 1 }, closed: { '/b': 2 } });
  });

  it('returns empty for corrupt JSON, wrong shapes, a throwing getItem, and null storage', () => {
    expect(loadSeenState(null)).toEqual(empty());
    expect(loadSeenState(store({ [SEEN_KEY]: '{nope', [CLOSED_KEY]: '[' }))).toEqual(empty());
    expect(loadSeenState(store({ [SEEN_KEY]: '[1,2]', [CLOSED_KEY]: '"x"' }))).toEqual(empty());
    expect(loadSeenState(store({ [SEEN_KEY]: '{"/a":"1"}', [CLOSED_KEY]: 'null' }))).toEqual(
      empty()
    );
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      }
    };
    expect(loadSeenState(throwing)).toEqual(empty());
  });

  it('saves both keys as JSON', () => {
    const out: Record<string, string> = {};
    saveSeenState({ setItem: (k, v) => void (out[k] = v) }, { seen: { '/a': 1 }, closed: {} });
    expect(JSON.parse(out[SEEN_KEY])).toEqual({ '/a': 1 });
    expect(JSON.parse(out[CLOSED_KEY])).toEqual({});
  });

  it('saveSeenState swallows a throwing setItem', () => {
    const throwing = {
      setItem: () => {
        throw new Error('quota');
      }
    };
    expect(() => saveSeenState(throwing, empty())).not.toThrow();
    expect(() => saveSeenState(null, empty())).not.toThrow();
  });
});

describe('pruneSeenState', () => {
  const now = 100 * DAY_MS;

  it('drops closes older than a day and seen records older than 30 days', () => {
    const s: SeenState = {
      seen: { '/old': now - 31 * DAY_MS, '/new': now - 29 * DAY_MS },
      closed: { '/old': now - DAY_MS - 1, '/new': now - 1000 }
    };
    expect(pruneSeenState(s, now)).toEqual({
      seen: { '/new': now - 29 * DAY_MS },
      closed: { '/new': now - 1000 }
    });
  });

  it('returns the same object when nothing is dropped', () => {
    const s: SeenState = { seen: { '/a': now }, closed: { '/a': now } };
    expect(pruneSeenState(s, now)).toBe(s);
  });
});
