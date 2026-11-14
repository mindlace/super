# Preserve Scroll on External Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the open file changes on disk (external edit, autosave round-trip, or SSE reload), keep the CodeMirror editor's scroll position and cursor where they were instead of snapping to the top, and let the markdown preview ride along to the editor's preserved position.

**Architecture:** Today `Editor.svelte` replaces the whole document on every external content change (`{ from: 0, to: current.length, insert: incoming }`), which discards scroll and selection — that's the jump-to-top. We replace that with a **minimal-diff** dispatch: compute the common prefix/suffix between the current doc and the incoming text and dispatch only the changed range. CodeMirror then maps scroll and selection through the change automatically. The preview pane re-renders asynchronously (Shiki), so after its HTML settles we re-sync it to the editor's preserved scroll percentage using the existing `sync()` helper.

**Tech Stack:** Svelte 5 (runes), CodeMirror 6 (`@codemirror/state` / `@codemirror/view`), Vitest (pure-Node unit tests).

## Global Constraints

- Svelte 5 runes (`$state`, `$derived`, `$effect`), 2-space indent, single quotes, 100 char width.
- Tests are colocated `*.test.ts` and pure-unit (plain inputs, no FS/DOM mocking). The vitest config runs `src/**/*.test.ts` in the default Node environment — no browser/DOM env is available, so new tests must be over pure functions only.
- Do not change the existing scroll-`sync()` suppression mechanism or the `applyingExternal` guard semantics.

---

### Task 1: Pure minimal-diff helper

**Files:**
- Create: `src/lib/diffRange.ts`
- Test: `src/lib/diffRange.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `diffRange(current: string, incoming: string): { from: number; to: number; insert: string }` — the smallest single contiguous CodeMirror change (a common-prefix / common-suffix diff) that turns `current` into `incoming`. `from`/`to` are offsets into `current`; `insert` is the replacement slice of `incoming`. For identical inputs it returns a no-op range (`from === to` at the end of the common prefix, `insert === ''`). The prefix and suffix never overlap.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/diffRange.test.ts
import { describe, it, expect } from 'vitest';
import { diffRange } from './diffRange';

// Applying the returned change to `current` must reproduce `incoming`.
function apply(current: string, change: { from: number; to: number; insert: string }) {
  return current.slice(0, change.from) + change.insert + current.slice(change.to);
}

describe('diffRange', () => {
  it('returns a no-op for identical strings', () => {
    const change = diffRange('hello', 'hello');
    expect(change.insert).toBe('');
    expect(change.from).toBe(change.to);
    expect(apply('hello', change)).toBe('hello');
  });

  it('handles a pure append (touches only the tail)', () => {
    const change = diffRange('abc', 'abcdef');
    expect(change).toEqual({ from: 3, to: 3, insert: 'def' });
    expect(apply('abc', change)).toBe('abcdef');
  });

  it('handles a pure prepend (touches only the head)', () => {
    const change = diffRange('def', 'abcdef');
    expect(change).toEqual({ from: 0, to: 0, insert: 'abc' });
    expect(apply('def', change)).toBe('abcdef');
  });

  it('handles a mid-string replacement', () => {
    const change = diffRange('abXcd', 'abYcd');
    expect(change).toEqual({ from: 2, to: 3, insert: 'Y' });
    expect(apply('abXcd', change)).toBe('abYcd');
  });

  it('handles a deletion in the middle', () => {
    const change = diffRange('a-BIG-z', 'a-z');
    expect(apply('a-BIG-z', change)).toBe('a-z');
    // Only the differing middle is touched; the shared "a-" / "-z" stay put.
    expect(change.from).toBe(2);
    expect(change.to).toBe(6);
  });

  it('does not let prefix and suffix overlap on repeated chars', () => {
    // current "aaa" -> incoming "aaaa": prefix would greedily eat everything;
    // the suffix scan must stop so from <= to and the result still applies.
    const change = diffRange('aaa', 'aaaa');
    expect(change.from).toBeLessThanOrEqual(change.to);
    expect(apply('aaa', change)).toBe('aaaa');
  });

  it('replaces fully when nothing is shared', () => {
    const change = diffRange('abc', 'xyz');
    expect(change).toEqual({ from: 0, to: 3, insert: 'xyz' });
    expect(apply('abc', change)).toBe('xyz');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/diffRange.test.ts`
Expected: FAIL — `Failed to resolve import './diffRange'` / `diffRange is not a function`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/diffRange.ts

/**
 * Compute the smallest single contiguous change that turns `current` into
 * `incoming`, as a CodeMirror change spec. Finds the common prefix, then the
 * common suffix (without letting the two overlap), and replaces only the
 * differing middle. Identical inputs yield a no-op range.
 */
