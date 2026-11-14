import type { DisplayGroup } from './pairing';
import { DAY_MS } from './recency';

/** Both maps are keyed by a group's parent path; values are ms timestamps. */
export interface SeenState {
  seen: Record<string, number>;
  closed: Record<string, number>;
}

export const SEEN_KEY = 'sr:seen';
export const CLOSED_KEY = 'sr:closed';

/** A seen record untouched for this long is out of the window; bounds storage. */
const SEEN_TTL_MS = 30 * DAY_MS;

function readMap(storage: Pick<Storage, 'getItem'>, key: string): Record<string, number> {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return {};
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return {};
      out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadSeenState(storage: Pick<Storage, 'getItem'> | null): SeenState {
  if (!storage) return { seen: {}, closed: {} };
  return { seen: readMap(storage, SEEN_KEY), closed: readMap(storage, CLOSED_KEY) };
}

export function saveSeenState(storage: Pick<Storage, 'setItem'> | null, s: SeenState): void {
  if (!storage) return;
  try {
    storage.setItem(SEEN_KEY, JSON.stringify(s.seen));
    storage.setItem(CLOSED_KEY, JSON.stringify(s.closed));
  } catch {
    // storage full or denied: state just stays in memory
  }
}

function filterMap(m: Record<string, number>, keep: (t: number) => boolean) {
  const out: Record<string, number> = {};
  let dropped = false;
  for (const [k, t] of Object.entries(m)) {
    if (keep(t)) out[k] = t;
    else dropped = true;
  }
  return dropped ? out : m;
}

export function pruneSeenState(s: SeenState, now: number): SeenState {
  // a visible group is always newer than a day-old close, so it would be unhidden anyway
  const closed = filterMap(s.closed, (t) => t >= now - DAY_MS);
  const seen = filterMap(s.seen, (t) => t >= now - SEEN_TTL_MS);
  return closed === s.closed && seen === s.seen ? s : { seen, closed };
}

export function recordFirstSight(
  groups: DisplayGroup[],
  s: SeenState,
  pageLoadedAt: number,
  now: number
): SeenState {
  let seen: Record<string, number> | null = null;
  for (const g of groups) {
    const path = g.parent.path;
    if (s.seen[path] !== undefined || seen?.[path] !== undefined) continue;
    seen ??= { ...s.seen };
    // created after page load: one tick before creation, so it starts highlighted
    seen[path] = g.created <= pageLoadedAt ? now : g.created - 1;
  }
  return seen ? { ...s, seen } : s;
}

export function markOpened(s: SeenState, groupPath: string, now: number): SeenState {
  if (s.seen[groupPath] === now && s.closed[groupPath] === undefined) return s;
  const closed = { ...s.closed };
  delete closed[groupPath];
  return { seen: { ...s.seen, [groupPath]: now }, closed };
}

export function markClosed(s: SeenState, groupPath: string, now: number): SeenState {
  if (s.closed[groupPath] === now) return s;
  return { ...s, closed: { ...s.closed, [groupPath]: now } };
}

export function isHidden(g: DisplayGroup, s: SeenState): boolean {
  const at = s.closed[g.parent.path];
  return at !== undefined && g.updated <= at;
}

export function isHighlighted(g: DisplayGroup, s: SeenState): boolean {
  const at = s.seen[g.parent.path];
  return at !== undefined && g.updated > at;
}
