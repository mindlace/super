# Nest in-progress plans under their landed spec

## Problem

When a spec has landed on `main` but its plan is still being worked in a
worktree, the plan currently appears as a **standalone, top-level item** in the
sidebar, captioned `project · branch · plan`. The connection to its spec is
lost, because the spec — now on `main` — is suppressed by discovery's
`mainSet` rule (only worktree files are surfaced).

We want such a plan to keep showing its spec as the nested parent (the usual
`spec › plan` style), with the spec's caption telling you which branch the work
is happening on. We also want to stop repeating the type (`plan`/`spec`) in
captions, since the nesting structure already conveys it.

## Behavior

1. **Pull in the landed spec as the parent.** When a worktree plan has a
   corresponding spec on `main` (same project, matching by the existing pairing
   key), surface that `main` spec as the nested parent over the plan — even
   though `main` specs are otherwise hidden. The plan nests under it in the
   usual `spec › plan` style.

2. **Show the working branch on the spec.** A `main` spec has no branch of its
   own. Its caption instead shows the branch(es) of the plan child/children —
   "this is the branch this spec is being worked on." For an ordinary
   worktree spec, the caption keeps showing its own branch, exactly as today.

3. **Lead with the branch, drop the plan/spec type.** The caption is ordered
   `branch · project · type` — the worktree is the salient field, the project is
   already known. The type is included only when it is *not* `plan`/`spec`
   (those are implied by the nesting structure); other subdir types still show.

### Worked example

`spec_reader` has, on `main`, `docs/superpowers/specs/2026-06-20-foo-design.md`
(landed). A worktree `fix-foo` still holds
`docs/superpowers/plans/2026-06-22-foo.md`.

- **Today:** one top-level item — `foo` plan, caption `spec_reader · fix-foo · plan`.
- **After:** nested —
  - parent `foo` spec, caption `fix-foo · spec_reader`
  - child `foo` plan, title only (as all children render today)

## Design

### Discovery — `src/lib/server/discovery.ts`

Today discovery surfaces only worktree files and records `main` files into a
`mainSet` purely for the "landed" suppression. We extend it to *re-surface* a
`main` spec when a live worktree plan matches it.

Algorithm change, per project:

1. As today, collect `mainSet` (the `sub/name` strings) for suppression, and
   surface worktree files (skipping those whose identical filename is on `main`).
   While doing so, keep the surfaced **worktree plan** entries for this project.
2. List the `main` `specs/` markdown files. For each, compute its
   `normalizedSlug` (imported from `$lib/pairing`). If any surfaced worktree
   plan in this project has the same slug, build a `SpecEntry` for that `main`
   spec (`worktree: null`, `type: 'spec'`, `onMain: true`) and add it to the
   output.

Matching at discovery uses the **slug** only (the primary pairing key). The
title-equality fallback that `pairing` also supports is not mirrored here; a
`main` spec whose slug differs from the plan but whose title matches will not be
pulled in. This is an accepted limitation — superpowers spec/plan pairs share a
slug in practice.

A new optional field marks these entries:

```ts
// src/lib/types.ts — SpecEntry
/** true if this entry comes from the project's main checkout (re-surfaced) */
onMain?: boolean;
```

### Pairing — `src/lib/pairing.ts`

`pairAndGroup` already nests a plan under the newest matching spec, scoped to the
project, by slug with a title fallback. The re-surfaced `main` spec enters the
`parents` list and nests normally. Two points:

- **Newest-spec-wins still holds.** If a worktree *also* has its own (newer,
  not-landed) spec for the same slug, that worktree spec wins the
  `indexNewest` race and the plan nests under it; the `main` spec is then left
  childless.
- **Drop childless re-surfaced specs.** A `main` spec we pulled in but did not
  end up parenting any plan must not appear on its own. When building groups,
  skip a parent where `parent.onMain && children.length === 0`. Ordinary
  worktree specs with no children still show (unchanged).

### Caption — `src/lib/components/Sidebar.svelte`

The parent caption becomes group-aware so it can hoist the child branch. It is
ordered `branch · project · type`:

- **branch** — `parent.worktree` if set; otherwise the distinct `worktree`
  names of the group's children, joined by ` · `. (For a re-surfaced `main`
  spec, `parent.worktree` is `null`, so this yields the plan's branch.)
- **project** — unchanged.
- **type** — included only when it is *not* `plan` or `spec`.

Empty segments are dropped before joining (e.g. a parent with no branch at all).
Children continue to render title only — no caption — so the branch appears
solely on the parent, as specified.

## Testing

Colocated unit tests, consistent with the existing pure-unit style (pass a
`root`/plain inputs, no global FS mocking).

- **discovery** (`discovery.test.ts`): a fixture tree with a landed spec on
  `main` and a matching plan in a worktree yields both a `main` spec entry
  (`onMain: true`, `worktree: null`) and the worktree plan. A `main` spec with
  *no* matching worktree plan is **not** surfaced. The existing "landed file
  suppressed" behavior is unchanged.
- **pairing** (`pairing.test.ts`): a plan + a re-surfaced `onMain` spec nest
  (`spec › plan`). A childless `onMain` spec is dropped from the groups. A
  childless ordinary worktree spec is retained. Newest-spec-wins: when both a
  worktree spec and a `main` spec match, the plan nests under the worktree spec
  and the `main` spec is dropped.
- **caption**: a small pure helper (extracted from `Sidebar.svelte`, e.g.
  `captionFor(group)` in a testable module) covering: worktree spec →
  `branch · project`; re-surfaced `main` spec → `child-branch · project`;
  standalone plan → `branch · project` (no `plan`); an "other" type → still
  includes the type, ordered `branch · project · type`.

## Out of scope

- Restricting edits to re-surfaced `main` specs (they remain selectable and
  editable, like any file today).
- Changing the 24h recency window or its computation. Group recency already
  takes `max` over children, so a recent plan keeps the group visible even when
  the landed spec is old.
