# Live List via FS Events + Persisted Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar list update live when superpowers `.md` files change anywhere under `~/Projects` (via a server fs-watcher pushed over SSE), and persist the chosen file so it reopens after a reload/restart.

**Architecture:** A module-level `fs.watch(PROJECTS_ROOT, { recursive: true })` (macOS FSEvents) feeds a debounced "hub" that fans out to subscribers. A SvelteKit SSE endpoint subscribes and pushes `data: changed` to the browser; the client re-fetches `/api/specs` on each event. The selected path is stored in `localStorage` and restored on mount. The existing 3s open-file content poll is left unchanged.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Node `fs.watch`, Server-Sent Events (`EventSource`), Vitest.

## Global Constraints

- **Watch mechanism:** native `fs.watch(PROJECTS_ROOT, { recursive: true })` — no new dependency. macOS-only recursive (acceptable; the user is on macOS).
- **Relevant change:** a path containing `docs/superpowers/` and ending in `.md`; a `null` filename counts as relevant (conservative).
- **Debounce ~300ms** so a git checkout / branch switch collapses into one notification.
- **Singleton** watcher on `globalThis` with a subscriber set + dev-HMR guard; starts lazily on first subscriber; `fs.watch` failure is logged once and degrades gracefully (no crash).
- **Transport:** SSE endpoint at `/api/events` (`text/event-stream`, `cache-control: no-store`), ~30s heartbeat comment, unsubscribe + clear heartbeat on cancel.
- **Client:** `EventSource('/api/events')` → on message, `loadSpecs()`. Auto-reconnect is built in. Close on unmount.
- **Persisted selection:** `localStorage` key `sr:selectedPath`; on mount open `?path=` deep-link else the stored path; clear the stored value if the restored file fails to load (404); a deep-link always wins and overwrites the stored value.
- Leave the existing 3s `pollExternalChange` content poll in place. Svelte 5 runes. Server localhost-only.

---

### Task 1: Watcher module

**Files:**
- Create: `src/lib/server/watcher.ts`
- Test: `src/lib/server/watcher.test.ts`

**Interfaces:**
- Consumes: `PROJECTS_ROOT` from `./config`.
- Produces:
  - `isRelevantChange(relPath: string | null): boolean`
  - `createWatcherHub(debounceMs?: number): WatcherHub` where `WatcherHub = { subscribe(cb: () => void): () => void; handleEvent(relPath: string | null): void; subscriberCount(): number }`
  - `subscribe(cb: () => void): () => void` — the singleton entry point used by the SSE endpoint (lazily starts `fs.watch`).

- [ ] **Step 1: Write the failing tests**

`src/lib/server/watcher.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/watcher.test.ts`
Expected: FAIL — cannot resolve `./watcher`.

- [ ] **Step 3: Implement the watcher**

