# spec_reader — Flat Recent View + CodeMirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn spec_reader into a flat, recency-ordered "last 24 hours" view of every `docs/superpowers/*/*.md` across `~/Projects`, showing document titles, with a resizable sidebar and a CodeMirror 6 markdown editor (preview left, editor right).

**Architecture:** The server's `scanSpecs` becomes a flat `SpecEntry[]` (all superpowers subdirs, worktree-unique dedup preserved, each entry carrying title/project/worktree/type/recency). The client filters to the last 24h with a pure helper, renders a flat title list with a resizable persisted-width sidebar, and swaps the editor pane to CodeMirror 6 with markdown highlighting and a width cap so the preview absorbs surplus space. Autosave, the mtime poll/reload, and the `/open` deep-link are unchanged.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Tailwind v4, CodeMirror 6 (`@codemirror/{state,view,commands,language,lang-markdown}` + `@lezer/highlight`), Vitest.

## Global Constraints

- **File scope:** union of `~/Projects/*/docs/superpowers/*/*.md` (main) and `~/Projects/*/.claude/worktrees/*/docs/superpowers/*/*.md` (worktrees) — all subdirs (`specs`, `plans`, …), not just `specs`.
- **Worktree-unique dedup:** a worktree file is included only if its `(subdir, filename)` is NOT present on the project's main branch. All main files included.
- **Recency:** `recency = max(mtimeMs, filenameDateMs)` where `filenameDateMs` parses the `YYYY-MM-DD[-HHMM]` prefix (local time; 0 if no prefix). Used for ordering and the 24h window ONLY — **never displayed.**
- **Window:** show only entries with `recency >= now - 24h`. Nothing older.
- **List item:** the document's first markdown heading (`#…` stripped) → fallback first non-empty line → fallback filename. Title shown **in full, wrapping**, never truncated. Caption beneath: `project · worktree · type` (omit worktree when null).
- **Sidebar:** resizable via a draggable divider; width persisted to `localStorage` (default 320px, clamped 220–600).
- **Editor:** preview **left**, CodeMirror **right**; editor column `max-width ~48rem`, `min-width ~22rem`, preview takes surplus; CodeMirror line-wrapping ON; dark theme over `#171717` (neutral-900).
- **Preserve:** scroll-sync (now preview ↔ `view.scrollDOM`), debounced autosave, mtime poll + reload toast, `/open` deep-link.
- **Svelte 5 runes** throughout. Server binds localhost; paths validated under `~/Projects/**/docs/superpowers/**/*.md`.

---

### Task 1: Server — flat discovery across all superpowers subdirs

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/config.ts`
- Modify: `src/lib/server/paths.ts`
- Rewrite: `src/lib/server/discovery.ts`
- Rewrite: `src/lib/server/discovery.test.ts`
- Modify: `src/lib/server/paths.test.ts`

**Interfaces:**
- Consumes: `PROJECTS_ROOT` from `config.ts`.
- Produces:
  - `SpecEntry { path, filename, title, project, worktree: string|null, type, mtime, recency }` (all strings except `worktree` and the two numbers).
  - `scanSpecs(root?: string): Promise<SpecEntry[]>` — flat, sorted by `recency` desc.
  - `parseFilenameDateMs(filename: string): number` and `extractTitle(content: string): string | null` (exported for tests).
  - `SUPERPOWERS_SEGMENT` from `config.ts` (replaces `SPECS_SEGMENT`).
  - `ProjectGroup` is **kept** in `types.ts` for now (the client still imports it until Task 3) — do not delete it here.

- [ ] **Step 1: Update the type and config**

`src/lib/types.ts` (note: `ProjectGroup` retained, `SpecEntry` reshaped — `date` removed):
```ts
export interface SpecEntry {
  /** absolute path on disk */
  path: string;
  /** basename, e.g. 2026-06-22-foo-design.md */
  filename: string;
  /** first markdown heading (stripped) / first non-empty line / filename */
  title: string;
  /** project directory name */
  project: string;
  /** worktree name if this file exists ONLY in a worktree, else null */
  worktree: string | null;
  /** display label for the superpowers subdir: 'spec' | 'plan' | raw subdir name */
  type: string;
  /** file mtime in ms */
  mtime: number;
  /** max(mtime, filename-date-ms) — for ordering and the 24h window only */
  recency: number;
}

