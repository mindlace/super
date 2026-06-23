import type { SpecEntry } from '$lib/types';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function withinWindow(
  specs: SpecEntry[],
  nowMs: number,
  windowMs: number = DAY_MS
): SpecEntry[] {
  const cutoff = nowMs - windowMs;
  return specs.filter((s) => s.recency >= cutoff);
}
