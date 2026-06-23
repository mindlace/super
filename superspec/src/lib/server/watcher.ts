import { watch } from 'node:fs';
import { PROJECTS_ROOT } from './config';

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

// Singleton wired to fs.watch, stored on globalThis so Vite HMR reuses (not duplicates) it.
const g = globalThis as unknown as {
  __srWatcher?: { hub: WatcherHub; started: boolean };
};

function getState() {
  if (!g.__srWatcher) g.__srWatcher = { hub: createWatcherHub(), started: false };
  return g.__srWatcher;
}

function ensureWatching() {
  const state = getState();
  if (state.started) return;
  state.started = true;
  try {
    watch(PROJECTS_ROOT, { recursive: true }, (_event, filename) => {
      const rel = filename == null ? null : filename.toString();
      state.hub.handleEvent(rel);
    });
  } catch (err) {
    console.error('[watcher] failed to start fs.watch:', err);
  }
}

export function subscribe(cb: () => void): () => void {
  ensureWatching();
  return getState().hub.subscribe(cb);
}
