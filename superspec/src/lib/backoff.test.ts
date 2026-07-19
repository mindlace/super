import { describe, it, expect } from 'vitest';
import { retryDelay, RETRY_BASE_MS, RETRY_MAX_MS } from './backoff';

describe('retryDelay', () => {
  it('starts at the base delay for the first retry', () => {
    expect(retryDelay(1)).toBe(RETRY_BASE_MS);
  });

  it('doubles with each successive attempt', () => {
    expect(retryDelay(2)).toBe(RETRY_BASE_MS * 2);
    expect(retryDelay(3)).toBe(RETRY_BASE_MS * 4);
  });

  it('caps at the ceiling so a wedged tab keeps retrying forever', () => {
    expect(retryDelay(50)).toBe(RETRY_MAX_MS);
  });

  it('never returns a non-positive delay', () => {
    for (const n of [0, -1, 1, 10]) expect(retryDelay(n)).toBeGreaterThan(0);
  });
});
