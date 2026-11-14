# Paired Spec/Plan Display

## Context

The sidebar is a flat, recency-ordered list of titles. In practice a spec and its plan are two
rows for the same piece of work, scattered by recency. This change **pairs** a plan with its spec
and shows the plan **indented beneath** the spec, as one unit ordered by the latest activity of
either.

This is a pure client-side display transform over the existing flat `SpecEntry[]` — no server or
API change. (`SpecEntry` already carries `project`, `worktree`, `type`, `filename`, `title`,
`recency`.)

## Matching rule (which plan belongs to which spec)

A plan pairs with a spec when they share a **pair key**, scoped to a single project so unrelated
same-named features in different projects never merge:

```
pairKey = `${project}::${normalizedSlug}`
```

`normalizedSlug(filename)`:
1. strip the leading date prefix `^\d{4}-\d{2}-\d{2}(-\d{4})?-`
2. strip the trailing `.md`
3. strip a trailing `-design`
4. lowercase

This is necessary because the conventions make naive matching fail: specs end in `-design`
(`2026-06-22-spec-reader-live-list-design.md`) while plans don't
(`2026-06-22-spec-reader-live-list.md`). After normalization both become
`spec-reader-live-list` and pair. Worktree is intentionally **excluded** from the key, so a plan
written in a worktree pairs with the project's spec on `main`.

**Title fallback:** also pair if the spec and plan have an exactly identical `title`. (In practice
slugs match first; this is a cheap safety net and matches the user's "identical title OR identical
slug" intent. Plan titles usually carry an "… Implementation Plan" suffix, so exact-title pairing
rarely fires — slug is the workhorse.)

Pairing only relates a `type === 'spec'` with a `type === 'plan'`. Other types (or unmatched
items) stay standalone.

## Grouping, order, and the 24h window

- Build **display groups** from the flat list (pure helper, see below):
  - Each group has a **parent** (the spec) and zero or more **children** (its plans), or is a
    **standalone** item (a spec with no plan, an orphan plan with no spec, or any non-spec/plan
    file).
  - A group's **recency = max(recency of all its members)** ("latest time of either").
- **Order:** top-level groups/standalone items are sorted by group recency descending. Within a
  paired group, the spec is first, then its plan(s) ordered by recency descending.
- **24h window applies per group:** a group is shown if its group recency (latest member) is
  within 24h. When shown, **all** its members render — so an older spec **resurfaces** beneath/above
  the line because its plan is fresh (and vice-versa). This replaces the current per-item
  `withinWindow` filter with a per-group one.

## Display

- **Parent spec** (and any standalone item): title + the existing muted caption
  `project · worktree · type` (worktree omitted when null). Unchanged from today.
- **Child plan (indented):** rendered **indented** under its spec, showing **only the title** — no
  caption line. The parent already shows project/worktree, and the indentation already signals it's
  the plan, so the caption would be redundant clutter.
- An **orphan plan** (no matching spec) is a top-level standalone item and **keeps** its caption
  (it isn't indented, so it needs the context).
- Selection still works per item by `path` (clicking a child plan opens that plan); the persisted
  selection and deep-link behavior are unchanged.

## Components

- **`src/lib/pairing.ts`** — pure transform:
  - `normalizedSlug(filename: string): string`
  - `pairAndGroup(specs: SpecEntry[]): DisplayGroup[]` where
    `DisplayGroup = { parent: SpecEntry; children: SpecEntry[]; recency: number }`.
    (A standalone item is a group with `children: []`.)
  - Groups returned already sorted (group recency desc; children recency desc).
- **`+page.svelte`** — replace `visible = withinWindow(specs, Date.now())` with: build groups via
  `pairAndGroup(specs)`, then keep groups whose `recency >= Date.now() - DAY_MS`; pass the visible
  groups to the sidebar. (The existing `withinWindow`/`DAY_MS` in `$lib/recency` can be reused for
  the per-group cutoff, or a small inline cutoff; `DAY_MS` stays the source of the window size.)
- **`Sidebar.svelte`** — accept `groups: DisplayGroup[]` instead of a flat `specs` list. Render
  each group's parent (title + caption), then its children indented (title only). Keep the selected
  highlight and `onSelect(path)` for both parent and child rows.

## Testing & Verification

- **Unit (Vitest)** for `pairing.ts`:
  - `normalizedSlug`: strips date prefix (with and without `-HHMM`), `.md`, and trailing `-design`;
    lowercases. e.g. `2026-06-22-spec-reader-live-list-design.md` → `spec-reader-live-list`;
    `2026-06-22-spec-reader-live-list.md` → `spec-reader-live-list`.
  - Pairs a spec with its plan by slug (same project); does NOT pair across different projects;
    pairs a worktree plan with the project's main spec.
  - Title fallback pairs when slugs differ but titles are identical.
  - Orphan plan → standalone (keeps standalone status); spec with no plan → standalone; non-spec/plan
    type → standalone.
  - Group recency = max(member recency); top-level groups sorted desc; children sorted desc.
- **Manual (real browser):** a spec and its plan appear as one indented unit ordered by the latest
  of the two; writing the plan for an older spec resurfaces the pair into the 24h view; the child
  plan row shows only its title (no caption); clicking the child opens the plan.

## Out of Scope

- Server/API changes (pairing is client-side).
- Pairing types other than spec↔plan.
- Collapsing/expanding pairs (always shown expanded).
- The earlier-noted optional 60s window tick; retiring the content poll; launchd auto-start.
