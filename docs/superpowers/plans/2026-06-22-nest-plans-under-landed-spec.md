# Nest in-progress plans under their landed spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an in-progress worktree plan nested under its spec even after the spec has landed on `main`, with the plan's branch surfaced on the spec's caption.

**Architecture:** Discovery re-surfaces a `main` spec (otherwise hidden) when a live worktree plan matches it by slug, tagging it `onMain`. Pairing nests as usual but drops a re-surfaced spec that ended up childless. The sidebar caption is reordered `branch · project · type`, hoisting the child plan's branch onto a branch-less parent and omitting the `plan`/`spec` type.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest, Node `fs/promises`.

## Global Constraints

- 2-space indent, single quotes, 100 char width (ESLint + Prettier).
- Tests are colocated `*.test.ts`, pure-unit: pass a `root` / plain inputs, no global FS mocking.
- Config constants live in `src/lib/server/config.ts` — do not inline roots.
- Conventional Commits for every commit.
- Spec/plan H1 titles are not prefixed with the project name.

---

### Task 1: Discovery re-surfaces a landed spec when a worktree plan matches it

**Files:**
- Modify: `src/lib/types.ts` (add `onMain` field)
- Modify: `src/lib/server/discovery.ts`
- Test: `src/lib/server/discovery.test.ts`

**Interfaces:**
- Consumes: `normalizedSlug(filename: string): string` from `$lib/pairing` (already exported).
- Produces: `scanSpecs(root?: string): Promise<SpecEntry[]>` now may include entries with `worktree: null`, `type: 'spec'`, `onMain: true` — a `main` spec re-surfaced because a live worktree plan in the same project shares its `normalizedSlug`. `SpecEntry.onMain?: boolean`.

- [ ] **Step 1: Add the `onMain` field to `SpecEntry`**

In `src/lib/types.ts`, add this field after `worktree`:

```ts
  /** true if re-surfaced from the project's main checkout (otherwise main files are hidden) */
  onMain?: boolean;
```

- [ ] **Step 2: Add failing discovery fixtures + tests**

In `src/lib/server/discovery.test.ts`, extend the `beforeAll` fixture (inside the existing function, after the `recency` block) with a project whose spec has landed on `main` while its plan is still in a worktree:

```ts
  // projC: spec landed on main, plan still in a worktree -> spec is re-surfaced.
  const cSpecs = join(root, 'projC/docs/superpowers/specs');
  const cWtPlans = join(root, 'projC/.claude/worktrees/wt3/docs/superpowers/plans');
  await write(cSpecs, '2026-06-19-qux-design.md', '# Qux Spec\n');
  await write(cWtPlans, '2026-06-23-qux.md', '# Qux Plan\n');
```

Replace the existing test `'excludes main-checkout specs and never tags an entry as main'` (the one asserting `list.every((e) => e.worktree !== null)`) with these three tests:

```ts
  it('re-surfaces a main spec when a live worktree plan matches it by slug', async () => {
    const list = await scanSpecs(root);
    const quxSpec = list.find((e) => e.filename === '2026-06-19-qux-design.md');
    expect(quxSpec?.type).toBe('spec');
    expect(quxSpec?.onMain).toBe(true);
    expect(quxSpec?.worktree).toBeNull();
    expect(quxSpec?.project).toBe('projC');
    const quxPlan = list.find((e) => e.filename === '2026-06-23-qux.md');
    expect(quxPlan?.type).toBe('plan');
    expect(quxPlan?.worktree).toBe('wt3');
  });

  it('does not re-surface a main spec that has no matching worktree plan', async () => {
    // projA's foo spec is on main but its only worktree plan copy is a merged dup.
    const list = await scanSpecs(root);
    expect(list.some((e) => e.filename === '2026-06-20-foo-design.md')).toBe(false);
  });

  it('never tags an ordinary worktree entry as main', async () => {
    const list = await scanSpecs(root);
    for (const e of list) {
      if (e.onMain) expect(e.worktree).toBeNull();
      else expect(e.worktree).not.toBeNull();
    }
  });
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: FAIL — `quxSpec` is `undefined` (main spec not yet re-surfaced), so `.type`/`.onMain` assertions fail.

- [ ] **Step 4: Implement re-surfacing in `scanSpecs`**

In `src/lib/server/discovery.ts`, add the import at the top:

```ts
import { normalizedSlug } from '$lib/pairing';
```

Replace the worktree-scanning block and what follows it inside the project loop (currently lines ~88–98) with:

```ts
    const wtRoot = join(root, project, '.claude', 'worktrees');
    const planSlugs = new Set<string>();
    for (const wt of await listDirs(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      for (const sub of await listDirs(wtSuper)) {
        const dir = join(wtSuper, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          const entry = await makeEntry(dir, name, project, wt, sub);
          out.push(entry);
          if (entry.type === 'plan') planSlugs.add(normalizedSlug(name));
        }
      }
    }

    // Re-surface a landed main spec when a live worktree plan still references
    // it (same project, same slug), so the plan keeps its nested parent.
    const mainSpecsDir = join(mainSuper, 'specs');
    for (const name of await listMarkdown(mainSpecsDir)) {
      if (!planSlugs.has(normalizedSlug(name))) continue;
      const entry = await makeEntry(mainSpecsDir, name, project, null, 'specs');
      entry.onMain = true;
      out.push(entry);
    }
```

- [ ] **Step 5: Run the full discovery suite to verify it passes**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: PASS (all tests, including the unchanged recency/title/exclusion ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/server/discovery.ts src/lib/server/discovery.test.ts
git commit -m "feat: re-surface a landed main spec for its in-progress worktree plan"
```

---

### Task 2: Pairing drops a childless re-surfaced spec

**Files:**
- Modify: `src/lib/pairing.ts`
- Test: `src/lib/pairing.test.ts`

**Interfaces:**
- Consumes: `SpecEntry.onMain?: boolean` (Task 1).
- Produces: `pairAndGroup(specs): DisplayGroup[]` unchanged signature; a parent with `onMain === true` and zero children is omitted from the returned groups. Ordinary (non-`onMain`) childless specs are still returned.

- [ ] **Step 1: Add failing pairing tests**

In `src/lib/pairing.test.ts`, add `onMain` to the `entry` helper's returned object (after the `recency` line, before the closing brace):

```ts
    onMain: part.onMain
```

Then add these tests inside the `describe('pairAndGroup', ...)` block:

```ts
  it('nests a worktree plan under a re-surfaced main spec', () => {
    const spec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, recency: 10 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', recency: 50 });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-19-qux-design.md', children: ['2026-06-23-qux.md'] }
    ]);
  });

  it('drops a re-surfaced main spec that ends up childless', () => {
    const spec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true });
    const groups = pairAndGroup([spec]);
    expect(groups).toEqual([]);
  });

  it('keeps an ordinary childless worktree spec', () => {
    const spec = entry({ filename: '2026-06-19-solo-design.md', type: 'spec', worktree: 'wt1' });
    const groups = pairAndGroup([spec]);
    expect(groups.map((g) => g.parent.filename)).toEqual(['2026-06-19-solo-design.md']);
  });

  it('prefers a worktree spec over a re-surfaced main spec for the same plan', () => {
    const mainSpec = entry({ filename: '2026-06-19-qux-design.md', type: 'spec', worktree: null, onMain: true, recency: 10 });
    const wtSpec = entry({ filename: '2026-06-22-qux-design.md', type: 'spec', worktree: 'wt3', recency: 40 });
    const plan = entry({ filename: '2026-06-23-qux.md', type: 'plan', worktree: 'wt3', recency: 50 });
    const groups = pairAndGroup([mainSpec, wtSpec, plan]);
    // newest spec wins the plan; the now-childless main spec is dropped.
    expect(ids(groups)).toEqual([
      { parent: '2026-06-22-qux-design.md', children: ['2026-06-23-qux.md'] }
    ]);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/lib/pairing.test.ts`
Expected: FAIL — `drops a re-surfaced main spec that ends up childless` expects `[]` but gets one group; `prefers a worktree spec…` expects one group but gets two.

- [ ] **Step 3: Skip the childless re-surfaced spec when building groups**

In `src/lib/pairing.ts`, in the loop that builds groups from `parents` (currently lines ~59–65), add a guard at the top of the loop body:

```ts
  for (const s of parents) {
    const children = (childrenBySpec.get(s) ?? [])
      .slice()
      .sort((a, b) => b.recency - a.recency);
    if (s.onMain && children.length === 0) continue;
    const recency = children.reduce((m, c) => Math.max(m, c.recency), s.recency);
    groups.push({ parent: s, children, recency });
  }
```

- [ ] **Step 4: Run the full pairing suite to verify it passes**

Run: `npx vitest run src/lib/pairing.test.ts`
Expected: PASS (new tests plus all existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pairing.ts src/lib/pairing.test.ts
git commit -m "feat: drop a re-surfaced main spec that parents no plan"
```

---

### Task 3: Branch-first caption that hoists the child plan's branch

**Files:**
- Create: `src/lib/caption.ts`
- Create: `src/lib/caption.test.ts`
- Modify: `src/lib/components/Sidebar.svelte`

**Interfaces:**
- Consumes: `DisplayGroup` from `$lib/pairing`; `SpecEntry` from `$lib/types`.
- Produces: `captionFor(group: DisplayGroup): string` — the parent caption, ordered `branch · project · type`. `branch` is `parent.worktree`, or (when null) the distinct `worktree` names of the group's children joined by ` · `. `type` is included only when it is neither `plan` nor `spec`. Empty segments are dropped.

- [ ] **Step 1: Write the failing caption tests**

Create `src/lib/caption.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { captionFor } from './caption';
import type { DisplayGroup } from './pairing';
import type { SpecEntry } from '$lib/types';

function entry(part: Partial<SpecEntry> & { filename: string }): SpecEntry {
  return {
    path: '/p/' + (part.project ?? 'proj') + '/' + part.filename,
    filename: part.filename,
    title: part.title ?? part.filename,
    project: part.project ?? 'proj',
    worktree: part.worktree ?? null,
    type: part.type ?? 'spec',
    mtime: part.recency ?? 1000,
    recency: part.recency ?? 1000,
    onMain: part.onMain
  };
}

function group(parent: SpecEntry, children: SpecEntry[] = []): DisplayGroup {
  return { parent, children, recency: parent.recency };
}

describe('captionFor', () => {
  it('orders a worktree spec as branch then project, dropping the type', () => {
    const g = group(entry({ filename: 's-design.md', type: 'spec', project: 'spec_reader', worktree: 'fix-foo' }));
    expect(captionFor(g)).toBe('fix-foo · spec_reader');
  });

  it('hoists the child plan branch onto a branch-less re-surfaced main spec', () => {
    const parent = entry({ filename: 's-design.md', type: 'spec', project: 'spec_reader', worktree: null, onMain: true });
    const child = entry({ filename: 'p.md', type: 'plan', project: 'spec_reader', worktree: 'fix-foo' });
    expect(captionFor(group(parent, [child]))).toBe('fix-foo · spec_reader');
  });

  it('joins distinct child branches when several worktrees share the spec', () => {
    const parent = entry({ filename: 's-design.md', type: 'spec', worktree: null, onMain: true });
    const c1 = entry({ filename: 'p1.md', type: 'plan', worktree: 'wtA' });
    const c2 = entry({ filename: 'p2.md', type: 'plan', worktree: 'wtB' });
    const c3 = entry({ filename: 'p3.md', type: 'plan', worktree: 'wtA' });
    expect(captionFor(group(parent, [c1, c2, c3]))).toBe('wtA · wtB · proj');
  });

  it('drops the type for a standalone plan', () => {
    const g = group(entry({ filename: 'p.md', type: 'plan', project: 'proj', worktree: 'wt1' }));
    expect(captionFor(g)).toBe('wt1 · proj');
  });

  it('keeps a non plan/spec type, ordered after project', () => {
    const g = group(entry({ filename: 'n.md', type: 'analysis', project: 'proj', worktree: 'wt1' }));
    expect(captionFor(g)).toBe('wt1 · proj · analysis');
  });

  it('drops an empty branch segment', () => {
    const g = group(entry({ filename: 's-design.md', type: 'spec', project: 'proj', worktree: null }));
    expect(captionFor(g)).toBe('proj');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/caption.test.ts`
Expected: FAIL with "Failed to load … ./caption" / `captionFor` is not a function.

- [ ] **Step 3: Implement the caption helper**

Create `src/lib/caption.ts`:

```ts
import type { DisplayGroup } from './pairing';

function childBranches(group: DisplayGroup): string {
  const seen = new Set<string>();
  for (const c of group.children) if (c.worktree) seen.add(c.worktree);
  return [...seen].join(' · ');
}

export function captionFor(group: DisplayGroup): string {
  const p = group.parent;
  const branch = p.worktree ?? childBranches(group);
  const type = p.type === 'plan' || p.type === 'spec' ? '' : p.type;
  return [branch, p.project, type].filter(Boolean).join(' · ');
}
```

- [ ] **Step 4: Run the caption suite to verify it passes**

Run: `npx vitest run src/lib/caption.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Wire the helper into the sidebar**

In `src/lib/components/Sidebar.svelte`, replace the local `caption` function and its use. Update the script imports to add:

```svelte
  import { captionFor } from '$lib/caption';
```

Delete the existing `caption` function (the `function caption(s: SpecEntry) { … }` block). Then change the parent caption markup from:

```svelte
          <span class="mt-0.5 block break-words text-xs text-neutral-500"
            >{caption(group.parent)}</span
          >
```

to:

```svelte
          <span class="mt-0.5 block break-words text-xs text-neutral-500"
            >{captionFor(group)}</span
          >
```

(The `SpecEntry` import may now be unused — if `svelte-check` flags it, remove it from the import on line 2.)

- [ ] **Step 6: Verify types and the full test suite**

Run: `npm run check && npm test`
Expected: PASS — no type errors, all test files green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/caption.ts src/lib/caption.test.ts src/lib/components/Sidebar.svelte
git commit -m "feat: branch-first sidebar caption hoisting the child plan branch"
```

---

## Notes for the implementer

- `makeEntry(dir, filename, project, worktree, subdir)` already maps `subdir: 'specs'` to `type: 'spec'` via `typeLabel`, so the re-surfaced entry gets `type: 'spec'` for free; only `onMain` is set explicitly afterward.
- The 24h visibility filter lives in `+page.svelte` (`visibleGroups`) and keys off `group.recency`, which is `max` over children — so a recent plan keeps a group visible even when the landed spec's own recency is days old. No change needed there.
- Re-surfaced specs remain selectable/editable like any file; that is intentional and out of scope to restrict.
