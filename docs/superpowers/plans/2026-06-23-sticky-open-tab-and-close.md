# Sticky Open Tab + Per-Tab Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the currently-open tab from vanishing when its spec is culled (worktree merge / 24h expiry), by promoting the selected group into `openedGroups` — where it inherits stickiness and the close ×.

**Architecture:** Extract the promotion decision into pure helpers (`src/lib/openTabs.ts`, unit-tested), then wire them into `+page.svelte` via one `$effect` that captures the live selected group while visible and promotes the cached copy when it's culled. No changes to `tabs.ts`, `TabStrip.svelte`, or `closeOpened` — promoted tabs are ordinary `openedGroups` members.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest.

## Global Constraints

- Svelte 5 runes (`$state`, `$derived`, `$effect`), 2-space indent, single quotes, 100-char width.
- Tests are colocated `*.test.ts`, pure-unit (no FS/global mocking) — test against plain inputs.
- Reuse existing types: `DisplayGroup` from `$lib/pairing` (`{ parent: SpecEntry; children: SpecEntry[]; recency: number }`).
- Run `npm test` and `npm run check` before declaring done.

---

### Task 1: Pure open-tab helpers

**Files:**
- Create: `src/lib/openTabs.ts`
- Test: `src/lib/openTabs.test.ts`