`src/lib/server/watcher.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/watcher.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` → expect 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/watcher.ts src/lib/server/watcher.test.ts
git commit -m "feat: add debounced fs watcher hub for superpowers md changes"
```

---

### Task 2: SSE endpoint

**Files:**
- Create: `src/routes/api/events/+server.ts`

**Interfaces:**
- Consumes: `subscribe` from `$lib/server/watcher`.
- Produces: `GET /api/events` → an `text/event-stream` SSE response that emits `data: changed\n\n` on each watcher notification, with a ~30s heartbeat.

- [ ] **Step 1: Implement the endpoint**

`src/routes/api/events/+server.ts`:
```ts
import { subscribe } from '$lib/server/watcher';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // stream already closed; ignore
        }
      };
      send(': connected\n\n');
      unsubscribe = subscribe(() => send('data: changed\n\n'));
      heartbeat = setInterval(() => send(': ping\n\n'), 30000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive'
    }
  });
};
```

- [ ] **Step 2: Verify the stream and live push**

Run:
```bash
npm run dev >/tmp/sr-evt-dev.log 2>&1 &
sleep 4
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/sr-evt-dev.log | head -1 | grep -oE '[0-9]+')
echo "dev on $PORT"
# headers: confirm event-stream
curl -s -D - -o /dev/null -N --max-time 2 "http://127.0.0.1:$PORT/api/events" | grep -i 'content-type'
# capture stream, then trigger a change in a real superpowers dir
( curl -s -N --max-time 6 "http://127.0.0.1:$PORT/api/events" > /tmp/sr-evt-out.txt & )
sleep 1
TARGET=$(ls -d "$HOME"/Projects/*/docs/superpowers/specs 2>/dev/null | head -1)
touch "$TARGET/zzz-watcher-probe.md"
sleep 2
rm -f "$TARGET/zzz-watcher-probe.md"
echo "--- stream output ---"; cat /tmp/sr-evt-out.txt
kill %1 2>/dev/null
```
Expected: `content-type: text/event-stream`; the stream output contains `: connected` and at least one `data: changed` (from the touch). (If 4510 is taken by your running dev server, the script reads the actual port from the log.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/events
git commit -m "feat: add SSE endpoint pushing fs-change notifications"
```

---

### Task 3: Client — live refresh + persisted selection

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `GET /api/events` (SSE), `GET /api/specs`, `GET /api/spec`.
- Produces: live sidebar refresh on SSE messages; `selectSpec` returns `Promise<boolean>` (false on non-OK load) and persists the path; restore-on-mount with deep-link precedence.

- [ ] **Step 1: Make `selectSpec` report success and persist the path**

In `src/routes/+page.svelte`, add a constant next to the other storage constant (after `const STORAGE_KEY = 'sr:sidebarWidth';`):
```ts
  const SELECTED_KEY = 'sr:selectedPath';
```

Replace the whole `selectSpec` function with this version (returns a boolean, handles non-OK, persists on success):
```ts
  async function selectSpec(path: string): Promise<boolean> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    if (!res.ok) return false;
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    selectedPath = path;
    saveStatus = 'idle';
    localStorage.setItem(SELECTED_KEY, path);
    return true;
  }
```
(The `Sidebar` `onSelect` prop type is `(path: string) => void`; passing a function that returns `Promise<boolean>` is compatible — the return value is ignored there.)

- [ ] **Step 2: Subscribe to SSE and restore the persisted selection on mount**

Replace the whole `onMount(...)` block at the bottom of the `<script>` with:
```ts
  onMount(() => {
    const savedWidth = Number(localStorage.getItem(STORAGE_KEY));
    if (savedWidth >= MIN_W && savedWidth <= MAX_W) sidebarWidth = savedWidth;

    loadSpecs();

    const fromQuery = new URLSearchParams(window.location.search).get('path');
    const toOpen = fromQuery ?? localStorage.getItem(SELECTED_KEY);
    if (toOpen) {
      selectSpec(toOpen).then((ok) => {
        if (!ok && !fromQuery) localStorage.removeItem(SELECTED_KEY);
      });
    }

    const events = new EventSource('/api/events');
    events.onmessage = () => loadSpecs();

    const pollId = setInterval(pollExternalChange, 3000);

    return () => {
      clearInterval(pollId);
      events.close();
    };
  });
```

- [ ] **Step 3: Verify types and runtime**

Run: `npm run check` → expect 0 errors.
Run: `npx vitest run` → all suites still pass (watcher + paths + discovery + recency).
Runtime smoke: start the dev server, confirm `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/` is `200`, then KILL it (capture PID, kill). (ssr=false, so don't grep rendered text.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: live list via SSE and persisted file selection"
```

---

## Verification (end-to-end, real browser)

1. `npm install && npm test` — watcher (isRelevantChange + debounce), paths, discovery, recency suites pass.
2. `npm run build && npm start` (or `npm run dev`) — app live.
3. **Live list:** with the app open, in another terminal create a new `…/docs/superpowers/specs/2026-…-probe.md` → it appears in the sidebar within ~300ms with no reload; edit its heading → title/order updates; delete it → it disappears.
4. **Worktree:** add a spec inside a project's `.claude/worktrees/<wt>/docs/superpowers/specs/` → appears, worktree-tagged.
5. **No spam:** run `git checkout <branch>` in a project → a single coalesced refresh, not a flood.
6. **Persisted selection:** select a spec, reload the page → same spec reopens. Stop & restart the server, reload → still reopens. Manually delete the persisted spec then reload → falls back to "Select a spec.", no error, and the stored key is cleared.
7. **Deep-link precedence:** open `http://localhost:<port>/open?path=<abs>` → that spec opens (and becomes the persisted selection), overriding any stored value.

## Out of Scope (future)

- Retiring the 3s open-file content poll in favor of fs events.
- A periodic clock tick to age items out of the 24h list with zero fs activity.
- launchd / permanent auto-start.
