# Targeted Filesystem Watches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single recursive `fs.watch` over `~/Projects` (127 GB) with a reconciled set of ~100 non-recursive watches on only the directories that can hold spec/plan markdown.

**Architecture:** Extract the "where do superpowers dirs live" walk out of `scanSpecs()` into a shared `listSuperpowersLocations()`, so the scanner and the watcher enumerate the same paths from one source of truth. A new watch registry opens one non-recursive `fs.watch` per target directory and reconciles that set (open added / close removed) on startup, after every debounced flush, and on a slow 30 s safety interval — so new projects and worktrees get picked up without any recursive watching.

**Tech Stack:** Node `node:fs` (`watch`, non-recursive), TypeScript, Vitest.

## Global Constraints

- Watches must be **non-recursive**. No call anywhere may pass `{ recursive: true }`.
- `PROJECTS_ROOT` and `SUPERPOWERS_SEGMENT` come from `src/lib/server/config.ts` — never hardcode `~/Projects` or `docs/superpowers`.
- Every new pure function takes an explicit `root` parameter so it is unit-testable against a fixture tree, matching the existing convention in `discovery.ts`.
- The watcher singleton stays on `globalThis` so Vite HMR reuses rather than duplicates it.
- Svelte 5 runes, 2-space indent, single quotes, 100 char width.
- `scanSpecs()` observable output must not change. Its existing tests in `src/lib/server/discovery.test.ts` must pass untouched.

---

### Task 1: Extract shared superpowers-location enumeration

Pulls the project/worktree walk out of `scanSpecs()` into a reusable function. This is a pure refactor — `scanSpecs()` behavior is unchanged and its existing tests are the regression net.

**Files:**
- Modify: `src/lib/server/discovery.ts`
- Test: `src/lib/server/discovery.test.ts`

**Interfaces:**
- Consumes: `listDirs`, `exists` from `./fswalk`; `PROJECTS_ROOT`, `SUPERPOWERS_SEGMENT` from `./config`; existing `listWorktrees(wtRoot, prefix?, depth?)`.
- Produces:
  ```ts
  export interface SuperpowersLocation {
    project: string;         // "planafoot"
    worktree: string | null; // "support/foo", or null for the main checkout
    dir: string;             // absolute path to the docs/superpowers directory
  }
  export async function listSuperpowersLocations(root?: string): Promise<SuperpowersLocation[]>
  ```
  Task 2 and Task 3 both depend on this exact shape.

- [ ] **Step 1: Add a reusable fixture helper**

`discovery.test.ts` currently builds one shared tree in `beforeAll` with a `write(dir, name, body)` helper. The new tests need their own small trees, so add a per-test tree builder. Create `src/lib/server/testtree.ts` (a test-only helper, imported by both this task's and Task 2's tests):

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Builds a throwaway directory tree from a map of relative-path -> file body.
 * Returns the absolute root. Intended for tests only.
 */
export async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specreader-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  return root;
}
```

- [ ] **Step 2: Write the failing test**

Add to `src/lib/server/discovery.test.ts`:

```ts
import { listSuperpowersLocations } from './discovery';
import { makeTree } from './testtree';

