import { watch } from 'node:fs';
import { PROJECTS_ROOT } from './config';
import { listWatchTargets } from './watchtargets';

export function isRelevantChange(relPath: string | null): boolean {
  if (relPath === null) return true;
  const p = relPath.replace(/\\/g, '/');
  return p.includes('docs/superpowers/') && p.endsWith('.md');
}

export interface WatcherHub {
  subscribe(cb: () => void): () => void;
  handleEvent(relPath: string | null): void;
  subscriberCount(): number;
}

export function createWatcherHub(debounceMs = 300): WatcherHub {
  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    timer = null;
    for (const cb of subs) cb();
  }

  return {
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    handleEvent(relPath) {
      if (!isRelevantChange(relPath)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    },
    subscriberCount() {
      return subs.size;
    }
  };
}

export interface WatchHandle {
  close(): void;
}

export type WatchFn = (
  dir: string,
  cb: (event: string, filename: string | null) => void
) => WatchHandle;

export interface WatchRegistry {
  reconcile(desired: string[]): void;
  watchedDirs(): string[];
  closeAll(): void;
}

/**
 * Holds one non-recursive watch per directory and diffs that set against a
 * desired list. Injecting watchFn keeps this testable without real FS watches.
 */
export function createWatchRegistry(
  watchFn: WatchFn,
  onEvent: (dir: string, filename: string | null) => void
): WatchRegistry {
  const open = new Map<string, WatchHandle>();

  return {
    reconcile(desired) {
      const want = new Set(desired);
      for (const [dir, handle] of open) {
        if (!want.has(dir)) {
          try {
            handle.close();
          } catch {
            // already gone; ignore
          }
          open.delete(dir);
        }
      }
      for (const dir of want) {
        if (open.has(dir)) continue;
        try {
          open.set(dir, watchFn(dir, (_e, filename) => onEvent(dir, filename)));
        } catch {
          // dir vanished between enumeration and watch; the next reconcile retries
        }
      }
    },
    watchedDirs() {
      return [...open.keys()];
    },
    closeAll() {
      for (const handle of open.values()) {
        try {
          handle.close();
        } catch {
          // ignore
        }
      }
      open.clear();
    }
  };
}

const RECONCILE_MS = 30_000;

// Singleton wired to fs.watch, stored on globalThis so Vite HMR reuses (not duplicates) it.
const g = globalThis as unknown as {
  __srWatcher?: { hub: WatcherHub; registry: WatchRegistry; started: boolean };
};

const nodeWatch: WatchFn = (dir, cb) =>
  watch(dir, { recursive: false }, (event, filename) =>
    cb(event, filename == null ? null : filename.toString())
  );

function getState() {
  if (!g.__srWatcher) {
    const hub = createWatcherHub();
    const registry = createWatchRegistry(nodeWatch, () => hub.handleEvent(null));
    g.__srWatcher = { hub, registry, started: false };
  }
  return g.__srWatcher;
}

async function reconcileTargets() {
  const state = getState();
  try {
    state.registry.reconcile(await listWatchTargets(PROJECTS_ROOT));
  } catch (err) {
    console.error('[watcher] reconcile failed:', err);
  }
}

function ensureWatching() {
  const state = getState();
  if (state.started) return;
  state.started = true;

  // Structure changes (a new project or worktree) are themselves events on a
  // watched dir, so reconcile after every flush. The interval is a safety net
  // for anything that slipped through.
  state.hub.subscribe(() => void reconcileTargets());
  setInterval(() => void reconcileTargets(), RECONCILE_MS).unref();
  void reconcileTargets();
}

export function subscribe(cb: () => void): () => void {
  ensureWatching();
  return getState().hub.subscribe(cb);
}
