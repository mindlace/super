# spec_reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent local web app (`127.0.0.1:4510`) that lists, renders, and lightly edits superpowers spec files across `~/Projects/`, with an agent-clickable deep-link to open a specific spec.

**Architecture:** SvelteKit 2 / Svelte 5 app built with `adapter-node`, run as a long-lived local Node server. Server routes do all filesystem work (scan specs, read/write one file); the single page (`ssr = false`) is a sidebar + split-pane editor. Markdown is rendered client-side with `marked` + `DOMPurify`. Editing autosaves on a debounce; an `mtime` poll reloads the file (with a toast) when it changes on disk.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `@sveltejs/adapter-node`, `marked`, `dompurify`, Vitest.

## Global Constraints

- **Specs root:** `~/Projects/` — resolved via `os.homedir()` + `Projects`. Never hardcode `/Users/...`.
- **Spec location pattern:** `<project>/docs/superpowers/specs/*.md` and `<project>/.claude/worktrees/<wt>/docs/superpowers/specs/*.md`.
- **Worktree-unique rule:** a worktree spec is included only if its basename is NOT present in that project's main-branch specs.
- **Port/host:** `127.0.0.1:4510` for dev, preview, and the built node server.
- **Path safety:** every filesystem `path` from a request must resolve under `~/Projects/`, contain the `docs/superpowers/specs` segment, and end in `.md`. Reject otherwise with HTTP 400.
- **External-change handling:** on detecting a newer on-disk `mtime` than the app last knew, ALWAYS reload from disk and toast. No conflict prompt, no "keep mine".
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — not legacy `export let` / stores.

---

### Task 1: Scaffold SvelteKit + adapter-node + Tailwind project

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `.npmrc`, `.gitignore`
- Create: `src/app.html`, `src/app.css`, `src/app.d.ts`
- Create: `src/routes/+layout.svelte`, `src/routes/+page.ts`, `src/routes/+page.svelte`

**Interfaces:**
- Produces: a runnable SvelteKit app on `127.0.0.1:4510`; `src/app.css` imports Tailwind; `+page.ts` exports `ssr = false`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "spec_reader",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "PORT=4510 HOST=127.0.0.1 node build",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^5.2.12",
    "@sveltejs/kit": "^2.20.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.3",
    "@tailwindcss/typography": "^0.5.16",
    "@tailwindcss/vite": "^4.1.0",
    "svelte": "^5.20.0",
    "svelte-check": "^4.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "dompurify": "^3.2.0",
    "marked": "^15.0.0"
  }
}
```

- [ ] **Step 2: Create config files**

`.npmrc`:
```
engine-strict=true
```

`.gitignore`:
```
node_modules
/build
/.svelte-kit
/package
.env
.DS_Store
```

`svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
};
```

`vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 4510, host: '127.0.0.1' },
  preview: { port: 4510, host: '127.0.0.1' }
});
```

`vitest.config.ts` (unit tests are pure Node — no SvelteKit plugin needed):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] }
});
```

`tsconfig.json`:
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

- [ ] **Step 3: Create app shell files**

`src/app.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>spec_reader</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`src/app.css`:
```css
@import 'tailwindcss';
@plugin '@tailwindcss/typography';
```

`src/app.d.ts`:
```ts
declare global {
  namespace App {}
}

export {};
```

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

`src/routes/+page.ts`:
```ts
export const ssr = false;
```

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
</script>

<main class="p-6">
  <h1 class="text-xl font-semibold">spec_reader</h1>
</main>
```

- [ ] **Step 4: Install dependencies and sync**

Run:
```bash
npm install
npm run check
```
Expected: install completes; `svelte-kit sync` generates `.svelte-kit/`; `svelte-check` reports `0 errors`.

- [ ] **Step 5: Verify the dev server boots**