export interface ProjectGroup {
  project: string;
  specs: SpecEntry[];
}
```

`src/lib/server/config.ts`:
```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROJECTS_ROOT = join(homedir(), 'Projects');
export const SUPERPOWERS_SEGMENT = join('docs', 'superpowers');
```

- [ ] **Step 2: Widen path validation**

`src/lib/server/paths.ts`:
```ts
import { resolve, sep } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';

function bad(message: string): never {
  const err = new Error(message) as Error & { status: number };
  err.status = 400;
  throw err;
}

export function assertSpecPath(p: string, root: string = PROJECTS_ROOT): string {
  const resolved = resolve(p);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    bad(`path is outside the projects root: ${p}`);
  }
  if (!resolved.includes(sep + SUPERPOWERS_SEGMENT + sep)) {
    bad(`path is not inside a docs/superpowers directory: ${p}`);
  }
  if (!resolved.endsWith('.md')) {
    bad(`path is not a markdown file: ${p}`);
  }
  return resolved;
}
```

- [ ] **Step 3: Write the failing discovery + helper tests**

Rewrite `src/lib/server/discovery.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs, parseFilenameDateMs, extractTitle } from './discovery';

let root: string;

async function write(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'specreader-'));
  const aSpecs = join(root, 'projA/docs/superpowers/specs');
  const aPlans = join(root, 'projA/docs/superpowers/plans');
  const aWt = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const bSpecs = join(root, 'projB/docs/superpowers/specs');

  await write(aSpecs, '2026-06-20-foo-design.md', '# Foo Spec\n\nbody');
  await write(aPlans, '2026-06-20-foo-design.md', '# Foo Plan\n'); // same basename, other subdir -> kept
  await write(aWt, '2026-06-20-foo-design.md', '# Foo (wt copy)\n'); // dup of main specs -> excluded
  await write(aWt, '2026-06-21-bar-design.md', '## Bar Heading\n'); // unique -> kept, worktree wt1
  await write(bSpecs, '2026-06-22-baz-design.md', 'no heading here\nsecond line'); // first-line title
  await write(aSpecs, 'zzz-untitled.md', ''); // empty -> title falls back to filename

  // recency = max(mtime, filenameDate): old mtime + future-ish filename date -> filename wins
  await write(bSpecs, '2026-06-22-recency-design.md', '# Recency\n');
  const old = new Date(2020, 0, 1).getTime() / 1000;
  await utimes(join(bSpecs, '2026-06-22-recency-design.md'), old, old);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function byName(list: Awaited<ReturnType<typeof scanSpecs>>, name: string) {
  return list.find((e) => e.filename === name);
}

describe('parseFilenameDateMs', () => {
  it('parses YYYY-MM-DD and YYYY-MM-DD-HHMM, HHMM later than midnight', () => {
    expect(parseFilenameDateMs('2026-06-20-x.md')).toBeGreaterThan(0);
    expect(parseFilenameDateMs('2026-06-20-1200-x.md')).toBeGreaterThan(
      parseFilenameDateMs('2026-06-20-x.md')
    );
  });
  it('returns 0 when no date prefix', () => {
    expect(parseFilenameDateMs('no-date.md')).toBe(0);
  });
});

describe('extractTitle', () => {
  it('uses the first heading, stripped', () => {
    expect(extractTitle('# Hello World\n\nbody')).toBe('Hello World');
    expect(extractTitle('## Sub\n')).toBe('Sub');
  });
  it('falls back to the first non-empty line when no heading', () => {
    expect(extractTitle('\n\nplain first line\nmore')).toBe('plain first line');
  });
  it('returns null for empty/whitespace content', () => {
    expect(extractTitle('   \n\n')).toBeNull();
  });
});

