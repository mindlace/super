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

2. **Only manually-opened tabs can be closed.** The × is currently gated on
   `openedPaths`. Tabs that are present only because they were opened or retained
   have no way to be dismissed.

## Behavior

### Tab sources

The strip is built from three sources, in order:

1. **Discovery** — `visibleGroups`, the specs in the 24h window. **No ×.**
2. **Opened** — `openedGroups`, docs picked via "choose a doc". Sticky across
   selection changes, persisted to `localStorage`. **× shown.**
3. **Retained** — at most one: *the currently-selected group* when it has
   dropped out of both discovery and opened. Follows the selection. **× shown.**

### Request 1 — don't drop the currently-open tab

Only the **currently-selected** tab is protected (per the user's scope choice).
Previously-viewed-then-left tabs are not.

- An effect caches the live group for `selectedPath` into `lastSelectedGroup`
  while that group is present in discovery+opened.
- When the selection is no longer found in discovery+opened, the cached
  `lastSelectedGroup` is rendered as a **retained** tab so the tab (and its plan
  links) stay put even though the work landed.
- Because the retained tab is keyed to the *current* selection, selecting a
  different tab lets the previous retained tab fall away.
- On mount, a deep-link (`/open?path=…` → `?path=…`) or a restored selection is
  resolved (via `/api/resolve`) into `lastSelectedGroup`, so an out-of-window
  deep-linked doc still gets a proper (closeable) tab on first load.

Edge case: if the underlying file is physically gone (the worktree directory was
removed on merge), the tab still stays, but reads/writes fail as they do today —
the poll no-ops and autosave reports "save failed". Out of scope to recover.

### Request 2 — close × on opened and retained tabs

- `closeable = opened ∪ retained` — i.e. any tab **not** currently surfaced by
  discovery on its own. Ordinary in-window discovery tabs get no ×. The "choose
  a doc" tab is separate markup and never gets one.
- Because closeable tabs are never the watcher-driven discovery tabs, **closing
  cannot collide with a re-scan re-adding the tab** — no "dismissed" set is
  needed.
- One handler, `closeTab(path)`:
  - remove the group from `openedGroups` (no-op for a purely-retained tab) and
    re-persist;
  - if the closed tab held the selection (its parent path *or* one of its child
    plan paths), clear `selectedPath`, `content`, `saveStatus`,
    `lastSelectedGroup`, and the persisted selection — which also makes a
    retained tab disappear.

## Implementation sketch

All changes are in the client; no server/endpoint changes.

**`src/routes/+page.svelte`**
- Add `let lastSelectedGroup = $state<DisplayGroup | null>(null)`.
- `baseGroups = [...visibleGroups, ...openedRendered]` (today's `tabGroups`).
- `liveSelectedGroup` = derived: the group in `baseGroups` whose parent or child
  path equals `selectedPath`, else `null`.
- effect: `if (liveSelectedGroup) lastSelectedGroup = liveSelectedGroup`.
- `retainedGroup` = derived: `lastSelectedGroup` when `selectedPath` is set,
  `liveSelectedGroup` is `null`, and `lastSelectedGroup` matches `selectedPath`;
  else `null`.
- `tabGroups = [...baseGroups, ...(retainedGroup ? [retainedGroup] : [])]`.
- `closeablePaths` = derived set of `openedRendered` paths plus the retained
  path.
- Replace `closeOpened` with `closeTab` (looks up the group in `tabGroups`, not
  just `openedGroups`, so it can clear selection for a retained tab's child plan).
- On mount: after kicking off `selectSpec(toOpen)`, also resolve `toOpen` via
  `/api/resolve` and store the result in `lastSelectedGroup` (best-effort; ignore
  failure).

**`src/lib/tabs.ts`** — rename the `openedPaths` parameter to `closeablePaths`
(semantics widened to include the retained tab). No logic change:
`closeable: closeablePaths.has(g.parent.path)`.

**`src/lib/components/TabStrip.svelte`** — rename the `openedPaths` prop to
`closeablePaths`; pass it through to `buildTabs`. Markup unchanged (the × already
renders on `tab.closeable`).

## Testing

- `tabs.test.ts`: update the two `openedPaths` references to `closeablePaths`
  (behavior identical — set membership drives `closeable`).
- New unit coverage for the retention selectors is awkward inside `.svelte`
  runes; extract the retention decision into a small pure helper if it proves
  testable, otherwise rely on the existing `buildTabs` tests plus manual
  verification of: (a) select a discovery tab, simulate its removal from the
  list → tab stays and shows ×; (b) select a different tab → the retained one
  disappears; (c) close an opened tab and a retained tab → both clear correctly.
- `npm test` and `npm run check` must pass.