export function diffRange(
  current: string,
  incoming: string
): { from: number; to: number; insert: string } {
  let prefix = 0;
  const minLen = Math.min(current.length, incoming.length);
  while (prefix < minLen && current[prefix] === incoming[prefix]) prefix++;

  let suffix = 0;
  // Stop the suffix scan before it crosses into the already-matched prefix on
  // either string, so `from <= to` and the insert slice stays well-formed.
  while (
    suffix < current.length - prefix &&
    suffix < incoming.length - prefix &&
    current[current.length - 1 - suffix] === incoming[incoming.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    from: prefix,
    to: current.length - suffix,
    insert: incoming.slice(prefix, incoming.length - suffix)
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/diffRange.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diffRange.ts src/lib/diffRange.test.ts
git commit -m "feat: add diffRange minimal-change helper"
```

---

### Task 2: Apply the diff in the editor and let the preview ride along

**Files:**
- Modify: `src/lib/components/Editor.svelte` (import + render `$effect` at lines 31-39 + external-sync `$effect` at lines 149-157)

**Interfaces:**
- Consumes: `diffRange` from Task 1; the existing `sync(from, to)` helper and `suppress` mechanism (`src/lib/components/Editor.svelte:57-69`); the existing `view`, `preview`, and `applyingExternal` bindings.
- Produces: no exported API change. Behavioral contract: an external `content` change preserves editor scroll + selection and re-aligns the preview to the editor once the new HTML has rendered.

- [ ] **Step 1: Import the helper**

In `src/lib/components/Editor.svelte`, add to the import block near the top (after the `renderMarkdown` import on line 10):

```ts
  import { diffRange } from '$lib/diffRange';
```

- [ ] **Step 2: Add the pending-sync flag**

Next to the other plain `let` declarations (alongside `let applyingExternal = false;` at line 44), add:

```ts
  // Set when an *external* content change has just been applied to the doc, so
  // the next completed preview render re-aligns the preview to the editor's
  // (preserved) scroll position. Stays false for user typing — there the doc
  // already matches `content`, so the external-sync effect early-returns.
  let pendingPreviewSync = false;
```

- [ ] **Step 3: Replace the external-sync effect with a minimal-diff dispatch**

Replace the whole effect at lines 147-157:

```ts
  // External content changes (spec selection, external-change reload): replace the doc
  // without re-triggering onInput (guarded by applyingExternal).
  $effect(() => {
    const incoming = content;
    if (!view) return;
    const current = view.state.doc.toString();
    if (incoming === current) return;
    applyingExternal = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: incoming } });
    applyingExternal = false;
  });
```

with:

```ts
  // External content changes (spec selection, external-change reload): apply the
  // smallest diff rather than replacing the whole doc, so CodeMirror maps scroll
  // and selection through the change instead of resetting to the top. Guarded by
  // applyingExternal so it doesn't re-trigger onInput.
  $effect(() => {
    const incoming = content;
    if (!view) return;
    const current = view.state.doc.toString();
    if (incoming === current) return;
    applyingExternal = true;
    view.dispatch({ changes: diffRange(current, incoming) });
    applyingExternal = false;
    pendingPreviewSync = true;
  });
```

- [ ] **Step 4: Re-sync the preview after the external render settles**

Replace the render effect at lines 31-39:

```ts
  $effect(() => {
    const src = content;
    const version = ++renderVersion;
    renderMarkdown(src)
      .then((out) => {
        if (version === renderVersion) html = out;
      })
      .catch((err) => console.error('preview render failed', err));
  });
```

with:

```ts
  $effect(() => {
    const src = content;
    const version = ++renderVersion;
    renderMarkdown(src)
      .then((out) => {
        if (version !== renderVersion) return;
        html = out;
        // After an external reload the editor kept its scroll; the preview just
        // re-rendered with new content/height. rAF waits for Svelte to flush the
        // {@html} and the browser to lay it out, then aligns the preview to the
        // editor's preserved position (sync() arms `suppress` so it won't bounce).
        if (pendingPreviewSync) {
          pendingPreviewSync = false;
          requestAnimationFrame(() => {
            if (view) sync(view.scrollDOM, preview);
          });
        }
      })
      .catch((err) => console.error('preview render failed', err));
  });
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no new errors introduced by the change.

- [ ] **Step 6: Verify the full test suite still passes**

Run: `npm test`
Expected: PASS (all existing tests plus the new `diffRange` tests).

- [ ] **Step 7: Manual verification in the running app**

This behavior is DOM/CodeMirror glue with no Node-testable surface, so verify by hand:

```bash
npm run dev   # http://127.0.0.1:4510
```

1. Open a spec long enough to scroll. Scroll the editor down to the middle.
2. In a separate terminal, edit that same `.md` file on disk near the top (e.g. add a line) and save.
3. Within ~3s (the `pollExternalChange` interval) the toast "Reloaded — file changed on disk" appears.
   - **Expected:** the editor stays at roughly the same place (does NOT jump to the top), the cursor is preserved, and the preview pane is aligned to the editor's position — not stuck at the top.
4. Type in the editor and let autosave fire (1s). Confirm typing does NOT cause any scroll jump (the external-sync effect early-returns because the doc already matches; `pendingPreviewSync` stays false).

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/Editor.svelte
git commit -m "feat: preserve editor scroll on external reload, sync preview along"
```

---

## Notes on design decisions

- **Why a single contiguous diff, not a full LCS diff:** external reloads are almost always small localized edits or an autosave echo. A prefix/suffix diff is O(n), dependency-free, and enough for CodeMirror to preserve position. A full multi-range diff would be more machinery than the problem needs (YAGNI).
- **Why re-sync the preview on render completion rather than on the editor's scroll event:** the diff dispatch may fire a CodeMirror scroll event *before* the new HTML exists, so syncing then maps against a stale preview height. Waiting for the render `.then` + rAF guarantees the preview has its final height before we align it.
- **Why `pendingPreviewSync` instead of always re-syncing on every `html` change:** user typing also re-renders the preview; re-syncing on every render would yank the preview during normal editing. The flag scopes the ride-along to genuine external reloads only.
