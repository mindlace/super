# Sticky open tab + per-tab close button

## Problem

Two gaps in the tab strip (`src/lib/components/TabStrip.svelte`, fed by
`src/routes/+page.svelte`):

1. **The open document's tab can vanish underneath it.** Tabs come from two
   sources: discovery (`visibleGroups`, auto-shown for 24h) and manually-opened
   docs (`openedGroups`). A *discovery* tab that the user is actively reading
   disappears the moment its work lands — e.g. its worktree merges and
   `scanSpecs()` suppresses it, or it ages past the 24h window. The user loses
   the tab they were looking at.

2. **The close × is missing from tabs that exist only because they were opened
   or retained.** The affordance rule itself is fine (× shows for `openedGroups`
   tabs); the gap is that a selected-then-culled tab never reaches `openedGroups`.

## Approach

Reuse the existing sticky machinery instead of adding a third tab source: **when
the currently-selected group would otherwise be culled, move it into
`openedGroups`.** Once it's an opened tab it is sticky *and* closeable for free —
no new "retained" source, no `closeable` rule change, no `buildTabs` / `TabStrip`
/ `closeOpened` changes.

Consequence (an intentional change from an earlier draft): a tab you were viewing
when it got culled becomes a **permanent pinned tab** — it stays even after you
select away, and you dismiss it with its × when done. Pinning is explicit, same
as a "choose a doc" pick.

## Behavior

### Request 1 — don't drop the currently-open tab

- An effect tracks the live group for `selectedPath`. While that group is present
  in `tabGroups` (discovery + opened), it is cached in `lastSelectedGroup`.
- When the selection is no longer found in `tabGroups` (culled by merge or by the
  24h window), the cached `lastSelectedGroup` is appended to `openedGroups` (if
  not already present) and `persistOpened()` runs. The tab — with its plan links
  and its × — stays put.
- The promotion is guarded so it is idempotent: once promoted, the group is found
  again as a live opened tab and no further writes occur.

### Request 2 — close × on opened (incl. promoted) tabs

- The close-affordance rule is unchanged: `closeable = openedPaths` (the
  `openedRendered` set). Ordinary in-window discovery tabs get no ×; the "choose
  a doc" tab is separate markup and never gets one.
- A promoted tab is now in `openedGroups`, so it gets its × automatically.
- `closeOpened` is unchanged: it removes the group from `openedGroups`, and if the
  closed tab held the selection (its parent path *or* a child plan path), clears
  the selection. It already covers promoted tabs because they live in
  `openedGroups`.

### Deep-links and restored selection (mount)

A deep-link (`/open?path=…` → `?path=…`) or a `localStorage`-restored selection
may point at a doc outside the 24h window, which has no discovery tab. To give it
a (closeable) tab uniformly:

- On mount, after kicking off `selectSpec(toOpen)`, resolve `toOpen` via
  `/api/resolve` and seed `lastSelectedGroup` with the result (best-effort;
  ignore failure).
- The same effect then decides: if the doc is in the discovery window it shows as
  a normal discovery tab (no ×, not pinned); if it is out of window it is culled
  on the first effect run and promoted into `openedGroups` (tab appears, × shown).

### Edge case

If the underlying file is physically gone (the worktree directory was removed on
merge), the tab still stays, but reads/writes fail as they do today — the poll
no-ops and autosave reports "save failed". Out of scope to recover.

## Implementation sketch

All changes are in `src/routes/+page.svelte`. No server, `tabs.ts`, or
`TabStrip.svelte` changes.

- Add `let lastSelectedGroup = $state<DisplayGroup | null>(null)`.
- Add a `liveSelectedGroup` lookup (group in `tabGroups` whose parent path or a
  child path equals `selectedPath`).
- Add one `$effect`:

  ```ts
  $effect(() => {
    if (!selectedPath) return;
    const live = tabGroups.find(
      (g) => g.parent.path === selectedPath || g.children.some((c) => c.path === selectedPath)
    );
    if (live) {
      lastSelectedGroup = live; // capture while visible (idempotent: same ref)
    } else if (
      lastSelectedGroup &&
      (lastSelectedGroup.parent.path === selectedPath ||
        lastSelectedGroup.children.some((c) => c.path === selectedPath)) &&
      !openedGroups.some((o) => o.parent.path === lastSelectedGroup!.parent.path)
    ) {
      openedGroups = [...openedGroups, lastSelectedGroup]; // promote before it's culled away
      persistOpened();
    }
  });
  ```

  The effect converges: writing `lastSelectedGroup = live` with the same object
  reference is a no-op; promotion is gated by the `!openedGroups.some(...)` guard
  so it runs at most once per culling.
- In `onMount`, after `selectSpec(toOpen)`, resolve `toOpen` via `/api/resolve`
  and set `lastSelectedGroup` to the resolved group (best-effort).
- When the selection is cleared (`closeOpened` clearing it, or no selection),
  also clear `lastSelectedGroup` so a stale group can't be promoted later.

## Testing

- Existing `tabs.test.ts` is unchanged (close-affordance rule untouched).
- Manual verification (runes effects are awkward to unit-test in isolation):
  1. Select a discovery tab, then simulate its removal from `/api/specs` (e.g.
     land/merge its worktree) → the tab stays and now shows an ×.
  2. Select a different tab → the promoted tab remains (it is pinned) and is
     closeable.
  3. Close a promoted tab and a "choose a doc" tab → both clear correctly,
     including when a child plan was the active selection.
  4. Deep-link via `/open?path=…` to an out-of-window doc → a closeable tab
     appears.
- `npm test` and `npm run check` must pass.