describe('scanSpecs', () => {
  it('returns a flat array sorted by recency descending', async () => {
    const list = await scanSpecs(root);
    expect(Array.isArray(list)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].recency).toBeGreaterThanOrEqual(list[i].recency);
    }
  });

  it('includes plans alongside specs with distinct type labels', async () => {
    const list = await scanSpecs(root);
    const specFoo = list.find((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'spec');
    const planFoo = list.find((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'plan');
    expect(specFoo).toBeTruthy();
    expect(planFoo).toBeTruthy();
  });

  it('excludes worktree files that duplicate a main file (same subdir+name)', async () => {
    const list = await scanSpecs(root);
    const foos = list.filter((e) => e.filename === '2026-06-20-foo-design.md' && e.type === 'spec');
    expect(foos).toHaveLength(1);
    expect(foos[0].worktree).toBeNull();
  });

  it('includes worktree-unique files tagged with the worktree name', async () => {
    const bar = byName(await scanSpecs(root), '2026-06-21-bar-design.md');
    expect(bar?.worktree).toBe('wt1');
    expect(bar?.type).toBe('spec');
    expect(bar?.project).toBe('projA');
  });

  it('extracts titles with heading, first-line, and filename fallbacks', async () => {
    const list = await scanSpecs(root);
    expect(byName(list, '2026-06-20-foo-design.md')?.title).toBe('Foo Spec');
    expect(byName(list, '2026-06-22-baz-design.md')?.title).toBe('no heading here');
    expect(byName(list, 'zzz-untitled.md')?.title).toBe('zzz-untitled.md');
  });

  it('recency takes the max of mtime and filename date', async () => {
    const e = byName(await scanSpecs(root), '2026-06-22-recency-design.md')!;
    expect(e.recency).toBe(parseFilenameDateMs('2026-06-22-recency-design.md'));
    expect(e.recency).toBeGreaterThan(e.mtime);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: FAIL — `parseFilenameDateMs`/`extractTitle` not exported and `scanSpecs` returns the old grouped shape.

- [ ] **Step 5: Rewrite discovery**

`src/lib/server/discovery.ts`:
```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import type { SpecEntry } from '$lib/types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?/;

export function parseFilenameDateMs(filename: string): number {
  const m = DATE_RE.exec(filename);
  if (!m) return 0;
  const [, y, mo, d, hh, mm] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), hh ? Number(hh) : 0, mm ? Number(mm) : 0).getTime();
}

export function extractTitle(content: string): string | null {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const h = /^#{1,6}\s+(.+)$/.exec(t);
    return h ? h[1].trim() : t;
  }
  return null;
}

function typeLabel(subdir: string): string {
  if (subdir === 'specs') return 'spec';
  if (subdir === 'plans') return 'plan';
  return subdir;
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

async function makeEntry(
  dir: string,
  filename: string,
  project: string,
  worktree: string | null,
  subdir: string
): Promise<SpecEntry> {
  const path = join(dir, filename);
  const raw = await readFile(path, 'utf8').catch(() => '');
  const st = await stat(path);
  const mtime = st.mtimeMs;
  return {
    path,
    filename,
    title: extractTitle(raw) ?? filename,
    project,
    worktree,
    type: typeLabel(subdir),
    mtime,
    recency: Math.max(mtime, parseFilenameDateMs(filename))
  };
}

export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<SpecEntry[]> {
  const out: SpecEntry[] = [];

  for (const project of await listDirs(root)) {
    const mainSuper = join(root, project, SUPERPOWERS_SEGMENT);
    const mainSet = new Set<string>();
    for (const sub of await listDirs(mainSuper)) {
      const dir = join(mainSuper, sub);
      for (const name of await listMarkdown(dir)) {
        mainSet.add(`${sub}/${name}`);
        out.push(await makeEntry(dir, name, project, null, sub));
      }
    }

    const wtRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(wtRoot)) {
      const wtSuper = join(wtRoot, wt, SUPERPOWERS_SEGMENT);
      for (const sub of await listDirs(wtSuper)) {
        const dir = join(wtSuper, sub);
        for (const name of await listMarkdown(dir)) {
          if (mainSet.has(`${sub}/${name}`)) continue;
          out.push(await makeEntry(dir, name, project, wt, sub));
        }
      }
    }
  }

  out.sort((a, b) => b.recency - a.recency);
  return out;
}
```

- [ ] **Step 6: Add a plans-accept case to paths.test.ts**

In `src/lib/server/paths.test.ts`, add inside `describe('assertSpecPath', …)`:
```ts
  it('accepts a plans path (any superpowers subdir)', () => {
    const plan = join(ROOT, 'planafoot/docs/superpowers/plans/2026-06-22-x.md');
    expect(assertSpecPath(plan, ROOT)).toBe(plan);
  });
```

- [ ] **Step 7: Run check and tests**

Run: `npm run check` → expect 0 errors.
Run: `npx vitest run` → expect all suites pass (paths incl. new plans case; discovery rewritten).
Note: `src/routes/api/specs/+server.ts` needs no change — it returns `json(await scanSpecs())`, now a flat array.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/server/config.ts src/lib/server/paths.ts src/lib/server/discovery.ts src/lib/server/discovery.test.ts src/lib/server/paths.test.ts
git commit -m "feat: flat discovery across all superpowers subdirs with title and recency"
```

---

### Task 2: Recency window helper

**Files:**
- Create: `src/lib/recency.ts`
- Test: `src/lib/recency.test.ts`

**Interfaces:**
- Consumes: `SpecEntry` from `$lib/types`.
- Produces: `DAY_MS: number` and `withinWindow(specs: SpecEntry[], nowMs: number, windowMs?: number): SpecEntry[]` — keeps entries with `recency >= nowMs - windowMs`, preserving input order; `windowMs` defaults to `DAY_MS`.

- [ ] **Step 1: Write the failing test**

`src/lib/recency.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { withinWindow, DAY_MS } from './recency';
import type { SpecEntry } from '$lib/types';

function entry(recency: number, filename = 'x.md'): SpecEntry {
  return {
    path: '/p/' + filename,
    filename,
    title: filename,
    project: 'p',
    worktree: null,
    type: 'spec',
    mtime: recency,
    recency
  };
}

describe('withinWindow', () => {
  const now = 1_000_000_000_000;

  it('keeps entries at or after the cutoff, drops older ones', () => {
    const inside = entry(now - DAY_MS + 1, 'inside.md');
    const old = entry(now - DAY_MS - 1, 'old.md');
    const result = withinWindow([inside, old], now);
    expect(result.map((e) => e.filename)).toEqual(['inside.md']);
  });

  it('treats exactly-at-cutoff as inside (inclusive)', () => {
    const boundary = entry(now - DAY_MS, 'boundary.md');
    expect(withinWindow([boundary], now)).toHaveLength(1);
  });

  it('preserves input order and returns [] for empty input', () => {
    const a = entry(now - 10, 'a.md');
    const b = entry(now - 5, 'b.md');
    expect(withinWindow([a, b], now).map((e) => e.filename)).toEqual(['a.md', 'b.md']);
    expect(withinWindow([], now)).toEqual([]);
  });

  it('respects a custom windowMs', () => {
    const e = entry(now - 5000, 'e.md');
    expect(withinWindow([e], now, 1000)).toHaveLength(0);
    expect(withinWindow([e], now, 10000)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recency.test.ts`
Expected: FAIL — cannot resolve `./recency`.

- [ ] **Step 3: Implement the helper**

`src/lib/recency.ts`:
```ts
import type { SpecEntry } from '$lib/types';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function withinWindow(
  specs: SpecEntry[],
  nowMs: number,
  windowMs: number = DAY_MS
): SpecEntry[] {
  const cutoff = nowMs - windowMs;
  return specs.filter((s) => s.recency >= cutoff);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/recency.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recency.ts src/lib/recency.test.ts
git commit -m "feat: add withinWindow recency filter"
```

---

### Task 3: Flat sidebar + recent filter + resizable persisted width

**Files:**
- Rewrite: `src/lib/components/Sidebar.svelte`
- Rewrite: `src/routes/+page.svelte`
- Modify: `src/lib/types.ts` (remove now-unused `ProjectGroup`)

**Interfaces:**
- Consumes: `SpecEntry` (Task 1), `withinWindow` (Task 2), `GET /api/spec`, `GET /api/specs` (flat).
- Produces: `Sidebar.svelte` props `{ specs: SpecEntry[]; selectedPath: string | null; onSelect: (path: string) => void }`.

- [ ] **Step 1: Rewrite the sidebar as a flat title list**

`src/lib/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  import type { SpecEntry } from '$lib/types';

  let {
    specs,
    selectedPath,
    onSelect
  }: {
    specs: SpecEntry[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();

  function caption(s: SpecEntry): string {
    return [s.project, s.worktree, s.type].filter(Boolean).join(' · ');
  }
</script>

<nav class="h-full overflow-y-auto bg-neutral-950 p-2 text-sm">
  {#if specs.length === 0}
    <p class="p-2 text-neutral-500">No specs in the last 24 hours.</p>
  {/if}
  <ul>
    {#each specs as spec (spec.path)}
      <li>
        <button
          type="button"
          class="mb-1 block w-full rounded px-2 py-2 text-left hover:bg-neutral-800
            {selectedPath === spec.path ? 'bg-blue-950' : ''}"
          onclick={() => onSelect(spec.path)}
        >
          <span
            class="block break-words leading-snug
              {selectedPath === spec.path ? 'text-blue-200' : 'text-neutral-200'}"
            >{spec.title}</span
          >
          <span class="mt-0.5 block break-words text-xs text-neutral-500">{caption(spec)}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>
```

- [ ] **Step 2: Rewrite the page (flat specs, 24h filter, resizable sidebar)**

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { SpecEntry } from '$lib/types';
  import { withinWindow } from '$lib/recency';

  let specs = $state<SpecEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');
  let knownMtime = $state(0);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const visible = $derived(withinWindow(specs, Date.now()));

  // Resizable sidebar
  const MIN_W = 220;
  const MAX_W = 600;
  const DEFAULT_W = 320;
  const STORAGE_KEY = 'sr:sidebarWidth';
  let sidebarWidth = $state(DEFAULT_W);
  let resizing = false;

  function startResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: PointerEvent) {
    if (!resizing) return;
    sidebarWidth = Math.min(MAX_W, Math.max(MIN_W, e.clientX));
  }
  function endResize(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }

  async function loadSpecs() {
    const res = await fetch('/api/specs');
    specs = await res.json();
  }

  async function selectSpec(path: string) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    selectedPath = path;
    saveStatus = 'idle';
  }

  async function save() {
    if (!selectedPath) return;
    const savedPath = selectedPath;
    saveStatus = 'saving';
    try {
      const res = await fetch(`/api/spec?path=${encodeURIComponent(savedPath)}`, {
        method: 'PUT',
        body: content
      });
      if (selectedPath !== savedPath) return;
      if (!res.ok) {
        saveStatus = 'error';
        return;
      }
      const data = await res.json();
      knownMtime = data.mtime;
      saveStatus = 'saved';
    } catch {
      if (selectedPath !== savedPath) return;
      saveStatus = 'error';
    }
  }

  function handleInput(value: string) {
    content = value;
    saveStatus = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  async function pollExternalChange() {
    if (!selectedPath || saveStatus === 'saving') return;
    const polledPath = selectedPath;
    const res = await fetch(`/api/spec?path=${encodeURIComponent(polledPath)}`);
    if (!res.ok) return;
    if (selectedPath !== polledPath) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      saveStatus = 'idle';
      showToast('Reloaded — file changed on disk');
    }
  }

  onMount(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_W && saved <= MAX_W) sidebarWidth = saved;
    loadSpecs();
    const params = new URLSearchParams(window.location.search);
    const path = params.get('path');
    if (path) selectSpec(path);
    const id = setInterval(pollExternalChange, 3000);
    return () => clearInterval(id);
  });
</script>

<div class="flex h-screen bg-neutral-900 text-neutral-200">
  <div class="shrink-0 overflow-hidden" style="width: {sidebarWidth}px">
    <Sidebar specs={visible} {selectedPath} onSelect={selectSpec} />
  </div>
  <div
    class="w-1 shrink-0 cursor-col-resize bg-neutral-800 hover:bg-neutral-600"
    role="separator"
    aria-orientation="vertical"
    onpointerdown={startResize}
    onpointermove={onResizeMove}
    onpointerup={endResize}
  ></div>
  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    {#if selectedPath}
      <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span class="truncate text-neutral-500" title={selectedPath}>{selectedPath}</span>
        <span class="ml-2 shrink-0 text-neutral-500">
          {#if saveStatus === 'saving'}saving…{:else if saveStatus === 'saved'}saved{:else if saveStatus === 'error'}<span
              class="text-red-400">save failed</span
            >{/if}
        </span>
      </header>
      <div class="min-h-0 flex-1">
        <Editor {content} onInput={handleInput} />
      </div>
    {:else}
      <p class="p-6 text-neutral-500">Select a spec.</p>
    {/if}
  </main>
</div>
<Toast message={toast} />
```

- [ ] **Step 3: Remove the now-unused ProjectGroup type**

In `src/lib/types.ts`, delete the `ProjectGroup` interface (nothing imports it after Step 2 — discovery returns `SpecEntry[]`, the API forwards it, and the client uses `SpecEntry`). Leave `SpecEntry` intact.

- [ ] **Step 4: Verify**

Run: `npm run check` → expect 0 errors (confirms no remaining `ProjectGroup` references).
Run: `npx vitest run` → all suites still pass.
Runtime smoke: start the dev server, confirm `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4510/` is `200`, then KILL it (capture PID, kill). (ssr=false, so don't grep rendered text.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/routes/+page.svelte src/lib/types.ts
git commit -m "feat: flat 24h title list with resizable persisted sidebar"
```

---

### Task 4: CodeMirror editor + pane swap + width cap

**Files:**
- Modify: `package.json` (add CodeMirror deps)
- Rewrite: `src/lib/components/Editor.svelte`

**Interfaces:**
- Consumes: `content: string`, `onInput: (value: string) => void` props (unchanged); `renderMarkdown` from `$lib/render`.
- Produces: no new exports — same `Editor` props as before.

- [ ] **Step 1: Add CodeMirror dependencies**

Run:
```bash
npm install @codemirror/state@^6 @codemirror/view@^6 @codemirror/commands@^6 @codemirror/language@^6 @codemirror/lang-markdown@^6 @lezer/highlight@^1
```
Expected: installs into `dependencies`; `npm run check` (run after Step 2) stays clean.

- [ ] **Step 2: Rewrite the editor with CodeMirror, swapped panes, and a capped width**

`src/lib/components/Editor.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
  import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { markdown } from '@codemirror/lang-markdown';
  import { tags } from '@lezer/highlight';
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $derived(renderMarkdown(content));

  let editorEl: HTMLDivElement;
  let preview: HTMLDivElement;
  let view: EditorView | undefined;
  let syncing = false;
  let applyingExternal = false;

  function pct(el: HTMLElement): number {
    const max = el.scrollHeight - el.clientHeight;
    return max <= 0 ? 0 : el.scrollTop / max;
  }
  function applyPct(el: HTMLElement, p: number) {
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = p * max;
  }
  function sync(from: HTMLElement, to: HTMLElement) {
    if (syncing) return;
    syncing = true;
    applyPct(to, pct(from));
    requestAnimationFrame(() => (syncing = false));
  }

  const darkTheme = EditorView.theme(
    {
      '&': { height: '100%', backgroundColor: '#171717', color: '#f5f5f5' },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '13px',
        overflow: 'auto'
      },
      '.cm-content': { caretColor: '#e5e5e5' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor': { borderLeftColor: '#e5e5e5' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#264f78'
      }
    },
    { dark: true }
  );

  const mdHighlight = HighlightStyle.define([
    { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
    { tag: tags.strong, color: '#fde68a', fontWeight: 'bold' },
    { tag: tags.emphasis, color: '#fcd34d', fontStyle: 'italic' },
    { tag: tags.link, color: '#7dd3fc', textDecoration: 'underline' },
    { tag: tags.url, color: '#7dd3fc' },
    { tag: tags.monospace, color: '#fca5a5' },
    { tag: tags.list, color: '#a3a3a3' },
    { tag: tags.quote, color: '#a3a3a3', fontStyle: 'italic' }
  ]);

  onMount(() => {
    view = new EditorView({
      parent: editorEl,
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          syntaxHighlighting(mdHighlight),
          highlightActiveLine(),
          darkTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !applyingExternal) onInput(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: () => {
              if (view) sync(view.scrollDOM, preview);
            }
          })
        ]
      })
    });
    return () => view?.destroy();
  });

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
</script>

<div class="flex h-full overflow-hidden">
  <div
    bind:this={preview}
    class="prose prose-invert prose-sm min-w-0 flex-1 overflow-y-auto bg-neutral-900 p-4"
    onscroll={() => {
      if (view) sync(preview, view.scrollDOM);
    }}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
  <div
    bind:this={editorEl}
    class="min-w-[22rem] max-w-[48rem] flex-1 overflow-hidden border-l border-neutral-800"
  ></div>
</div>
```

- [ ] **Step 3: Verify build + types + smoke**

Run: `npm run check` → expect 0 errors.
Run: `npm run build` → expect success (CodeMirror imports only touch `window`/`document` inside `onMount`, so the ssr=false page builds fine).
Runtime smoke: `npm start` (PORT=4510 HOST=127.0.0.1 node build), confirm `GET /` → 200, then KILL the server (capture PID, kill).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/components/Editor.svelte
git commit -m "feat: codemirror markdown editor, preview-left, capped editor width"
```

---

## Verification (end-to-end, real browser)

1. `npm install && npm test` — discovery (flat/title/recency/dedup-across-subdirs), `withinWindow`, and paths suites pass.
2. `npm run build && npm start` — server live on `127.0.0.1:4510`.
3. Sidebar shows a **flat list of titles** (first headings), each with a `project · worktree · type` caption; **only last-24h** entries; **no dates**; newest first. Long titles **wrap** (no truncation). `plans` appear alongside `specs`.
4. Drag the divider — sidebar resizes; reload the page — width **persists**.
5. Select an item — **preview on the left**, **CodeMirror on the right** with **markdown syntax highlighting** in the dark theme; long lines wrap.
6. At a wide window, the editor stops growing at its cap and the **preview takes the surplus** width.
7. **Scroll-sync** still tracks both ways (scroll the CodeMirror pane → preview follows, and vice-versa).
8. Edit text → `saving…` → `saved`, file changes on disk; append to the file from another terminal → within ~3s it reloads with the toast (CodeMirror doc updates).
9. `http://localhost:4510/open?path=<abs>` opens the right document selected.

## Out of Scope (future)

- Filter/search across the full union (the way to reach anything older than 24h).
- Anything older than 24 hours; launchd/permanent auto-start; WYSIWYG; create/delete; auth.
