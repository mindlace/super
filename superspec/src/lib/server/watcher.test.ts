import { describe, it, expect, vi, afterEach } from 'vitest';
import { isRelevantChange, createWatcherHub, createWatchRegistry } from './watcher';

describe('isRelevantChange', () => {
  it('matches specs and plans markdown under docs/superpowers', () => {
    expect(isRelevantChange('planafoot/docs/superpowers/specs/2026-06-22-x.md')).toBe(true);
    expect(isRelevantChange('proj/docs/superpowers/plans/2026-06-22-y.md')).toBe(true);
  });
  it('matches .html specs but not files under assets', () => {
    expect(isRelevantChange('p/docs/superpowers/specs/x.html')).toBe(true);
    expect(isRelevantChange('p/docs/superpowers/specs/assets/x/a.png')).toBe(false);
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

function fakeWatch() {
  const open = new Map<string, { closed: boolean }>();
  const callbacks = new Map<string, (event: string, filename: string | null) => void>();
  const errorCallbacks = new Map<string, (err: unknown) => void>();
  const fn = (
    dir: string,
    cb: (event: string, filename: string | null) => void,
    onError: (err: unknown) => void
  ) => {
    const h = { closed: false };
    open.set(dir, h);
    callbacks.set(dir, cb);
    errorCallbacks.set(dir, onError);
    return { close: () => { h.closed = true; open.delete(dir); } };
  };
  return {
    fn,
    open,
    fireEvent: (dir: string, event: string, filename: string | null) =>
      callbacks.get(dir)?.(event, filename),
    fireError: (dir: string, err: unknown) => errorCallbacks.get(dir)?.(err)
  };
}

describe('createWatchRegistry', () => {
  it('opens a watch per desired directory', () => {
    const { fn, open } = fakeWatch();
    const reg = createWatchRegistry(fn, () => {});
    reg.reconcile(['/a', '/b']);
    expect(reg.watchedDirs().sort()).toEqual(['/a', '/b']);
    expect(open.size).toBe(2);
  });

  it('closes watches for directories that disappear and opens newly added ones', () => {
    const { fn, open } = fakeWatch();
    const reg = createWatchRegistry(fn, () => {});
    reg.reconcile(['/a', '/b']);
    reg.reconcile(['/b', '/c']);
    expect(reg.watchedDirs().sort()).toEqual(['/b', '/c']);
    expect([...open.keys()].sort()).toEqual(['/b', '/c']);
  });

  it('does not reopen a watch that is already open', () => {
    const calls: string[] = [];
    const { fn } = fakeWatch();
    const counting: typeof fn = (dir, cb, onError) => {
      calls.push(dir);
      return fn(dir, cb, onError);
    };
    const reg = createWatchRegistry(counting, () => {});
    reg.reconcile(['/a']);
    reg.reconcile(['/a']);
    expect(calls).toEqual(['/a']);
  });

  it('closeAll releases every watch', () => {
    const { fn, open } = fakeWatch();
    const reg = createWatchRegistry(fn, () => {});
    reg.reconcile(['/a', '/b']);
    reg.closeAll();
    expect(reg.watchedDirs()).toEqual([]);
    expect(open.size).toBe(0);
  });

  it('delivers a filesystem event on a watched dir to onEvent with that dir', () => {
    const { fn, fireEvent } = fakeWatch();
    const onEvent = vi.fn();
    const reg = createWatchRegistry(fn, onEvent);
    reg.reconcile(['/a', '/b']);
    fireEvent('/a', 'change', 'x.md');
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('/a', 'x.md');
  });

  it('leaves watchedDirs clean when watchFn throws on open, and retries on the next reconcile', () => {
    const { fn, open } = fakeWatch();
    let shouldThrow = true;
    const flaky: typeof fn = (dir, cb, onError) => {
      if (shouldThrow) throw new Error('ENOENT: dir does not exist yet');
      return fn(dir, cb, onError);
    };
    const reg = createWatchRegistry(flaky, () => {});
    reg.reconcile(['/a']);
    expect(reg.watchedDirs()).toEqual([]);
    expect(open.size).toBe(0);

    shouldThrow = false;
    reg.reconcile(['/a']);
    expect(reg.watchedDirs()).toEqual(['/a']);
    expect(open.size).toBe(1);
  });

  it('removes a dir from the registry on an error from an opened watcher, without throwing', () => {
    const { fn, open, fireError } = fakeWatch();
    const reg = createWatchRegistry(fn, () => {});
    reg.reconcile(['/a', '/b']);
    expect(() => fireError('/a', new Error('EPERM'))).not.toThrow();
    expect(reg.watchedDirs()).toEqual(['/b']);
    expect(open.size).toBe(1);
  });
});