Run (in background, then curl):
```bash
npm run dev &
sleep 4
curl -s http://127.0.0.1:4510/ | grep -o 'spec_reader'
kill %1
```
Expected: prints `spec_reader` (the page rendered). Then stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold sveltekit + adapter-node + tailwind app"
```

---

### Task 2: Path validation utility

**Files:**
- Create: `src/lib/server/config.ts`
- Create: `src/lib/server/paths.ts`
- Test: `src/lib/server/paths.test.ts`

**Interfaces:**
- Produces:
  - `PROJECTS_ROOT: string` (from `config.ts`) = `join(homedir(), 'Projects')`.
  - `assertSpecPath(p: string, root?: string): string` — returns the resolved absolute path if valid, else throws an `Error` with `.status = 400`. Validity = resolves under `root` (default `PROJECTS_ROOT`), contains the `docs/superpowers/specs` path segment, ends in `.md`.

- [ ] **Step 1: Write the failing test**

`src/lib/server/paths.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { assertSpecPath } from './paths';

const ROOT = '/tmp/projects-root';
const good = join(ROOT, 'planafoot/docs/superpowers/specs/2026-06-22-x-design.md');
const goodWorktree = join(
  ROOT,
  'planafoot/.claude/worktrees/wt1/docs/superpowers/specs/2026-06-22-y-design.md'
);