describe('listSuperpowersLocations', () => {
  it('returns main-checkout and worktree superpowers dirs, including nested worktrees', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/.claude/worktrees/feat/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/feat/docs/superpowers/plans/b.md': '# B',
      'proj/.claude/worktrees/support/nested/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/support/nested/docs/superpowers/specs/c.md': '# C'
    });

    const locs = await listSuperpowersLocations(root);
    const got = locs.map((l) => `${l.project}:${l.worktree ?? '(main)'}`).sort();

    expect(got).toEqual(['proj:(main)', 'proj:feat', 'proj:support/nested']);
    expect(locs.every((l) => l.dir.startsWith(root))).toBe(true);
    expect(locs.every((l) => l.dir.endsWith(join('docs', 'superpowers')))).toBe(true);
  });

  it('omits projects that have no superpowers dir at all', async () => {
    const root = await makeTree({ 'plain/README.md': 'hi' });
    expect(await listSuperpowersLocations(root)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: FAIL — `listSuperpowersLocations is not a function` (or an import error).

- [ ] **Step 4: Add the implementation**

Add to `src/lib/server/discovery.ts`, above `scanSpecs`:

```ts
export interface SuperpowersLocation {
  project: string;
  worktree: string | null;
  dir: string;
}

/**
 * Every docs/superpowers directory that exists under `root` — main checkouts and
 * worktrees alike. Single source of truth for both scanSpecs (what to read) and
 * the watcher (what to watch), so the two can never drift apart.
 */
export async function listSuperpowersLocations(
  root: string = PROJECTS_ROOT
): Promise<SuperpowersLocation[]> {
  const out: SuperpowersLocation[] = [];
  for (const project of await listDirs(root)) {
    const mainSuper = join(root, project, SUPERPOWERS_SEGMENT);
    if (await exists(mainSuper)) {
      out.push({ project, worktree: null, dir: mainSuper });
    }
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listWorktrees(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      if (await exists(wtSuper)) {
        out.push({ project, worktree: wt, dir: wtSuper });
      }
    }
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: PASS — both new tests, and every pre-existing test in the file still green.

- [ ] **Step 6: Rewire `scanSpecs` to consume the shared enumeration**

This is the step that makes the sharing real. Without it the walk is duplicated and the watcher can still drift from the scanner. Replace the whole body of `scanSpecs` in `src/lib/server/discovery.ts`:

```ts
export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<SpecEntry[]> {
  const out: SpecEntry[] = [];

  const byProject = new Map<string, SuperpowersLocation[]>();
  for (const loc of await listSuperpowersLocations(root)) {
    const arr = byProject.get(loc.project) ?? [];
    arr.push(loc);
    byProject.set(loc.project, arr);
  }

  for (const [project, locs] of byProject) {
    const mainLoc = locs.find((l) => l.worktree === null);

    // Specs in the main checkout are intentionally not listed; we only surface
    // active worktree work. We still record them so a worktree copy that has
    // already landed on main drops off the list too.
    const mainSet = new Set<string>();
    if (mainLoc) {
      for (const sub of await listDirs(mainLoc.dir)) {
        for (const name of await listMarkdown(join(mainLoc.dir, sub))) {
          mainSet.add(`${sub}/${name}`);
        }
      }
    }

    const planSlugs = new Set<string>();
    for (const loc of locs) {
      if (loc.worktree === null) continue;
      for (const sub of await listDirs(loc.dir)) {
        const dir = join(loc.dir, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          const entry = await makeEntry(dir, name, project, loc.worktree, sub);
          out.push(entry);
          if (entry.type === 'plan') planSlugs.add(normalizedSlug(name));
        }
      }
    }

    // Re-surface a landed main spec when a live worktree plan still references
    // it (same project, same slug), so the plan keeps its nested parent.
    if (mainLoc) {
      const mainSpecsDir = join(mainLoc.dir, 'specs');
      for (const name of await listMarkdown(mainSpecsDir)) {
        if (!planSlugs.has(normalizedSlug(name))) continue;
        const entry = await makeEntry(mainSpecsDir, name, project, null, 'specs');
        entry.onMain = true;
        out.push(entry);
      }
    }
  }

  // secondary sort by type is a stable display tiebreaker for equal-recency entries
  out.sort((a, b) => b.recency - a.recency || b.type.localeCompare(a.type));
  return out;
}
```

Behavior is preserved: projects with no superpowers dir anywhere previously contributed nothing and now are simply absent from `byProject`; the final sort makes iteration order irrelevant. The `exists()` import may now be unused in this file — remove it from the import if so.

- [ ] **Step 7: Verify the refactor changed no observable output**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: PASS — the pre-existing `scanSpecs` tests are the regression net here and must be green **without modification**. If any needed editing to pass, the refactor changed behavior; revert Step 6 and redo it.

Run: `npm run check`
Expected: 0 errors (catches an unused `exists` import).

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/discovery.ts src/lib/server/discovery.test.ts src/lib/server/testtree.ts
git commit -m "refactor: share superpowers-location enumeration between scanSpecs and watcher"
```

---

### Task 2: Compute the watch target set

Turns the locations from Task 1 into the concrete list of directories to watch, including the structural directories needed to notice *new* projects and worktrees appearing.

**Files:**
- Create: `src/lib/server/watchtargets.ts`
- Create: `src/lib/server/watchtargets.test.ts`

**Interfaces:**
- Consumes: `listSuperpowersLocations` (Task 1); `listDirs` from `./fswalk`; `PROJECTS_ROOT` from `./config`.
- Produces:
  ```ts
  export async function listWatchTargets(root?: string): Promise<string[]>
  ```
  Returns absolute directory paths, deduplicated and sorted. Task 3 consumes this.

Why each category is in the set:
- `root` itself — a brand-new project directory appears here.
- `<project>/.claude/worktrees` and its intermediate container dirs — a brand-new worktree appears here. Container dirs matter because a slashed branch name (`support/foo`) nests one level deeper.
- each `docs/superpowers` dir — the `specs/` or `plans/` subdir being created shows up here.
- each `specs/` and `plans/` subdir — this is where the actual `.md` writes land.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/watchtargets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { listWatchTargets } from './watchtargets';
import { makeTree } from './testtree';

describe('listWatchTargets', () => {
  it('includes the root, worktree containers, superpowers dirs, and their leaf subdirs', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/.claude/worktrees/feat/.git': 'gitdir: whatever',
      'proj/.claude/worktrees/feat/docs/superpowers/plans/b.md': '# B'
    });

    const targets = await listWatchTargets(root);
    const rel = targets.map((t) => t.slice(root.length + 1) || '.');

    expect(rel).toContain('.');
    expect(rel).toContain('proj/.claude/worktrees');
    expect(rel).toContain('proj/docs/superpowers');
    expect(rel).toContain('proj/docs/superpowers/specs');
    expect(rel).toContain('proj/.claude/worktrees/feat/docs/superpowers');
    expect(rel).toContain('proj/.claude/worktrees/feat/docs/superpowers/plans');
  });

  it('never includes a source tree or node_modules directory', async () => {
    const root = await makeTree({
      'proj/docs/superpowers/specs/a.md': '# A',
      'proj/node_modules/pkg/index.js': '',
      'proj/src/lib/thing.ts': ''
    });
    const targets = await listWatchTargets(root);
    expect(targets.some((t) => t.includes('node_modules'))).toBe(false);
    expect(targets.some((t) => t.endsWith('/proj/src'))).toBe(false);
  });

  it('returns a deduplicated, sorted list', async () => {
    const root = await makeTree({ 'proj/docs/superpowers/specs/a.md': '# A' });
    const targets = await listWatchTargets(root);
    expect(targets).toEqual([...new Set(targets)].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/watchtargets.test.ts`
Expected: FAIL — cannot resolve module `./watchtargets`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/watchtargets.ts`:

```ts
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listSuperpowersLocations } from './discovery';
import { exists, listDirs } from './fswalk';

const MAX_WORKTREE_DEPTH = 3;

/**
 * Container directories under a .claude/worktrees root. A slashed branch name
 * ("support/foo") means a new worktree can appear one or more levels down, so we
 * watch the intermediate dirs too — otherwise its creation goes unnoticed.
 *
 * The "is this a worktree root?" test must match listWorktrees() in discovery.ts
 * exactly: a .git link or a superpowers dir. Stopping there is what keeps the
 * worktree's own source tree out of the watch set. Note .git in a worktree is a
 * *file*, so this uses exists() rather than checking listDirs output.
 */
async function worktreeContainers(wtRoot: string, depth = 1): Promise<string[]> {
  const out = [wtRoot];
  if (depth >= MAX_WORKTREE_DEPTH) return out;
  for (const name of await listDirs(wtRoot)) {
    const dir = join(wtRoot, name);
    const isWorktree =
      (await exists(join(dir, '.git'))) || (await exists(join(dir, SUPERPOWERS_SEGMENT)));
    if (isWorktree) continue;
    out.push(...(await worktreeContainers(dir, depth + 1)));
  }
  return out;
}

/**
 * Absolute directories to place non-recursive watches on. Deliberately narrow:
 * only spec-bearing leaves plus the structural dirs where new projects and
 * worktrees appear. Never the project source trees.
 */
export async function listWatchTargets(root: string = PROJECTS_ROOT): Promise<string[]> {
  const targets = new Set<string>([root]);

  for (const project of await listDirs(root)) {
    for (const c of await worktreeContainers(join(root, project, '.claude', 'worktrees'))) {
      targets.add(c);
    }
  }

  for (const loc of await listSuperpowersLocations(root)) {
    targets.add(loc.dir);
    for (const sub of await listDirs(loc.dir)) {
      targets.add(join(loc.dir, sub));
    }
  }

  return [...targets].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/watchtargets.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/watchtargets.ts src/lib/server/watchtargets.test.ts
git commit -m "feat: compute targeted watch directory set"
```

---

### Task 3: Replace the recursive watch with a reconciling registry

Swaps the actual `fs.watch` call. The registry is injected with its `watch` function so it can be tested without touching the real filesystem.

**Files:**
- Modify: `src/lib/server/watcher.ts`
- Test: `src/lib/server/watcher.test.ts`

**Interfaces:**
- Consumes: `listWatchTargets` (Task 2).
- Produces: `subscribe(cb)` — unchanged signature, so `src/routes/api/events/+server.ts` needs no edit.
- New exported internals for testing:
  ```ts
  export interface WatchHandle { close(): void }
  export type WatchFn = (dir: string, cb: (event: string, filename: string | null) => void) => WatchHandle;
  export interface WatchRegistry {
    reconcile(desired: string[]): void;
    watchedDirs(): string[];
    closeAll(): void;
  }
  export function createWatchRegistry(watchFn: WatchFn, onEvent: (dir: string, filename: string | null) => void): WatchRegistry
  ```

**Note on `isRelevantChange`:** its meaning changes. Previously it received a path relative to `~/Projects` and tested for a `docs/superpowers/` segment. Now the watch is *already* scoped to a relevant directory, and the callback filename is a bare entry name (`2026-07-19-x.md` or `specs`). Keep the function exported and keep its existing tests — it is still the right filter for a full relative path — but the registry must not use it as the per-event filter. Any event on a watched dir is relevant by construction.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/server/watcher.test.ts`:

```ts
import { createWatchRegistry } from './watcher';

function fakeWatch() {
  const open = new Map<string, { closed: boolean }>();
  const fn = (dir: string) => {
    const h = { closed: false };
    open.set(dir, h);
    return { close: () => { h.closed = true; open.delete(dir); } };
  };
  return { fn, open };
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
    const counting = (dir: string) => { calls.push(dir); return fn(dir); };
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/watcher.test.ts`
Expected: FAIL — `createWatchRegistry is not a function`.

- [ ] **Step 3: Write the registry**

Add to `src/lib/server/watcher.ts`, keeping `isRelevantChange` and `createWatcherHub` exactly as they are:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/watcher.test.ts`
Expected: PASS — the four new registry tests plus all pre-existing hub/filter tests.

- [ ] **Step 5: Replace the recursive watch wiring**

In `src/lib/server/watcher.ts`, replace the entire `ensureWatching` function and the `g.__srWatcher` state shape. Delete the `watch(PROJECTS_ROOT, { recursive: true }, ...)` call.

```ts
import { watch } from 'node:fs';
import { PROJECTS_ROOT } from './config';
import { listWatchTargets } from './watchtargets';

const RECONCILE_MS = 30_000;

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
```

Note the `onEvent` handler passes `null` to `hub.handleEvent`, which `isRelevantChange` treats as relevant — correct here, because the watch is already scoped to a directory that matters.

- [ ] **Step 6: Verify nothing recursive remains and the suite is green**

Run: `grep -rn "recursive: true" src/`
Expected: no output.

Run: `npm test`
Expected: PASS, all files.

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/watcher.ts src/lib/server/watcher.test.ts
git commit -m "perf: replace recursive fs.watch with targeted per-directory watches"
```

---

### Task 4: Verify live behavior against the real tree

Confirms the rewrite actually reduces `fseventsd` pressure and still delivers updates — the whole point of the change. This is manual verification; there is no automated test for FSEvents load.

**Files:**
- Modify: `CLAUDE.md` (the "Live updates" architecture paragraph)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server listening on `127.0.0.1:4510`.

- [ ] **Step 2: Confirm the watch count is bounded**

In a second shell, find the dev server PID and count its open FSEvents/dir handles:

```bash
pgrep -f "vite dev" | head -1 | xargs -I{} lsof -p {} | grep -c "Projects"
```

Expected: roughly 60–120 entries, **not** many thousands. If it is in the thousands, a source tree leaked into the target set — re-check `worktreeContainers`.

- [ ] **Step 3: Confirm live updates still work**

Open `http://127.0.0.1:4510` in a browser. In a third shell:

```bash
touch ~/Projects/spec_reader/.claude/worktrees/targeted-watches/docs/superpowers/plans/2026-07-19-targeted-watches.md
```

Expected: the spec list refreshes within ~1 second (300 ms debounce plus fetch).

- [ ] **Step 4: Confirm a brand-new worktree is picked up**

```bash
mkdir -p ~/Projects/spec_reader/.claude/worktrees/probe/docs/superpowers/specs
echo '# Probe' > ~/Projects/spec_reader/.claude/worktrees/probe/docs/superpowers/specs/2026-07-19-probe.md
```

Expected: "Probe" appears in the list within ~1 s (the `.claude/worktrees` watch fires, which triggers a reconcile that adds the new leaf dirs). If it takes up to 30 s, the flush-triggered reconcile is not wired — check that `ensureWatching` subscribes to the hub.

Clean up: `rm -rf ~/Projects/spec_reader/.claude/worktrees/probe`

- [ ] **Step 5: Update the architecture docs**

In `CLAUDE.md`, replace the sentence "A single recursive `fs.watch` on `PROJECTS_ROOT` feeds a debounced hub (300ms)." with:

```markdown
A set of ~100 **non-recursive** `fs.watch` handles feeds a debounced hub (300ms). Targets come from `listWatchTargets()` (`src/lib/server/watchtargets.ts`) — the root, each `.claude/worktrees` container, and each `docs/superpowers` dir plus its `specs`/`plans` leaves — enumerated from the same `listSuperpowersLocations()` that `scanSpecs()` uses, so watcher and scanner cannot drift. The set is reconciled after every flush and every 30s, which is how new projects and worktrees get picked up. Watching `PROJECTS_ROOT` recursively is a mistake: it is ~127GB and floods `fseventsd`.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe targeted watch strategy"
```
