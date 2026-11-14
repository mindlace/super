# Paired Spec/Plan Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair each plan with its spec and show the plan indented beneath the spec as one unit, ordered by the latest activity of either, with the 24h window applied per pair.

**Architecture:** A pure client-side transform (`$lib/pairing.ts`) groups the flat `SpecEntry[]` into `DisplayGroup`s (a spec parent + indented plan children, or a standalone item). `+page.svelte` builds groups and filters them by per-group recency; `Sidebar.svelte` renders parents (title + caption) with children indented (title only). No server/API change.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest.

## Global Constraints

- **Pair key:** `` `${project}::${normalizedSlug(filename)}` ``. `normalizedSlug` = filename with the leading date prefix `^\d{4}-\d{2}-\d{2}(-\d{4})?-` removed, trailing `.md` removed, trailing `-design` removed, lowercased.
- **Scope:** pairing is within a single `project`; **worktree is excluded** from the key (a worktree plan pairs with the project's `main` spec). Pairing only relates `type === 'spec'` (parent) with `type === 'plan'` (child).
- **Title fallback:** also pair when spec and plan have an exactly identical `title`; the slug key takes precedence over the title match.
- **Group recency = max(recency of all members)** ("latest of either"). Top-level groups sorted by group recency desc; children sorted by recency desc.
- **24h window per group:** show a group when its group recency is `>= Date.now() - DAY_MS` (an old spec resurfaces when its plan is fresh). `DAY_MS` from `$lib/recency`.
- **Display:** parent spec and any standalone item show `title` + caption `project · worktree · type` (worktree omitted when null). Indented child plan shows **title only** (no caption). Orphan plan (no matching spec) is a top-level standalone item and keeps its caption.
- Selection unchanged: `onSelect(path)` for both parent and child rows; persisted selection / deep-link untouched. Svelte 5 runes.

---

### Task 1: Pairing transform (`$lib/pairing.ts`)

**Files:**
- Create: `src/lib/pairing.ts`
- Test: `src/lib/pairing.test.ts`

**Interfaces:**
- Consumes: `SpecEntry` from `$lib/types` (`{ path, filename, title, project, worktree, type, mtime, recency }`).
- Produces:
  - `interface DisplayGroup { parent: SpecEntry; children: SpecEntry[]; recency: number }`
  - `normalizedSlug(filename: string): string`
  - `pairAndGroup(specs: SpecEntry[]): DisplayGroup[]` — sorted (group recency desc; children recency desc).

- [ ] **Step 1: Write the failing tests**

`src/lib/pairing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizedSlug, pairAndGroup, type DisplayGroup } from './pairing';
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
    recency: part.recency ?? 1000
  };
}

function ids(groups: DisplayGroup[]) {
  return groups.map((g) => ({
    parent: g.parent.filename,
    children: g.children.map((c) => c.filename)
  }));
}

describe('normalizedSlug', () => {
  it('strips date prefix, .md, and trailing -design, lowercases', () => {
    expect(normalizedSlug('2026-06-22-spec-reader-live-list-design.md')).toBe('spec-reader-live-list');
    expect(normalizedSlug('2026-06-22-spec-reader-live-list.md')).toBe('spec-reader-live-list');
    expect(normalizedSlug('2026-06-22-1712-Foo-Bar-design.md')).toBe('foo-bar');
    expect(normalizedSlug('no-date-here.md')).toBe('no-date-here');
  });
});

describe('pairAndGroup', () => {
  it('pairs a spec with its plan in the same project (plan indented)', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', recency: 100 });
    const plan = entry({ filename: '2026-06-21-foo.md', type: 'plan', recency: 200 });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-foo-design.md', children: ['2026-06-21-foo.md'] }
    ]);
    expect(groups[0].recency).toBe(200); // max of the two
  });

  it('does NOT pair across different projects', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', project: 'A' });
    const plan = entry({ filename: '2026-06-20-foo.md', type: 'plan', project: 'B' });
    const groups = pairAndGroup([spec, plan]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('pairs a worktree plan with the project main spec (worktree excluded from key)', () => {
    const spec = entry({ filename: '2026-06-20-foo-design.md', type: 'spec', worktree: null });
    const plan = entry({ filename: '2026-06-20-foo.md', type: 'plan', worktree: 'wt1' });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-foo-design.md', children: ['2026-06-20-foo.md'] }
    ]);
  });

  it('pairs by identical title when slugs differ', () => {
    const spec = entry({ filename: '2026-06-20-alpha-design.md', type: 'spec', title: 'Same Title' });
    const plan = entry({ filename: '2026-06-20-beta.md', type: 'plan', title: 'Same Title' });
    const groups = pairAndGroup([spec, plan]);
    expect(ids(groups)).toEqual([
      { parent: '2026-06-20-alpha-design.md', children: ['2026-06-20-beta.md'] }
    ]);
  });

  it('leaves an orphan plan, a plan-less spec, and a non-spec/plan file standalone', () => {
    const orphanPlan = entry({ filename: '2026-06-20-lonely.md', type: 'plan', recency: 300 });
    const soloSpec = entry({ filename: '2026-06-20-solo-design.md', type: 'spec', recency: 200 });
    const other = entry({ filename: '2026-06-20-notes.md', type: 'analysis', recency: 100 });
    const groups = pairAndGroup([soloSpec, orphanPlan, other]);
    expect(groups.map((g) => g.parent.filename)).toEqual([
      '2026-06-20-lonely.md', // 300
      '2026-06-20-solo-design.md', // 200
      '2026-06-20-notes.md' // 100
    ]);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('sorts groups by group recency desc and children by recency desc', () => {
    const specA = entry({ filename: '2026-06-20-a-design.md', type: 'spec', project: 'A', recency: 10 });
    const planA1 = entry({ filename: '2026-06-20-a.md', type: 'plan', project: 'A', recency: 50 });
    const planA2 = entry({ filename: '2026-06-21-a.md', type: 'plan', project: 'A', recency: 40 });
    const specB = entry({ filename: '2026-06-20-b-design.md', type: 'spec', project: 'B', recency: 5 });
    const groups = pairAndGroup([specA, planA1, planA2, specB]);
    expect(groups[0].parent.filename).toBe('2026-06-20-a-design.md'); // group recency 50
    expect(groups[0].children.map((c) => c.filename)).toEqual([
      '2026-06-20-a.md', // 50
      '2026-06-21-a.md' // 40
    ]);
    expect(groups[1].parent.filename).toBe('2026-06-20-b-design.md');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/pairing.test.ts`
Expected: FAIL — cannot resolve `./pairing`.

- [ ] **Step 3: Implement the transform**

`src/lib/pairing.ts`:
```ts
import type { SpecEntry } from '$lib/types';

export interface DisplayGroup {
  parent: SpecEntry;
  children: SpecEntry[];
  recency: number;
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:-\d{4})?-/;

export function normalizedSlug(filename: string): string {
  return filename
    .replace(DATE_PREFIX, '')
    .replace(/\.md$/, '')
    .replace(/-design$/, '')
    .toLowerCase();
}

function pairKey(e: SpecEntry): string {
  return `${e.project}::${normalizedSlug(e.filename)}`;
}

export function pairAndGroup(specs: SpecEntry[]): DisplayGroup[] {
  const parents: SpecEntry[] = [];
  const plans: SpecEntry[] = [];
  const others: SpecEntry[] = [];
  for (const e of specs) {
    if (e.type === 'spec') parents.push(e);
    else if (e.type === 'plan') plans.push(e);
    else others.push(e);
  }

  // Index specs by pair key and by title; newest spec wins on collision.
  const keyToSpec = new Map<string, SpecEntry>();
  const titleToSpec = new Map<string, SpecEntry>();
  const indexNewest = (map: Map<string, SpecEntry>, k: string, e: SpecEntry) => {
    const cur = map.get(k);
    if (!cur || e.recency > cur.recency) map.set(k, e);
  };
  for (const s of parents) {
    indexNewest(keyToSpec, pairKey(s), s);
    indexNewest(titleToSpec, s.title, s);
  }

  const childrenBySpec = new Map<SpecEntry, SpecEntry[]>();
  const standalonePlans: SpecEntry[] = [];
  for (const p of plans) {
    const match = keyToSpec.get(pairKey(p)) ?? titleToSpec.get(p.title);
    if (match) {
      const arr = childrenBySpec.get(match) ?? [];
      arr.push(p);
      childrenBySpec.set(match, arr);
    } else {
      standalonePlans.push(p);
    }
  }

  const groups: DisplayGroup[] = [];
  for (const s of parents) {
    const children = (childrenBySpec.get(s) ?? [])
      .slice()
      .sort((a, b) => b.recency - a.recency);
    const recency = children.reduce((m, c) => Math.max(m, c.recency), s.recency);
    groups.push({ parent: s, children, recency });
  }
  for (const p of standalonePlans) groups.push({ parent: p, children: [], recency: p.recency });
  for (const o of others) groups.push({ parent: o, children: [], recency: o.recency });

  groups.sort((a, b) => b.recency - a.recency);
  return groups;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/pairing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run check**

Run: `npm run check` → expect 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pairing.ts src/lib/pairing.test.ts
git commit -m "feat: add spec/plan pairing transform"
```

---

### Task 2: Render paired groups in the sidebar

**Files:**
- Rewrite: `src/lib/components/Sidebar.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `DisplayGroup`/`pairAndGroup` (Task 1), `DAY_MS` from `$lib/recency`.
- Produces: `Sidebar.svelte` props `{ groups: DisplayGroup[]; selectedPath: string | null; onSelect: (path: string) => void }`.

- [ ] **Step 1: Rewrite the sidebar to render groups**

`src/lib/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  import type { SpecEntry } from '$lib/types';
  import type { DisplayGroup } from '$lib/pairing';

  let {
    groups,
    selectedPath,
    onSelect
  }: {
    groups: DisplayGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();

  function caption(s: SpecEntry): string {
    return [s.project, s.worktree, s.type].filter(Boolean).join(' · ');
  }
</script>

<nav class="h-full overflow-y-auto bg-neutral-950 p-2 text-sm">
  {#if groups.length === 0}
    <p class="p-2 text-neutral-500">No specs in the last 24 hours.</p>
  {/if}
  <ul>
    {#each groups as group (group.parent.path)}
      <li>
        <button
          type="button"
          class="mb-1 block w-full rounded px-2 py-2 text-left hover:bg-neutral-800
            {selectedPath === group.parent.path ? 'bg-blue-950' : ''}"
          onclick={() => onSelect(group.parent.path)}
        >
          <span
            class="block break-words leading-snug
              {selectedPath === group.parent.path ? 'text-blue-200' : 'text-neutral-200'}"
            >{group.parent.title}</span
          >
          <span class="mt-0.5 block break-words text-xs text-neutral-500"
            >{caption(group.parent)}</span
          >
        </button>
        {#if group.children.length > 0}
          <ul class="mb-1 ml-3 border-l border-neutral-800 pl-2">
            {#each group.children as child (child.path)}
              <li>
                <button
                  type="button"
                  class="mb-1 block w-full rounded px-2 py-1 text-left hover:bg-neutral-800
                    {selectedPath === child.path ? 'bg-blue-950' : ''}"
                  onclick={() => onSelect(child.path)}
                >
                  <span
                    class="block break-words leading-snug
                      {selectedPath === child.path ? 'text-blue-200' : 'text-neutral-300'}"
                    >{child.title}</span
                  >
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</nav>
```

- [ ] **Step 2: Wire grouping + per-group window into the page**

In `src/routes/+page.svelte`:

Change the imports — replace the recency import line
```ts
  import { withinWindow } from '$lib/recency';
```
with:
```ts
  import { DAY_MS } from '$lib/recency';
  import { pairAndGroup } from '$lib/pairing';
```

Replace the `visible` derived line
```ts
  const visible = $derived(withinWindow(specs, Date.now()));
```
with:
```ts
  const visibleGroups = $derived(
    pairAndGroup(specs).filter((g) => g.recency >= Date.now() - DAY_MS)
  );
```

Update the `<Sidebar ... />` usage — change `specs={visible}` to `groups={visibleGroups}`:
```svelte
    <Sidebar groups={visibleGroups} {selectedPath} onSelect={selectSpec} />
```

(Leave everything else — `loadSpecs`, `selectSpec`, autosave, poll, SSE, persisted selection, resizable sidebar — unchanged.)

- [ ] **Step 3: Verify**

Run: `npm run check` → expect 0 errors (confirms `withinWindow` is no longer imported unused, and the new types line up).
Run: `npx vitest run` → all suites pass (pairing + watcher + paths + discovery + recency).
Runtime smoke: start the dev server, confirm `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/` is `200`, then KILL it (capture PID; the user's own dev server may hold 4510, so read the actual port from the dev log or use whatever port it prints). Do NOT grep rendered text (ssr=false).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/routes/+page.svelte
git commit -m "feat: render paired spec/plan groups with indented plans"
```

---

## Verification (end-to-end, real browser)

1. `npm install && npm test` — pairing (slug + grouping), watcher, paths, discovery, recency suites pass.
2. `npm run build && npm start` (or dev) — app live.
3. A spec and its plan show as **one unit**: the plan **indented** beneath the spec, ordered by the **latest of the two**; the child plan row shows **only its title** (no caption).
4. Writing/touching the plan for an **older** spec **resurfaces** the pair into the 24h view.
5. An **orphan plan** (no spec) appears top-level **with** its caption; a spec with no plan shows alone; a non-spec/plan file shows alone.
6. Pairs do **not** form across different projects; a plan in a **worktree** pairs with the project's `main` spec.
7. Clicking the indented plan opens that plan (selection highlight on the child); persisted selection / deep-link still work for both parent and child.

## Out of Scope (future)

- Server/API changes (pairing is client-side).
- Pairing types other than spec↔plan; collapse/expand of pairs.
- 60s window tick; retiring the content poll; launchd auto-start.
