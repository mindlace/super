import { describe, expect, it } from 'vitest';
import { scrollRatio, scrollTopFor } from './scrollratio';

describe('scrollRatio', () => {
  it('is 0 when the element cannot scroll', () => {
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 })).toBe(0);
  });

  it('is the fraction of the scrollable range', () => {
    expect(scrollRatio({ scrollTop: 50, scrollHeight: 200, clientHeight: 100 })).toBe(0.5);
  });
});

describe('scrollTopFor', () => {
  it('maps a ratio onto the scrollable range', () => {
    expect(scrollTopFor(0.5, { scrollTop: 0, scrollHeight: 1100, clientHeight: 100 })).toBe(500);
  });

  it('is 0 when content is shorter than the viewport', () => {
    expect(scrollTopFor(0.7, { scrollTop: 0, scrollHeight: 80, clientHeight: 100 })).toBe(0);
  });
});