**Interfaces:**
- Consumes: `DisplayGroup` from `./pairing`.
- Produces:
  - `selectionMatches(group: DisplayGroup, path: string): boolean` — true if `path` is the group's parent path or one of its child paths.
  - `findSelectedGroup(groups: DisplayGroup[], path: string | null): DisplayGroup | null` — the first group in `groups` that `selectionMatches`, else `null`.
  - `groupToPromote(selectedPath: string | null, tabGroups: DisplayGroup[], lastSelectedGroup: DisplayGroup | null, openedGroups: DisplayGroup[]): DisplayGroup | null` — returns the group that should be appended to `openedGroups` (the cached selection that has been culled and isn't already opened), else `null`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/openTabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectionMatches, findSelectedGroup, groupToPromote } from './openTabs';
import type { DisplayGroup } from './pairing';
import type { SpecEntry } from '$lib/types';

function entry(path: string, type: SpecEntry['type'] = 'spec'): SpecEntry {
  return {
    path,
    filename: path.split('/').pop()!,
    title: path,
    project: 'proj',
    worktree: 'wt',
    type,
    mtime: 1000,
    recency: 1000
  };
}

function group(parentPath: string, childPaths: string[] = []): DisplayGroup {
  return {
    parent: entry(parentPath),
    children: childPaths.map((p) => entry(p, 'plan')),
    recency: 1000
  };
}

describe('selectionMatches', () => {
  it('matches the parent path', () => {
    expect(selectionMatches(group('/a/spec.md'), '/a/spec.md')).toBe(true);
  });
  it('matches a child plan path', () => {
    expect(selectionMatches(group('/a/spec.md', ['/a/plan.md']), '/a/plan.md')).toBe(true);
  });
  it('does not match an unrelated path', () => {
    expect(selectionMatches(group('/a/spec.md', ['/a/plan.md']), '/b/spec.md')).toBe(false);
  });
});

describe('findSelectedGroup', () => {
  it('finds the group whose parent or child matches', () => {
    const g1 = group('/a/spec.md', ['/a/plan.md']);
    const g2 = group('/b/spec.md');
    expect(findSelectedGroup([g1, g2], '/a/plan.md')).toBe(g1);
    expect(findSelectedGroup([g1, g2], '/b/spec.md')).toBe(g2);
  });
  it('returns null when nothing matches or path is null', () => {
    const g1 = group('/a/spec.md');
    expect(findSelectedGroup([g1], '/x/spec.md')).toBeNull();
    expect(findSelectedGroup([g1], null)).toBeNull();
  });
});

describe('groupToPromote', () => {
  const culled = group('/a/spec.md', ['/a/plan.md']);

  it('promotes the cached selection when it is no longer in tabGroups', () => {
    // selection points at the culled group's child; tabGroups no longer contains it
    expect(groupToPromote('/a/plan.md', [group('/b/spec.md')], culled, [])).toBe(culled);
  });

  it('does not promote while the selection is still live in tabGroups', () => {
    expect(groupToPromote('/a/spec.md', [culled], culled, [])).toBeNull();
  });

  it('does not promote when already in openedGroups', () => {
    expect(groupToPromote('/a/spec.md', [group('/b/spec.md')], culled, [culled])).toBeNull();
  });

  it('does not promote when the cache does not match the current selection', () => {
    expect(groupToPromote('/c/spec.md', [group('/b/spec.md')], culled, [])).toBeNull();
  });

  it('does not promote when there is no selection or no cache', () => {
    expect(groupToPromote(null, [], culled, [])).toBeNull();
    expect(groupToPromote('/a/spec.md', [], null, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/openTabs.test.ts`
Expected: FAIL — cannot resolve `./openTabs` / functions not exported.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/openTabs.ts`:

```ts
import type { DisplayGroup } from './pairing';

export function selectionMatches(group: DisplayGroup, path: string): boolean {
  return group.parent.path === path || group.children.some((c) => c.path === path);
}

export function findSelectedGroup(
  groups: DisplayGroup[],
  path: string | null
): DisplayGroup | null {
  if (!path) return null;
  return groups.find((g) => selectionMatches(g, path)) ?? null;
}

/**
 * The group that should be appended to openedGroups: the cached selection
 * (lastSelectedGroup) once it has been culled from tabGroups, still matches the
 * current selection, and is not already opened. Otherwise null.
 */
export function groupToPromote(
  selectedPath: string | null,
  tabGroups: DisplayGroup[],
  lastSelectedGroup: DisplayGroup | null,
  openedGroups: DisplayGroup[]
): DisplayGroup | null {
  if (!selectedPath || !lastSelectedGroup) return null;
  if (findSelectedGroup(tabGroups, selectedPath)) return null; // still live
  if (!selectionMatches(lastSelectedGroup, selectedPath)) return null;
  if (openedGroups.some((o) => o.parent.path === lastSelectedGroup.parent.path)) return null;
  return lastSelectedGroup;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/openTabs.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/openTabs.ts src/lib/openTabs.test.ts
git commit -m "feat: pure helpers for promoting a culled open tab"
```

---

### Task 2: Wire promotion into the page

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `findSelectedGroup`, `groupToPromote` from `$lib/openTabs`.
- Produces: no exports (component behavior only).

Context — current relevant lines in `src/routes/+page.svelte`:
- imports block (top, ~lines 1-8)
- `tabGroups` derived (~line 33)
- `loadSpecs()` (~lines 38-42)
- `closeOpened()` (~lines 77-88)
- `onMount` selection-restore block (~lines 156-162)

- [ ] **Step 1: Import the helpers**

Add to the import group near the top (after the `pairAndGroup` import):

```ts
import { findSelectedGroup, groupToPromote } from '$lib/openTabs';
```

- [ ] **Step 2: Add retention state and a load flag**

Add near the other `$state` declarations (next to `selectedPath`):

```ts
let lastSelectedGroup = $state<DisplayGroup | null>(null);
let specsLoaded = $state(false);
```

`DisplayGroup` is already imported from `$lib/pairing`.

- [ ] **Step 3: Set the load flag in loadSpecs**

In `loadSpecs()`, after `specs = await res.json();`, add:

```ts
specsLoaded = true;
```

- [ ] **Step 4: Add the capture/promote effect**

Add after the `tabGroups` / `openedPaths` derived declarations (so `tabGroups` is in scope):

```ts
$effect(() => {
  if (!specsLoaded || !selectedPath) return;
  const live = findSelectedGroup(tabGroups, selectedPath);
  if (live) {
    lastSelectedGroup = live; // capture while visible (idempotent: same ref)
    return;
  }
  const promote = groupToPromote(selectedPath, tabGroups, lastSelectedGroup, openedGroups);
  if (promote) {
    openedGroups = [...openedGroups, promote];
    persistOpened();
  }
});
```

- [ ] **Step 5: Clear the cache when the selection is cleared in closeOpened**

In `closeOpened`, inside the `if (selectedPath === path || hitChild) { ... }` block, add alongside the other resets:

```ts
lastSelectedGroup = null;
```

- [ ] **Step 6: Seed the cache for deep-links / restored selection on mount**

In `onMount`, replace the existing selection-restore block:

```ts
const fromQuery = new URLSearchParams(window.location.search).get('path');
const toOpen = fromQuery ?? localStorage.getItem(SELECTED_KEY);
if (toOpen) {
  selectSpec(toOpen).then((ok) => {
    if (!ok && !fromQuery) localStorage.removeItem(SELECTED_KEY);
  });
}
```

with:

```ts
const fromQuery = new URLSearchParams(window.location.search).get('path');
const toOpen = fromQuery ?? localStorage.getItem(SELECTED_KEY);
if (toOpen) {
  selectSpec(toOpen).then((ok) => {
    if (!ok && !fromQuery) localStorage.removeItem(SELECTED_KEY);
  });
  // Seed the retention cache so an out-of-window deep-link still gets a tab.
  fetch(`/api/resolve?q=${encodeURIComponent(toOpen)}`)
    .then((r) => (r.ok ? (r.json() as Promise<DisplayGroup>) : null))
    .then((g) => {
      if (g) lastSelectedGroup = g;
    })
    .catch(() => {});
}
```

- [ ] **Step 7: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 8: Run the full unit suite**

Run: `npm test`
Expected: all pass (including Task 1's `openTabs.test.ts`).

- [ ] **Step 9: Manual verification**

Start the dev server (`npm run dev`, port 4510) and confirm:
1. Open a discovery tab, then make its spec leave `/api/specs` (e.g. land/merge its worktree, or `touch` an identically-named file into the project's main `docs/superpowers/specs/`). After the SSE refresh the tab **stays** and now shows an **×**.
2. Select a different tab — the promoted tab remains (pinned) and is still closeable.
3. Click the × on the promoted tab and on a "choose a doc" tab — both close and clear the editor correctly, including when a child *plan* was the active selection.
4. Visit `/open?path=<an out-of-window spec>` — a closeable tab appears for it.
5. Ordinary in-window discovery tabs still have **no** ×.

- [ ] **Step 10: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: keep the open tab when its spec is culled"
```

---

## Notes on testing approach

Task 2 has no automated test: the behavior lives in a Svelte `$effect`, and this
repo's convention is pure-unit tests against plain inputs (no component/DOM
harness is set up). The decision logic is fully covered by Task 1's
`openTabs.test.ts`; Task 2 is thin wiring verified by `npm run check` plus the
manual steps above.
