# Tabs-like view

## What this is

Replace the resizable left **sidebar** with a horizontal **tab strip** across the top of the window. The editor fills the full width below the strip. The number of specs/plans visible at once is small (the 24h window), so a tall column wastes space; a tab strip uses the horizontal room and frees the whole width for reading.

This is a UI-layout change only. The discovery, pairing, recency, caption, watcher, and endpoint logic are unchanged — the strip consumes the same `DisplayGroup[]` the sidebar did.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌─ Tabs-like view ──┐ ┌ Nest plans… ┐ ┌ Caption hoisting ┐            │  tab strip
│ │ tabs-view·spec_rd │ │ nested·spec  │ │ caption·spec_rd  │            │  (scrolls →)
│ │ plan [plan 2]     │ │ plan         │ │                  │            │
│ └───────────────────┴─┴──────────────┴─┴──────────────────┴──────────  │  strip bottom = content top
│ …/plans/2026-06-23-tabs-view-v2-plan.md                       saved    │  path + save status bar
│ # Tabs view — Plan 2                                                   │
│ Editor (CodeMirror) — full width                                       │  editor
└──────────────────────────────────────────────────────────────────────┘
```

The tab strip and the content area share a continuous surface: tabs sit **flush on the content top** with no detached gap. The active tab is distinguished by background/contrast (it reads as part of the content), not by floating above a separator line. The strip scrolls horizontally when tabs overflow the window width.

## Tab anatomy

Each `DisplayGroup` renders as one tab, in the existing group order (`recency` descending). A tab has up to three rows:

1. **Title** — `group.parent.title`. Clicking the title shows the spec (the parent file) and selects the tab.
2. **Caption** — `captionFor(group)` verbatim (e.g. `tabs-view · spec_reader`). Unchanged from the sidebar.
3. **Plan links** — only when `group.children.length > 0`. One link per child plan: `plan`, `plan 2`, `plan 3`, … labelled by position. Order is the existing children order (recency descending — newest plan is `plan`). Tabs with no children have no third row.

A standalone plan or other-type entry (a group whose `parent` is itself a plan/other, `children` empty) is a single tab with title + caption and no third row, exactly as `pairAndGroup` already produces it.

## Selection & modes

There is **one piece of selection state: `selectedPath`** (already on the page). The active tab and its mode are *derived* from it — no new persisted state:

- `selectedPath === group.parent.path` → that tab is active in **spec mode**.
- `selectedPath === someChild.path` → that child's parent tab is active in **plan mode**; that specific plan link is rendered **boxed** (bordered).

Clicking a tab's title calls the existing `selectSpec(parent.path)`; clicking a plan link calls `selectSpec(child.path)`. Both swap the editor content in place — the active tab does not change identity when toggling between its spec and its plans, only which link (if any) is boxed and which file the editor shows.

A non-boxed plan link is a plain link; the boxed treatment marks "this plan is what the editor is currently showing".

## Empty state

When there are no visible groups, render no tabs and show the existing message — "No specs in the last 24 hours." — in the content area (where the editor would be). This replaces the current sidebar empty-state and the `<main>` "Select a spec." placeholder is folded into this single empty/selection state.

## What is removed

- `src/lib/components/Sidebar.svelte` (replaced by a new `TabStrip.svelte`).
- The resize handle, `startResize`/`onResizeMove`/`endResize`, `sidebarWidth`, `MIN_W`/`MAX_W`/`DEFAULT_W`, and the `sr:sidebarWidth` localStorage key in `+page.svelte`.

## What is unchanged

- `pairAndGroup`, `captionFor`, `normalizedSlug`, recency filtering (`DAY_MS`), discovery, watcher, SSE, all `/api/*` and `/open` endpoints.
- `selectedPath` + `sr:selectedPath` persistence, deep-link via `/open?path=` and the `?path=` query, autosave/conflict flow, external-change polling. Restoring or deep-linking to a plan path naturally lands its parent tab in plan mode via the derivation above.

## Components

- **`TabStrip.svelte`** (new) — props: `groups: DisplayGroup[]`, `selectedPath: string | null`, `onSelect: (path: string) => void`. Pure presentational, same prop shape as the old `Sidebar`. Renders the strip; derives active tab and boxed plan link from `selectedPath`. Plan-link label: index 0 → `plan`, index *n* → `plan ${n+1}`.
- **`+page.svelte`** — swaps `<Sidebar>` for `<TabStrip>` at the top of a vertical flex column (strip above, content below) instead of the current horizontal sidebar+main split; removes the resize logic listed above.

## Testing

- **`TabStrip` / derivation unit tests** (colocated, pure): given `groups` + `selectedPath`, assert which tab is active, which mode, and which plan link is boxed — covering: spec selected, a plan selected (parent active, correct link boxed), a non-newest plan selected (`plan 2` boxed), nothing selected, and a standalone-plan tab. Plan-link labels (`plan`, `plan 2`, …) follow children order.
- **Empty state**: no groups → message rendered, no tabs.
- Existing `pairing`/`caption` tests are untouched and must still pass.
