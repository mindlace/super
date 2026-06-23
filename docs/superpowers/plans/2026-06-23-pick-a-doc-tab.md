# Pick-a-doc Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-rightmost "choose a doc" tab that opens any superpowers doc by name/path, regardless of the 24h discovery window.

**Architecture:** A new server resolver (`resolve.ts` + `/api/resolve`) walks the same glob as discovery and returns a `DisplayGroup` for the best-matching doc (newest wins, suffix match, any project/worktree/main). The client keeps a persisted list of manually-opened groups, merges them into the tab strip, and `TabStrip` grows a picker tab (with shake-on-error) plus close buttons on opened tabs.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vitest, Node `fs/promises`, Tailwind CSS 4.

## Global Constraints

- Svelte 5 runes (`$state`, `$derived`), 2-space indent, single quotes, 100 char width.
- All filesystem reads still pass through `assertSpecPath` at the `/api/spec` layer; the resolver only returns paths it found by walking the real glob tree, so it is safe by construction.
- Tests are pure-unit and colocated (`*.test.ts`), driven by a passed-in `root` or plain inputs — never global FS mocks.
- Config roots come from `src/lib/server/config.ts` (`PROJECTS_ROOT`, `SUPERPOWERS_SEGMENT`) — never hardcode paths.
- Spec/plan H1 titles are NOT prefixed with the project name.

---

### Task 1: Extract shared FS-walk helpers

Factor the directory/markdown listing helpers out of `discovery.ts` so the new resolver can reuse them, and export `makeEntry` for building `SpecEntry` objects from a known location.

**Files:**
- Create: `src/lib/server/fswalk.ts`
- Create: `src/lib/server/fswalk.test.ts`
- Modify: `src/lib/server/discovery.ts` (remove private `listDirs`/`listMarkdown`, import them; add `export` to `makeEntry`)

**Interfaces:**
- Produces: `listDirs(path: string): Promise<string[]>` — subdirectory names, `[]` on error.
- Produces: `listMarkdown(dir: string): Promise<string[]>` — `*.md` filenames, `[]` on error.
- Produces (from discovery): `makeEntry(dir: string, filename: string, project: string, worktree: string | null, subdir: string): Promise<SpecEntry>` (now exported, unchanged behavior).

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/fswalk.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDirs, listMarkdown } from './fswalk';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'fswalk-'));
  await mkdir(join(root, 'sub-a'), { recursive: true });
  await mkdir(join(root, 'sub-b'), { recursive: true });
  await writeFile(join(root, 'keep.md'), '# keep');
  await writeFile(join(root, 'skip.txt'), 'nope');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('listDirs', () => {
  it('returns only subdirectory names', async () => {
    expect((await listDirs(root)).sort()).toEqual(['sub-a', 'sub-b']);
  });
  it('returns [] for a missing path', async () => {
    expect(await listDirs(join(root, 'nope'))).toEqual([]);
  });
});

