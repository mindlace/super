import { describe, it, expect, vi, afterEach } from 'vitest';
import { isRelevantChange, createWatcherHub } from './watcher';

describe('isRelevantChange', () => {
  it('matches specs and plans markdown under docs/superpowers', () => {
    expect(isRelevantChange('planafoot/docs/superpowers/specs/2026-06-22-x.md')).toBe(true);
    expect(isRelevantChange('proj/docs/superpowers/plans/2026-06-22-y.md')).toBe(true);
  });
  it('treats a null filename as relevant (conservative)', () => {
    expect(isRelevantChange(null)).toBe(true);
  });
  it('ignores non-markdown and non-superpowers paths', () => {
    expect(isRelevantChange('proj/node_modules/a/b.md')).toBe(false);
    expect(isRelevantChange('proj/.git/COMMIT_EDITMSG')).toBe(false);
    expect(isRelevantChange('proj/docs/superpowers/specs/x.txt')).toBe(false);
    expect(isRelevantChange('proj/README.md')).toBe(false);
  });
});

describe('createWatcherHub', () => {
  afterEach(() => vi.useRealTimers());

  it('debounces a burst of relevant events into one subscriber call', () => {
    vi.useFakeTimers();
    const hub = createWatcherHub(300);
    const cb = vi.fn();
    hub.subscribe(cb);
    hub.handleEvent('p/docs/superpowers/specs/a.md');
    hub.handleEvent('p/docs/superpowers/specs/a.md');
    hub.handleEvent('p/docs/superpowers/specs/b.md');
    vi.advanceTimersByTime(299);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not schedule for irrelevant events', () => {
    vi.useFakeTimers();
    const hub = createWatcherHub(300);
    const cb = vi.fn();
    hub.subscribe(cb);
    hub.handleEvent('p/node_modules/x.md');
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops calling after unsubscribe', () => {
    vi.useFakeTimers();
    const hub = createWatcherHub(300);
    const cb = vi.fn();
    const off = hub.subscribe(cb);
    off();
    hub.handleEvent('p/docs/superpowers/specs/a.md');
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    expect(hub.subscriberCount()).toBe(0);
  });
});