describe('assertSpecPath', () => {
  it('accepts a valid main spec path', () => {
    expect(assertSpecPath(good, ROOT)).toBe(good);
  });

  it('accepts a valid worktree spec path', () => {
    expect(assertSpecPath(goodWorktree, ROOT)).toBe(goodWorktree);
  });

  it('rejects a path outside the root', () => {
    expect(() => assertSpecPath('/etc/passwd', ROOT)).toThrow();
  });

  it('rejects traversal escaping the root', () => {
    const evil = join(ROOT, '../../etc/docs/superpowers/specs/x.md');
    expect(() => assertSpecPath(evil, ROOT)).toThrow();
  });

  it('rejects a non-markdown file', () => {
    const txt = join(ROOT, 'p/docs/superpowers/specs/x.txt');
    expect(() => assertSpecPath(txt, ROOT)).toThrow();
  });

  it('rejects a markdown file not under specs', () => {
    const elsewhere = join(ROOT, 'p/README.md');
    expect(() => assertSpecPath(elsewhere, ROOT)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/paths.test.ts`
Expected: FAIL — cannot resolve `./paths`.

- [ ] **Step 3: Write `config.ts` and `paths.ts`**

`src/lib/server/config.ts`:
```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROJECTS_ROOT = join(homedir(), 'Projects');
export const SPECS_SEGMENT = join('docs', 'superpowers', 'specs');
```

`src/lib/server/paths.ts`:
```ts
import { resolve, sep } from 'node:path';
import { PROJECTS_ROOT, SPECS_SEGMENT } from './config';

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
  if (!resolved.includes(sep + SPECS_SEGMENT + sep)) {
    bad(`path is not inside a docs/superpowers/specs directory: ${p}`);
  }
  if (!resolved.endsWith('.md')) {
    bad(`path is not a markdown file: ${p}`);
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/paths.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/config.ts src/lib/server/paths.ts src/lib/server/paths.test.ts
git commit -m "feat: add spec path validation"
```

---

### Task 3: Spec discovery

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/server/discovery.ts`
- Test: `src/lib/server/discovery.test.ts`

**Interfaces:**
- Consumes: `PROJECTS_ROOT`, `SPECS_SEGMENT` from `config.ts`.
- Produces:
  - Types `SpecEntry { path; filename; date; worktree: string | null }` and `ProjectGroup { project: string; specs: SpecEntry[] }`.
  - `scanSpecs(root?: string): Promise<ProjectGroup[]>` — projects sorted by newest spec descending; within a project, specs sorted newest-first; worktree-inherited duplicates removed; genuinely worktree-only specs carry `worktree`.
  - `specSortKey(filename: string): string` — `YYYYMMDDHHMM` string (time defaults to `0000`) for sorting.

- [ ] **Step 1: Write the failing test**

`src/lib/server/discovery.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSpecs } from './discovery';

let root: string;

async function spec(dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), `# ${name}\n`);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'specreader-'));
  const aMain = join(root, 'projA/docs/superpowers/specs');
  const aWt = join(root, 'projA/.claude/worktrees/wt1/docs/superpowers/specs');
  const bMain = join(root, 'projB/docs/superpowers/specs');
  await spec(aMain, '2026-01-01-foo-design.md');
  await spec(aMain, '2026-02-02-bar-design.md');
  await spec(aWt, '2026-01-01-foo-design.md'); // inherited dup -> excluded
  await spec(aWt, '2026-03-03-1200-new-design.md'); // unique -> included
  await spec(bMain, '2026-05-05-baz-design.md');
  await mkdir(join(root, 'projC'), { recursive: true }); // no specs -> excluded
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scanSpecs', () => {
  it('groups by project, excludes empty projects', async () => {
    const groups = await scanSpecs(root);
    expect(groups.map((g) => g.project)).toEqual(['projB', 'projA']);
  });

  it('sorts projects by newest spec descending', async () => {
    const groups = await scanSpecs(root);
    expect(groups[0].project).toBe('projB'); // 2026-05-05 newest overall
  });

  it('excludes worktree specs that duplicate a main spec', async () => {
    const groups = await scanSpecs(root);
    const a = groups.find((g) => g.project === 'projA')!;
    const foos = a.specs.filter((s) => s.filename === '2026-01-01-foo-design.md');
    expect(foos).toHaveLength(1);
    expect(foos[0].worktree).toBeNull();
  });

  it('includes worktree-only specs with a worktree tag, newest first', async () => {
    const groups = await scanSpecs(root);
    const a = groups.find((g) => g.project === 'projA')!;
    expect(a.specs.map((s) => s.filename)).toEqual([
      '2026-03-03-1200-new-design.md',
      '2026-02-02-bar-design.md',
      '2026-01-01-foo-design.md'
    ]);
    expect(a.specs[0].worktree).toBe('wt1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: FAIL — cannot resolve `./discovery`.

- [ ] **Step 3: Write `types.ts` and `discovery.ts`**

`src/lib/types.ts`:
```ts
export interface SpecEntry {
  /** absolute path on disk */
  path: string;
  /** basename, e.g. 2026-06-22-foo-design.md */
  filename: string;
  /** YYYY-MM-DD prefix (or full prefix) for display */
  date: string;
  /** worktree name if this spec exists ONLY in a worktree, else null */
  worktree: string | null;
}

export interface ProjectGroup {
  project: string;
  specs: SpecEntry[];
}
```

`src/lib/server/discovery.ts`:
```ts
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_ROOT, SPECS_SEGMENT } from './config';
import type { SpecEntry, ProjectGroup } from '$lib/types';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?/;

export function specSortKey(filename: string): string {
  const m = DATE_RE.exec(filename);
  if (!m) return '0000000000000000' + filename;
  const date = m[1].replace(/-/g, '');
  const time = m[2] ?? '0000';
  return date + time;
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
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function makeEntry(dir: string, filename: string, worktree: string | null): SpecEntry {
  const m = DATE_RE.exec(filename);
  return {
    path: join(dir, filename),
    filename,
    date: m ? m[1] : '',
    worktree
  };
}

export async function scanSpecs(root: string = PROJECTS_ROOT): Promise<ProjectGroup[]> {
  const projects = await listDirs(root);
  const groups: ProjectGroup[] = [];

  for (const project of projects) {
    const mainDir = join(root, project, SPECS_SEGMENT);
    const mainNames = await listMarkdown(mainDir);
    const mainSet = new Set(mainNames);

    const specs: SpecEntry[] = mainNames.map((n) => makeEntry(mainDir, n, null));

    const worktreesRoot = join(root, project, '.claude', 'worktrees');
    for (const wt of await listDirs(worktreesRoot)) {
      const wtDir = join(worktreesRoot, wt, SPECS_SEGMENT);
      for (const n of await listMarkdown(wtDir)) {
        if (!mainSet.has(n)) specs.push(makeEntry(wtDir, n, wt));
      }
    }

    if (specs.length === 0) continue;

    specs.sort((a, b) => specSortKey(b.filename).localeCompare(specSortKey(a.filename)));
    groups.push({ project, specs });
  }

  groups.sort((a, b) =>
    specSortKey(b.specs[0].filename).localeCompare(specSortKey(a.specs[0].filename))
  );
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/discovery.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/server/discovery.ts src/lib/server/discovery.test.ts
git commit -m "feat: add worktree-aware spec discovery"
```

---

### Task 4: API + deep-link endpoints

**Files:**
- Create: `src/routes/api/specs/+server.ts`
- Create: `src/routes/api/spec/+server.ts`
- Create: `src/routes/open/+server.ts`

**Interfaces:**
- Consumes: `scanSpecs` (Task 3), `assertSpecPath` (Task 2).
- Produces HTTP API:
  - `GET /api/specs` → `ProjectGroup[]` JSON.
  - `GET /api/spec?path=<abs>` → `{ content: string, mtime: number }` JSON.
  - `PUT /api/spec?path=<abs>` (body = raw markdown text) → `{ mtime: number }` JSON.
  - `GET /open?path=<abs>` → 302 redirect to `/?path=<abs>`.

- [ ] **Step 1: Write `GET /api/specs`**

`src/routes/api/specs/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { scanSpecs } from '$lib/server/discovery';

export async function GET() {
  return json(await scanSpecs());
}
```

- [ ] **Step 2: Write `GET`/`PUT /api/spec`**

`src/routes/api/spec/+server.ts`:
```ts
import { json, error } from '@sveltejs/kit';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { assertSpecPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

function safePath(url: URL): string {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  try {
    return assertSpecPath(raw);
  } catch (e) {
    throw error(400, (e as Error).message);
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const path = safePath(url);
  try {
    const content = await readFile(path, 'utf8');
    const { mtimeMs } = await stat(path);
    return json({ content, mtime: mtimeMs });
  } catch {
    throw error(404, 'spec not found');
  }
};

export const PUT: RequestHandler = async ({ url, request }) => {
  const path = safePath(url);
  const content = await request.text();
  await writeFile(path, content, 'utf8');
  const { mtimeMs } = await stat(path);
  return json({ mtime: mtimeMs });
};
```

- [ ] **Step 3: Write `GET /open`**

`src/routes/open/+server.ts`:
```ts
import { redirect, error } from '@sveltejs/kit';
import { assertSpecPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  try {
    assertSpecPath(raw);
  } catch (e) {
    throw error(400, (e as Error).message);
  }
  throw redirect(302, `/?path=${encodeURIComponent(raw)}`);
};
```

- [ ] **Step 4: Verify endpoints against the dev server**

Run:
```bash
npm run dev &
sleep 4
echo "--- specs ---"; curl -s http://127.0.0.1:4510/api/specs | head -c 200; echo
SP=$(curl -s http://127.0.0.1:4510/api/specs | node -e 'const g=JSON.parse(require("fs").readFileSync(0));process.stdout.write(g[0].specs[0].path)')
echo "--- get one ---"; curl -s "http://127.0.0.1:4510/api/spec?path=$SP" | head -c 120; echo
echo "--- open redirect ---"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://127.0.0.1:4510/open?path=$SP"
echo "--- bad path ---"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4510/api/spec?path=/etc/passwd"
kill %1
```
Expected: specs returns a JSON array; get one returns `{"content":...,"mtime":...}`; open redirect prints `302 /?path=...`; bad path prints `400`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api src/routes/open
git commit -m "feat: add specs/spec API and open deep-link endpoints"
```

---

### Task 5: Sidebar — list and select specs

**Files:**
- Create: `src/lib/components/Sidebar.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `GET /api/specs`; types `ProjectGroup`, `SpecEntry`.
- Produces:
  - `Sidebar.svelte` props: `{ groups: ProjectGroup[]; selectedPath: string | null; onSelect: (path: string) => void }`. Renders each project with its specs newest-first; worktree-only specs show a badge with the worktree name; the selected spec is highlighted.
  - `+page.svelte` owns `groups` and `selectedPath` state and loads `/api/specs` on mount.

- [ ] **Step 1: Write `Sidebar.svelte`**

`src/lib/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  import type { ProjectGroup } from '$lib/types';

  let {
    groups,
    selectedPath,
    onSelect
  }: {
    groups: ProjectGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();
</script>

<nav class="h-full overflow-y-auto border-r border-gray-200 bg-gray-50 p-3 text-sm">
  {#if groups.length === 0}
    <p class="text-gray-400">No specs found under ~/Projects.</p>
  {/if}
  {#each groups as group (group.project)}
    <section class="mb-4">
      <h2 class="mb-1 font-semibold text-gray-700">{group.project}</h2>
      <ul>
        {#each group.specs as spec (spec.path)}
          <li>
            <button
              type="button"
              class="block w-full truncate rounded px-2 py-1 text-left hover:bg-gray-200
                {selectedPath === spec.path ? 'bg-blue-100 text-blue-900' : 'text-gray-600'}"
              title={spec.filename}
              onclick={() => onSelect(spec.path)}
            >
              {spec.filename}
              {#if spec.worktree}
                <span class="ml-1 rounded bg-amber-200 px-1 text-xs text-amber-900"
                  >{spec.worktree}</span
                >
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</nav>
```

- [ ] **Step 2: Wire the sidebar into `+page.svelte`**

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import type { ProjectGroup } from '$lib/types';

  let groups = $state<ProjectGroup[]>([]);
  let selectedPath = $state<string | null>(null);

  async function loadGroups() {
    const res = await fetch('/api/specs');
    groups = await res.json();
  }

  function selectSpec(path: string) {
    selectedPath = path;
  }

  onMount(loadGroups);
</script>

<div class="grid h-screen grid-cols-[20rem_1fr]">
  <Sidebar {groups} {selectedPath} onSelect={selectSpec} />
  <main class="overflow-hidden p-6">
    {#if selectedPath}
      <p class="text-gray-700">{selectedPath}</p>
    {:else}
      <p class="text-gray-400">Select a spec.</p>
    {/if}
  </main>
</div>
```

- [ ] **Step 3: Verify in the browser**

Run:
```bash
npm run dev &
sleep 4
curl -s http://127.0.0.1:4510/ | grep -o 'Select a spec'
kill %1
```
Expected: prints `Select a spec`. (Manual: open `http://127.0.0.1:4510/`, confirm projects/specs list, worktree badges, and selection highlight.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/routes/+page.svelte
git commit -m "feat: add sidebar listing and spec selection"
```

---

### Task 6: Split-pane editor with rendered preview

**Files:**
- Create: `src/lib/render.ts`
- Create: `src/lib/components/Editor.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `marked`, `dompurify`.
- Produces:
  - `renderMarkdown(md: string): string` in `src/lib/render.ts` (client-side; `marked` → `DOMPurify.sanitize`).
  - `Editor.svelte` props: `{ content: string; onInput: (value: string) => void }`. Left textarea shows `content`; right pane shows sanitized HTML.
  - `+page.svelte` gains `content` state, loads spec content via `GET /api/spec` on selection, and renders `Editor` when a spec is selected.

- [ ] **Step 1: Write `render.ts`**

`src/lib/render.ts`:
```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  const html = marked.parse(md) as string;
  return DOMPurify.sanitize(html);
}
```

- [ ] **Step 2: Write `Editor.svelte`**

`src/lib/components/Editor.svelte`:
```svelte
<script lang="ts">
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $derived(renderMarkdown(content));
</script>

<div class="grid h-full grid-cols-2 gap-0 overflow-hidden">
  <textarea
    class="h-full w-full resize-none border-r border-gray-200 p-4 font-mono text-sm
      outline-none"
    value={content}
    oninput={(e) => onInput(e.currentTarget.value)}
    spellcheck="false"
  ></textarea>
  <div class="prose prose-sm h-full max-w-none overflow-y-auto p-4">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
</div>
```

- [ ] **Step 3: Load content on selection and render the editor**

In `src/routes/+page.svelte`, add `content` state, a loader, and the `Editor`. Replace the `<script>` and the `<main>` block:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import type { ProjectGroup } from '$lib/types';

  let groups = $state<ProjectGroup[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');

  async function loadGroups() {
    const res = await fetch('/api/specs');
    groups = await res.json();
  }

  async function selectSpec(path: string) {
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    content = data.content;
    selectedPath = path;
  }

  function handleInput(value: string) {
    content = value;
  }

  onMount(loadGroups);
</script>

<div class="grid h-screen grid-cols-[20rem_1fr]">
  <Sidebar {groups} {selectedPath} onSelect={selectSpec} />
  <main class="overflow-hidden">
    {#if selectedPath}
      <Editor {content} onInput={handleInput} />
    {:else}
      <p class="p-6 text-gray-400">Select a spec.</p>
    {/if}
  </main>
</div>
```

- [ ] **Step 4: Verify rendering**

Run:
```bash
npm run check
```
Expected: `0 errors`. (Manual: open the app, select a spec, confirm raw markdown on the left and formatted HTML on the right; typing in the left updates the right.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/render.ts src/lib/components/Editor.svelte src/routes/+page.svelte
git commit -m "feat: add split-pane markdown editor with rendered preview"
```

---

### Task 7: Synced scrolling between panes

**Files:**
- Modify: `src/lib/components/Editor.svelte`

**Interfaces:**
- No interface change. Adds bidirectional scroll-percentage syncing between the textarea and the preview div.

- [ ] **Step 1: Add scroll-sync to `Editor.svelte`**

Replace the contents of `src/lib/components/Editor.svelte`:
```svelte
<script lang="ts">
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $derived(renderMarkdown(content));

  let textarea: HTMLTextAreaElement;
  let preview: HTMLDivElement;
  let syncing = false;

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
</script>

<div class="grid h-full grid-cols-2 gap-0 overflow-hidden">
  <textarea
    bind:this={textarea}
    class="h-full w-full resize-none border-r border-gray-200 p-4 font-mono text-sm
      outline-none"
    value={content}
    oninput={(e) => onInput(e.currentTarget.value)}
    onscroll={() => sync(textarea, preview)}
    spellcheck="false"
  ></textarea>
  <div
    bind:this={preview}
    class="prose prose-sm h-full max-w-none overflow-y-auto p-4"
    onscroll={() => sync(preview, textarea)}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
</div>
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: `0 errors`. (Manual: open a long spec; scrolling either pane moves the other proportionally without jitter.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/Editor.svelte
git commit -m "feat: sync scrolling between editor and preview"
```

---

### Task 8: Debounced autosave with status indicator

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `PUT /api/spec`.
- Produces: in `+page.svelte`, editing schedules a debounced (~1s) `PUT`; tracks `knownMtime` (updated from the PUT response so the app's own writes never look "external"); shows a `saving…` / `saved` indicator.

- [ ] **Step 1: Add autosave to `+page.svelte`**

Update `src/routes/+page.svelte` to the following:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import type { ProjectGroup } from '$lib/types';

  let groups = $state<ProjectGroup[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');
  let knownMtime = $state(0);
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function loadGroups() {
    const res = await fetch('/api/specs');
    groups = await res.json();
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
    saveStatus = 'saving';
    const res = await fetch(`/api/spec?path=${encodeURIComponent(selectedPath)}`, {
      method: 'PUT',
      body: content
    });
    const data = await res.json();
    knownMtime = data.mtime;
    saveStatus = 'saved';
  }

  function handleInput(value: string) {
    content = value;
    saveStatus = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }

  onMount(loadGroups);
</script>

<div class="grid h-screen grid-cols-[20rem_1fr]">
  <Sidebar {groups} {selectedPath} onSelect={selectSpec} />
  <main class="flex flex-col overflow-hidden">
    {#if selectedPath}
      <header class="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs">
        <span class="truncate text-gray-500" title={selectedPath}>{selectedPath}</span>
        <span class="ml-2 shrink-0 text-gray-400">
          {#if saveStatus === 'saving'}saving…{:else if saveStatus === 'saved'}saved{/if}
        </span>
      </header>
      <div class="min-h-0 flex-1">
        <Editor {content} onInput={handleInput} />
      </div>
    {:else}
      <p class="p-6 text-gray-400">Select a spec.</p>
    {/if}
  </main>
</div>
```

- [ ] **Step 2: Verify autosave writes to disk**

Run:
```bash
npm run dev &
sleep 4
SP=$(curl -s http://127.0.0.1:4510/api/specs | node -e 'const g=JSON.parse(require("fs").readFileSync(0));process.stdout.write(g[0].specs[0].path)')
ORIG=$(curl -s "http://127.0.0.1:4510/api/spec?path=$SP" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).content)')
curl -s -X PUT "http://127.0.0.1:4510/api/spec?path=$SP" --data-binary "$ORIG"$'\n<!-- autosave probe -->' >/dev/null
grep -c 'autosave probe' "$SP"
# restore original content
curl -s -X PUT "http://127.0.0.1:4510/api/spec?path=$SP" --data-binary "$ORIG" >/dev/null
kill %1
```
Expected: prints `1` (the probe was written). (Manual: type in the editor, watch `saving…` → `saved`, confirm the file changes on disk.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: debounced autosave with save status"
```

---

### Task 9: External-change polling with reload toast

**Files:**
- Create: `src/lib/components/Toast.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `GET /api/spec` (for `mtime`).
- Produces:
  - `Toast.svelte` props: `{ message: string | null }` — renders a small dismissible-by-timeout banner when `message` is non-null.
  - `+page.svelte` polls every 3s while a spec is selected; if the on-disk `mtime` exceeds `knownMtime`, reloads content from disk, updates `knownMtime`, and shows the toast `Reloaded — file changed on disk`.

- [ ] **Step 1: Write `Toast.svelte`**

`src/lib/components/Toast.svelte`:
```svelte
<script lang="ts">
  let { message }: { message: string | null } = $props();
</script>

{#if message}
  <div
    class="pointer-events-none fixed bottom-4 right-4 rounded bg-gray-900 px-3 py-2 text-sm
      text-white shadow-lg"
    role="status"
  >
    {message}
  </div>
{/if}
```

- [ ] **Step 2: Add polling + toast to `+page.svelte`**

In `src/routes/+page.svelte`:

Add to imports:
```svelte
  import Toast from '$lib/components/Toast.svelte';
```

Add state (next to the other `$state` declarations):
```ts
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
```

Add these functions (above `onMount`):
```ts
  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  async function pollExternalChange() {
    if (!selectedPath || saveStatus === 'saving') return;
    const res = await fetch(`/api/spec?path=${encodeURIComponent(selectedPath)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      saveStatus = 'idle';
      showToast('Reloaded — file changed on disk');
    }
  }
```

Replace the `onMount(loadGroups);` line with:
```ts
  onMount(() => {
    loadGroups();
    const id = setInterval(pollExternalChange, 3000);
    return () => clearInterval(id);
  });
```

Add `<Toast {message} />` — change the closing of the template to:
```svelte
</div>
<Toast message={toast} />
```

- [ ] **Step 3: Verify reload-on-external-change**

Run:
```bash
npm run check
```
Expected: `0 errors`. (Manual: open a spec in the app; in a terminal append a line to that file on disk; within ~3s the editor reloads and a "Reloaded — file changed on disk" toast appears.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Toast.svelte src/routes/+page.svelte
git commit -m "feat: reload-on-external-change with toast"
```

---

### Task 10: Deep-link open + README

**Files:**
- Modify: `src/routes/+page.svelte`
- Create: `README.md`

**Interfaces:**
- Consumes: the `?path=` query param (set by `GET /open`).
- Produces: on load, if `?path=` is present and valid, the app selects and loads that spec automatically. README documents running the server and the agent link format.

- [ ] **Step 1: Auto-select the spec from `?path=` on load**

In `src/routes/+page.svelte`, change the `onMount` callback to read the query param after loading groups:
```ts
  onMount(() => {
    loadGroups();
    const params = new URLSearchParams(window.location.search);
    const path = params.get('path');
    if (path) selectSpec(path);
    const id = setInterval(pollExternalChange, 3000);
    return () => clearInterval(id);
  });
```

- [ ] **Step 2: Write `README.md`**

`README.md`:
```markdown
# spec_reader

A local web app for reading and lightly editing superpowers spec files across
`~/Projects/`. Lists each project's `docs/superpowers/specs/*.md`, plus specs that
exist only in a worktree, rendered as formatted HTML in a split-pane editor with
autosave.

## Running

Development:

```bash
npm install
npm run dev
```

Persistent (built) server on `127.0.0.1:4510`:

```bash
npm run build
npm start
```

The app must be running before you use a deep-link.

## Agent deep-links

To point someone straight at a spec, link to:

```
http://localhost:4510/open?path=<absolute-path-to-spec.md>
```

The app opens with that spec selected. Example phrasing for an agent:
"I've written the spec at http://localhost:4510/open?path=/Users/you/Projects/foo/docs/superpowers/specs/2026-06-22-foo-design.md".

## Tests

```bash
npm test
```
```

- [ ] **Step 3: Verify the full suite and a deep-link end-to-end**

Run:
```bash
npm test
npm run build
npm start &
sleep 4
SP=$(curl -s http://127.0.0.1:4510/api/specs | node -e 'const g=JSON.parse(require("fs").readFileSync(0));process.stdout.write(g[0].specs[0].path)')
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://127.0.0.1:4510/open?path=$SP"
kill %1
```
Expected: `npm test` passes (paths + discovery suites); build succeeds; the open URL prints `302 /?path=...`. (Manual: visit the printed `/open?path=...` URL in a browser and confirm the spec opens selected.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte README.md
git commit -m "feat: deep-link open from query param and add README"
```

---

## Verification (end-to-end)

1. `npm install && npm test` — discovery and path-validation suites pass.
2. `npm run build && npm start` — server live on `127.0.0.1:4510`.
3. Open `http://127.0.0.1:4510/` — sidebar lists projects with specs newest-first; worktree-only specs carry a worktree badge; no inherited duplicates.
4. Select a spec — raw markdown left, formatted HTML right; scrolling either pane moves the other.
5. Edit text — `saving…` → `saved`; confirm the file on disk changed.
6. Append a line to the open file from another terminal — within ~3s the editor reloads and shows the "Reloaded — file changed on disk" toast.
7. Visit `http://127.0.0.1:4510/open?path=<abs-spec-path>` — the app opens with that spec selected.

## Notes / Out of Scope (v1)

- No launchd auto-start (assume the server is already running).
- No spec creation/deletion from the app.
- No authentication (localhost, single user).
- Full WYSIWYG/milkdown editing intentionally deferred — split-pane raw markdown is sufficient.