describe('listMarkdown', () => {
  it('returns only .md filenames', async () => {
    expect(await listMarkdown(root)).toEqual(['keep.md']);
  });
  it('returns [] for a missing dir', async () => {
    expect(await listMarkdown(join(root, 'nope'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/fswalk.test.ts`
Expected: FAIL — cannot find module `./fswalk`.

- [ ] **Step 3: Create the helper module**

Create `src/lib/server/fswalk.ts` (moved verbatim from `discovery.ts`):

```typescript
import { readdir } from 'node:fs/promises';

export async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Update discovery.ts to use the shared helpers**

In `src/lib/server/discovery.ts`:
1. Delete the local `listDirs` and `listMarkdown` function definitions (lines 32-48).
2. Add to the imports near the top: `import { listDirs, listMarkdown } from './fswalk';`
3. Change `async function makeEntry(` to `export async function makeEntry(`.

The `readdir` import in `discovery.ts` is still used by nothing else after removal — remove `readdir` from its `node:fs/promises` import, leaving `import { readFile, stat } from 'node:fs/promises';`.

- [ ] **Step 5: Run the new test and the existing discovery suite**

Run: `npx vitest run src/lib/server/fswalk.test.ts src/lib/server/discovery.test.ts`
Expected: PASS (fswalk tests pass; discovery suite still green — it is the regression net for the extraction).

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/fswalk.ts src/lib/server/fswalk.test.ts src/lib/server/discovery.ts
git commit -m "refactor: extract listDirs/listMarkdown into fswalk, export makeEntry"
```

---

### Task 2: `resolveDoc` resolver

Walk every superpowers dir (main + worktrees, specs + plans) and resolve a user-typed query to a single best-matching `DisplayGroup`.

**Files:**
- Create: `src/lib/server/resolve.ts`
- Create: `src/lib/server/resolve.test.ts`

**Interfaces:**
- Consumes: `listDirs`, `listMarkdown` from `./fswalk`; `makeEntry` from `./discovery`; `pairAndGroup`, `DisplayGroup` from `$lib/pairing`; `PROJECTS_ROOT`, `SUPERPOWERS_SEGMENT` from `./config`.
- Produces: `resolveDoc(query: string, root?: string): Promise<DisplayGroup | null>` — `null` when nothing matches.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/resolve.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDoc } from './resolve';

let root: string;

async function write(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'resolve-'));

  // projA worktree: a spec with a sibling plan (same slug) -> plan should attach.
  const aWtSpecs = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const aWtPlans = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/plans');
  await write(aWtSpecs, '2026-06-21-bar-design.md', '# Bar\n');
  await write(aWtPlans, '2026-06-21-bar-design.md', '# Bar Plan\n');

  // projB main checkout: a doc that only lives on main (escape-hatch scope).
  const bMainSpecs = join(root, 'projB/docs/superpowers/specs');
  await write(bMainSpecs, '2026-06-10-onmain-design.md', '# On Main\n');

  // Same basename in two projects, different recency -> newest must win.
  const cWtSpecs = join(root, 'projC/.claude/worktrees/wtc/docs/superpowers/specs');
  const dWtSpecs = join(root, 'projD/.claude/worktrees/wtd/docs/superpowers/specs');
  await write(cWtSpecs, 'dupe.md', '# Older Dupe\n');
  await write(dWtSpecs, 'dupe.md', '# Newer Dupe\n');
  const older = new Date(2020, 0, 1).getTime() / 1000;
  await utimes(join(cWtSpecs, 'dupe.md'), older, older);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('resolveDoc', () => {
  it('matches a bare name without .md and attaches sibling plans for a spec', async () => {
    const g = await resolveDoc('2026-06-21-bar', root);
    expect(g?.parent.filename).toBe('2026-06-21-bar-design.md');
    expect(g?.parent.type).toBe('spec');
    expect(g?.children.map((c) => c.filename)).toEqual(['2026-06-21-bar-design.md']);
    expect(g?.children[0].type).toBe('plan');
  });

  it('matches a bare name with .md', async () => {
    const g = await resolveDoc('2026-06-21-bar-design.md', root);
    expect(g?.parent.filename).toBe('2026-06-21-bar-design.md');
  });

  it('matches a relative path fragment by suffix', async () => {
    const g = await resolveDoc('specs/2026-06-10-onmain-design.md', root);
    expect(g?.parent.project).toBe('projB');
    expect(g?.parent.worktree).toBeNull();
  });

  it('matches a fully-qualified absolute path', async () => {
    const abs = join(root, 'projB/docs/superpowers/specs/2026-06-10-onmain-design.md');
    const g = await resolveDoc(abs, root);
    expect(g?.parent.filename).toBe('2026-06-10-onmain-design.md');
  });

  it('opens the newest file when the name is ambiguous', async () => {
    const g = await resolveDoc('dupe', root);
    expect(g?.parent.project).toBe('projD');
    expect(g?.parent.title).toBe('Newer Dupe');
  });

  it('returns a childless group when the matched doc is a plan', async () => {
    const g = await resolveDoc('plans/2026-06-21-bar-design.md', root);
    expect(g?.parent.type).toBe('plan');
    expect(g?.children).toEqual([]);
  });

  it('returns null when nothing matches', async () => {
    expect(await resolveDoc('does-not-exist', root)).toBeNull();
  });

  it('returns null for an absolute path outside the glob', async () => {
    expect(await resolveDoc('/etc/passwd', root)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/resolve.test.ts`
Expected: FAIL — cannot find module `./resolve`.

- [ ] **Step 3: Implement the resolver**

Create `src/lib/server/resolve.ts`:

```typescript
import { resolve as resolvePath, join, sep } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { listDirs, listMarkdown } from './fswalk';
import { makeEntry } from './discovery';
import { pairAndGroup, type DisplayGroup } from '$lib/pairing';
import type { SpecEntry } from '$lib/types';

interface Candidate {
  dir: string;
  filename: string;
  project: string;
  worktree: string | null;
  subdir: string;
  path: string;
}

async function collectCandidates(root: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const addSuperdir = async (superDir: string, project: string, worktree: string | null) => {
    for (const sub of await listDirs(superDir)) {
      const dir = join(superDir, sub);
      for (const filename of await listMarkdown(dir)) {
        out.push({ dir, filename, project, worktree, subdir: sub, path: join(dir, filename) });
      }
    }
  };

  for (const project of await listDirs(root)) {
    await addSuperdir(join(root, project, SUPERPOWERS_SEGMENT), project, null);
    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(wtRoot)) {
      await addSuperdir(join(wtRoot, wt, SUPERPOWERS_SEGMENT), project, wt);
    }
  }

  return out;
}

export async function resolveDoc(
  query: string,
  root: string = PROJECTS_ROOT
): Promise<DisplayGroup | null> {
  const q = query.trim();
  if (!q) return null;

  const qMd = q.endsWith('.md') ? q : `${q}.md`;
  const abs = resolvePath(qMd);

  const candidates = await collectCandidates(root);
  const matches = candidates.filter((c) => c.path === abs || c.path.endsWith(sep + qMd));
  if (matches.length === 0) return null;

  // Newest match wins; build entries only for matches (limits stat/read IO).
  const entries = await Promise.all(
    matches.map((c) => makeEntry(c.dir, c.filename, c.project, c.worktree, c.subdir))
  );
  let winnerIdx = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].recency > entries[winnerIdx].recency) winnerIdx = i;
  }
  const winner = entries[winnerIdx];
  const winnerCand = matches[winnerIdx];

  if (winner.type !== 'spec') {
    return { parent: winner, children: [], recency: winner.recency };
  }

  // Attach sibling plans from the same superpowers root (same project + worktree).
  const planCands = candidates.filter(
    (c) => c.subdir === 'plans' && c.project === winnerCand.project && c.worktree === winnerCand.worktree
  );
  const plans: SpecEntry[] = await Promise.all(
    planCands.map((c) => makeEntry(c.dir, c.filename, c.project, c.worktree, c.subdir))
  );
  const group = pairAndGroup([winner, ...plans]).find((g) => g.parent.path === winner.path);
  return group ?? { parent: winner, children: [], recency: winner.recency };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/resolve.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/resolve.ts src/lib/server/resolve.test.ts
git commit -m "feat: resolveDoc resolver for picking docs by name or path"
```

---

### Task 3: `/api/resolve` endpoint

Expose `resolveDoc` over HTTP so the client picker can call it.

**Files:**
- Create: `src/routes/api/resolve/+server.ts`

**Interfaces:**
- Consumes: `resolveDoc` from `$lib/server/resolve`.
- Produces: `GET /api/resolve?q=<input>` → `200` JSON `DisplayGroup` on match, `404` when no match, `400` when `q` is missing.

- [ ] **Step 1: Implement the endpoint**

Create `src/routes/api/resolve/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import { resolveDoc } from '$lib/server/resolve';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'missing q');
  const group = await resolveDoc(q);
  if (!group) throw error(404, 'no matching doc');
  return json(group);
};
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 3: Manually verify against the dev server**

Run `npm run dev` in one terminal, then in another (substitute a real doc name you know exists under `~/Projects/**/docs/superpowers/`):

```bash
curl -s 'http://127.0.0.1:4510/api/resolve?q=pick-a-doc-tab-design' | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:4510/api/resolve?q=definitely-not-a-real-doc'
```

Expected: first prints a JSON object containing `"parent"`; second prints `404`. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/resolve/+server.ts
git commit -m "feat: GET /api/resolve endpoint"
```

---

### Task 4: `buildTabs` closeable flag

Teach the tab view-model which tabs are user-opened (and therefore closeable).

**Files:**
- Modify: `src/lib/tabs.ts`
- Modify: `src/lib/tabs.test.ts`

**Interfaces:**
- Produces: `Tab` interface gains `closeable: boolean`.
- Produces: `buildTabs(groups: DisplayGroup[], selectedPath: string | null, openedPaths?: Set<string>): Tab[]` — `closeable` is true when `group.parent.path` is in `openedPaths`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tabs.test.ts` inside the `describe('buildTabs', ...)` block:

```typescript
  it('marks a tab closeable only when its path is in openedPaths', () => {
    const opened = group(entry({ filename: 'opened-design.md', title: 'Opened' }));
    const normal = group(entry({ filename: 'normal-design.md', title: 'Normal' }));
    const tabs = buildTabs([opened, normal], null, new Set([opened.parent.path]));
    expect(tabs[0].closeable).toBe(true);
    expect(tabs[1].closeable).toBe(false);
  });

  it('defaults closeable to false when openedPaths is omitted', () => {
    const [tab] = buildTabs([group(entry({ filename: 's-design.md' }))], null);
    expect(tab.closeable).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tabs.test.ts`
Expected: FAIL — `closeable` is `undefined`, expected `true`/`false`.

- [ ] **Step 3: Implement**

In `src/lib/tabs.ts`:

1. Add `closeable: boolean;` to the `Tab` interface (after `active: boolean;`).
2. Update the signature and body of `buildTabs`:

```typescript
export function buildTabs(
  groups: DisplayGroup[],
  selectedPath: string | null,
  openedPaths: Set<string> = new Set()
): Tab[] {
  return groups.map((g) => {
    const plans: PlanLink[] = g.children.map((c, i) => ({
      label: planLabel(i),
      path: c.path,
      boxed: selectedPath === c.path
    }));
    const active = selectedPath === g.parent.path || plans.some((p) => p.boxed);
    return {
      title: g.parent.title,
      caption: captionFor(g),
      path: g.parent.path,
      active,
      closeable: openedPaths.has(g.parent.path),
      plans
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tabs.test.ts`
Expected: PASS (all buildTabs cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabs.ts src/lib/tabs.test.ts
git commit -m "feat: mark user-opened tabs closeable in buildTabs"
```

---

### Task 5: TabStrip picker tab, close buttons, restyle, shake

Render the always-rightmost picker tab with shake-on-error, add an × close affordance on closeable tabs, and switch tabs from fixed-width/scroll to content-width/shrink. New `onPick`/`onClose`/`openedPaths` props are optional so the app type-checks before the page wires them (Task 6).

**Files:**
- Modify: `src/lib/components/TabStrip.svelte`

**Interfaces:**
- Consumes: `buildTabs` (now with `openedPaths`) from `$lib/tabs`.
- Produces props: `onPick?: (query: string) => Promise<boolean>`, `onClose?: (path: string) => void`, `openedPaths?: Set<string>`.

- [ ] **Step 1: Replace TabStrip.svelte**

Overwrite `src/lib/components/TabStrip.svelte` with:

```svelte
<script lang="ts">
  import type { DisplayGroup } from '$lib/pairing';
  import { buildTabs } from '$lib/tabs';

  let {
    groups,
    selectedPath,
    onSelect,
    onPick,
    onClose,
    openedPaths = new Set<string>()
  }: {
    groups: DisplayGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
    onPick?: (query: string) => Promise<boolean>;
    onClose?: (path: string) => void;
    openedPaths?: Set<string>;
  } = $props();

  const tabs = $derived(buildTabs(groups, selectedPath, openedPaths));

  let query = $state('');
  let shaking = $state(false);
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerShake() {
    shaking = true;
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (shaking = false), 400);
  }

  async function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    const ok = (await onPick?.(value)) ?? false;
    query = '';
    if (!ok) triggerShake();
  }
</script>

<nav class="flex shrink-0 gap-1.5 bg-neutral-950 px-2 pt-2 text-sm">
  {#each tabs as tab (tab.path)}
    <div
      class="flex min-w-0 flex-col rounded-t-lg border border-b-0 px-3 py-2
        {tab.active ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-800 bg-neutral-950'}"
    >
      <div class="flex min-w-0 items-start gap-1.5">
        <button
          type="button"
          aria-current={tab.active ? 'page' : undefined}
          class="block min-w-0 flex-1 truncate text-left leading-snug
            {tab.active ? 'text-blue-200' : 'text-neutral-300'}"
          onclick={() => onSelect(tab.path)}
          title={tab.title}
        >{tab.title}</button>
        {#if tab.closeable}
          <button
            type="button"
            aria-label="Close tab"
            class="shrink-0 text-neutral-500 hover:text-neutral-200"
            onclick={() => onClose?.(tab.path)}
          >×</button>
        {/if}
      </div>
      <span class="mt-1 block truncate text-xs text-neutral-500" title={tab.caption}>{tab.caption}</span>
      {#if tab.plans.length > 0}
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          {#each tab.plans as plan (plan.path)}
            <button
              type="button"
              class="text-xs text-blue-400 hover:text-blue-300
                {plan.boxed
                  ? 'rounded border border-blue-500 px-1.5 text-blue-300'
                  : 'underline'}"
              onclick={() => onSelect(plan.path)}
            >{plan.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <div
    class="flex shrink-0 flex-col rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-950 px-3 py-2"
  >
    <span class="block leading-snug text-neutral-400">choose a doc</span>
    <input
      class="mt-1 w-44 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs
        text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none
        {shaking ? 'shake' : ''}"
      placeholder="doc name or path"
      bind:value={query}
      onkeydown={onKey}
    />
  </div>
</nav>

<style>
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(3px); }
  }
  .shake {
    animation: shake 0.4s ease-in-out;
    border-color: rgb(248 113 113);
  }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors. (`onPick`/`onClose`/`openedPaths` are optional, so `+page.svelte` not yet passing them is fine.)

- [ ] **Step 3: Manually verify the strip renders**

Run `npm run dev`, open `http://127.0.0.1:4510`. Confirm: the "choose a doc" tab appears at the far right with an input; existing tabs (if any recent specs) now size to their title rather than a fixed 12rem. Typing + Enter clears the box and shakes it (the picker is inert until Task 6 wires `onPick`, so it always shakes for now). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/TabStrip.svelte
git commit -m "feat: picker tab, close buttons, content-width tabs, shake in TabStrip"
```

---

### Task 6: Page wiring — opened groups, pick/close, persistence

Hold manually-opened groups in page state, merge them into the strip (deduped against discovery), resolve picks, persist across reloads, and close on demand.

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `TabStrip` props `onPick`, `onClose`, `openedPaths`; `resolveDoc` results via `GET /api/resolve`; existing `selectSpec(path)`.
- Produces: page-local `pickDoc(query): Promise<boolean>` and `closeOpened(path): void`.

- [ ] **Step 1: Add opened-group state and derived merge**

In `src/routes/+page.svelte`, after the existing `visibleGroups` derived (line ~22), add:

```typescript
  let openedGroups = $state<DisplayGroup[]>([]);

  const OPENED_KEY = 'sr:openedPaths';

  const visiblePaths = $derived(new Set(visibleGroups.map((g) => g.parent.path)));
  // Drop opened groups already shown by discovery (dedupe); keep the rest.
  const openedRendered = $derived(
    openedGroups.filter((g) => !visiblePaths.has(g.parent.path))
  );
  const tabGroups = $derived([...visibleGroups, ...openedRendered]);
  const openedPaths = $derived(new Set(openedRendered.map((g) => g.parent.path)));
```

Add the `DisplayGroup` type to the existing pairing import on line 8:

```typescript
  import { pairAndGroup, type DisplayGroup } from '$lib/pairing';
```

- [ ] **Step 2: Add persistence helper, pickDoc, and closeOpened**

After the `selectSpec` function (line ~46), add:

```typescript
  function persistOpened() {
    localStorage.setItem(OPENED_KEY, JSON.stringify(openedGroups.map((g) => g.parent.path)));
  }

  async function pickDoc(query: string): Promise<boolean> {
    const res = await fetch(`/api/resolve?q=${encodeURIComponent(query)}`);
    if (!res.ok) return false;
    const group: DisplayGroup = await res.json();
    const path = group.parent.path;
    const known = tabGroups.some((g) => g.parent.path === path);
    if (!known) {
      openedGroups = [...openedGroups, group];
      persistOpened();
    }
    return selectSpec(path);
  }

  function closeOpened(path: string) {
    const removed = openedGroups.find((g) => g.parent.path === path);
    openedGroups = openedGroups.filter((g) => g.parent.path !== path);
    persistOpened();
    const hitChild = removed?.children.some((c) => c.path === selectedPath);
    if (selectedPath === path || hitChild) {
      selectedPath = null;
      content = '';
      saveStatus = 'idle';
      localStorage.removeItem(SELECTED_KEY);
    }
  }
```

- [ ] **Step 3: Restore opened groups on mount**

In the `onMount` callback, immediately after the existing `loadSpecs();` call (line ~100), add:

```typescript
    const savedOpened: string[] = JSON.parse(localStorage.getItem(OPENED_KEY) ?? '[]');
    Promise.all(
      savedOpened.map((p) =>
        fetch(`/api/resolve?q=${encodeURIComponent(p)}`)
          .then((r) => (r.ok ? (r.json() as Promise<DisplayGroup>) : null))
          .catch(() => null)
      )
    ).then((groups) => {
      openedGroups = groups.filter((g): g is DisplayGroup => g !== null);
      persistOpened();
    });
```

- [ ] **Step 4: Pass the new props to TabStrip**

Change the `<TabStrip ... />` usage (line ~123) to:

```svelte
  <TabStrip
    groups={tabGroups}
    {selectedPath}
    onSelect={selectSpec}
    onPick={pickDoc}
    onClose={closeOpened}
    {openedPaths}
  />
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS (all existing + new tests).

- [ ] **Step 7: Manually verify the end-to-end flow**

Run `npm run dev`, open `http://127.0.0.1:4510`:
1. In "choose a doc", type a real doc name (e.g. `pick-a-doc-tab-design`) and press Enter → a new tab appears with that doc loaded (plans nested if it is a spec), and a fresh "choose a doc" tab is to its right.
2. Type a bogus name + Enter → input clears and shakes; no tab added.
3. Reload the page → the opened tab is still there.
4. Click its × → the tab disappears; if it was selected the editor clears. Reload → it stays gone.
5. With no recent specs, confirm the picker is the only tab.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire pick-a-doc picker, opened-tab persistence and close"
```

---

## Notes for the implementer

- **Line numbers are approximate** — they reflect the file at plan-writing time. Locate the described anchor (function name, import line) rather than trusting the exact number.
- **Svelte 5 runes only** — no `export let`, no stores; use `$state`/`$derived`/`$props` as the surrounding code does.
- `selectSpec` already returns `Promise<boolean>` and persists `SELECTED_KEY`; `pickDoc` reuses it rather than re-implementing the fetch.
- The resolver intentionally has no `assertSpecPath` call: it only ever returns paths discovered by walking the real glob tree, and `/api/spec` re-guards every read.
