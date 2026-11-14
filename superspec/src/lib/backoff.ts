export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30_000;

/**
 * Delay before retry number `attempt` (1-based): exponential, capped.
 *
 * Capped rather than giving up: a failed /api/specs leaves specsLoaded false,
 * which disables tab retention entirely, so the tab strip must keep trying for
 * as long as the page is open.
 */
export function retryDelay(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_MAX_MS);
}
