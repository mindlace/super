# Worktree→main path fallback (main read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a worktree spec/plan has been merged to main and its worktree directory removed, resolve and serve the main copy instead of 404-ing, treating any file on main as read-only.

**Architecture:** A shared, FS-free `mainpath` helper classifies a path as worktree vs. main and computes the main equivalent of a worktree path. The `/api/spec` GET endpoint falls back to that main equivalent on ENOENT and reports the effective path; PUT refuses writes to main paths. `resolveDoc` re-resolves a vanished worktree query against its main equivalent. The client adopts the effective path (re-resolving the opened tab), derives read-only from `isMainPath`, and the editor honors it. The tab caption gains a `main` location label.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vitest, CodeMirror 6, `@sveltejs/adapter-node`.

## Global Constraints

- Local-only app on `127.0.0.1:4510`; absolute POSIX paths (darwin, `/` separator) — the shared helper uses plain string matching on `/.claude/worktrees/`, never `node:path`, so it imports into client code.
- 2-space indent, single quotes, 100 char width (ESLint + Prettier).
- Tests are colocated `*.test.ts`, pure-unit, FS tests use temp dirs with a passed-in `root` (never mock the FS globally).
- Spec/plan H1 titles carry no project-name prefix.
- All filesystem read/write paths still pass through `assertSpecPath()` — the fallback re-validates any computed main path before reading it.

---

### Task 1: Shared `mainpath` helper

**Files:**
- Create: `src/lib/mainpath.ts`
- Test: `src/lib/mainpath.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isWorktreePath(p: string): boolean` — true iff `p` contains a `/.claude/worktrees/` segment.
  - `isMainPath(p: string): boolean` — `!isWorktreePath(p)`.
  - `mainEquivalent(p: string): string | null` — `p` with the `/.claude/worktrees/<wt>/` segment removed, or `null` if `p` has no such segment.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mainpath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWorktreePath, isMainPath, mainEquivalent } from './mainpath';

const wt =
  '/Users/x/Projects/p/.claude/worktrees/wt1/docs/superpowers/specs/2026-06-22-y-design.md';
const main = '/Users/x/Projects/p/docs/superpowers/specs/2026-06-22-y-design.md';

describe('mainpath', () => {
  it('classifies a worktree path', () => {
    expect(isWorktreePath(wt)).toBe(true);
    expect(isMainPath(wt)).toBe(false);
  });

  it('classifies a main path', () => {
    expect(isWorktreePath(main)).toBe(false);
    expect(isMainPath(main)).toBe(true);
  });

  it('strips the worktree segment to the main equivalent', () => {
    expect(mainEquivalent(wt)).toBe(main);
  });

  it('returns null for a non-worktree path', () => {
    expect(mainEquivalent(main)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mainpath.test.ts`
Expected: FAIL — cannot find module `./mainpath`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/mainpath.ts`:

```ts
// Path-shape helpers shared by client (tab caption, read-only state) and server
// (fallback, write guard). Pure string ops on the absolute POSIX paths this
// local-only app deals in — deliberately no node:path / FS / PROJECTS_ROOT so
// this imports cleanly into browser code.

const WORKTREE_SEGMENT = '/.claude/worktrees/';

export function isWorktreePath(p: string): boolean {
  return p.includes(WORKTREE_SEGMENT);
}

export function isMainPath(p: string): boolean {
  return !isWorktreePath(p);
}

export function mainEquivalent(p: string): string | null {
  const stripped = p.replace(/\/\.claude\/worktrees\/[^/]+\//, '/');
  return stripped === p ? null : stripped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mainpath.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mainpath.ts src/lib/mainpath.test.ts
git commit -m "feat: shared mainpath helper (worktree vs main classification)"
```

---

### Task 2: Tab caption shows `main` for a branch-less main file

**Files:**
- Modify: `src/lib/caption.ts:9-14`
- Test: `src/lib/caption.test.ts` (modify one case, add one)

**Interfaces:**
- Consumes: `isMainPath` (Task 1).
- Produces: `captionFor` unchanged signature; emits `main` as the location label when the parent is a main path with no worktree and no worktree-bearing children.

- [ ] **Step 1: Update the failing tests**

In `src/lib/caption.test.ts`, replace the last test (`'drops an empty branch segment'`) with these two:

```ts
  it('labels a branch-less main spec as main', () => {
    const g = group(entry({ filename: 's-design.md', type: 'spec', project: 'proj', worktree: null }));
    expect(captionFor(g)).toBe('main · proj');
  });

  it('keeps a worktree child branch on a main spec rather than main', () => {
    const parent = entry({ filename: 's-design.md', type: 'spec', project: 'proj', worktree: null, onMain: true });
    const child = entry({ filename: 'p.md', type: 'plan', project: 'proj', worktree: 'wtX' });
    expect(captionFor(group(parent, [child]))).toBe('wtX · proj');
  });
```

Note: the `entry()` helper builds `path` as `'/p/' + project + '/' + filename` — a main-shaped path (no worktree segment), so `isMainPath` is true for these.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/caption.test.ts`
Expected: FAIL — `'labels a branch-less main spec as main'` gets `'proj'`, expected `'main · proj'`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/caption.ts`, add the import and update `captionFor`:

```ts
import type { DisplayGroup } from './pairing';
import { isMainPath } from './mainpath';

function childBranches(group: DisplayGroup): string {
  const seen = new Set<string>();
  for (const c of group.children) if (c.worktree) seen.add(c.worktree);
  return [...seen].join(' · ');
}

export function captionFor(group: DisplayGroup): string {
  const p = group.parent;
  const branch = p.worktree ?? (childBranches(group) || (isMainPath(p.path) ? 'main' : ''));
  const type = p.type === 'plan' || p.type === 'spec' ? '' : p.type;
  return [branch, p.project, type].filter(Boolean).join(' · ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/caption.test.ts`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/caption.ts src/lib/caption.test.ts
git commit -m "feat: caption labels a branch-less main file as 'main'"
```

---

### Task 3: `resolveDoc` falls back to the main equivalent

**Files:**
- Modify: `src/lib/server/resolve.ts:1-6,50-52`
- Test: `src/lib/server/resolve.test.ts` (add fixtures + two cases)

**Interfaces:**
- Consumes: `isWorktreePath`, `mainEquivalent` (Task 1).
- Produces: `resolveDoc(query, root)` unchanged signature; when `query` is a worktree absolute path with no on-disk match, it re-matches against `mainEquivalent(query)`.

- [ ] **Step 1: Write the failing test**

In `src/lib/server/resolve.test.ts`, add to the `beforeAll` fixture block (after the existing writes):

```ts
  // projE: a spec that landed on main; its worktree is gone.
  const eMainSpecs = join(root, 'projE/docs/superpowers/specs');
  await write(eMainSpecs, '2026-06-22-landed-design.md', '# Landed\n');
```

Then add inside `describe('resolveDoc', ...)`:

```ts
  it('falls back to the main copy when the worktree path is gone', async () => {
    const gone = join(
      root,
      'projE/.claude/worktrees/wtgone/docs/superpowers/specs/2026-06-22-landed-design.md'
    );
    const g = await resolveDoc(gone, root);
    expect(g?.parent.project).toBe('projE');
    expect(g?.parent.worktree).toBeNull();
    expect(g?.parent.filename).toBe('2026-06-22-landed-design.md');
  });

  it('returns null when neither the worktree path nor its main equivalent exists', async () => {
    const gone = join(
      root,
      'projE/.claude/worktrees/wtgone/docs/superpowers/specs/nope-design.md'
    );
    expect(await resolveDoc(gone, root)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/resolve.test.ts`
Expected: FAIL — `'falls back to the main copy...'` gets `null` (no candidate matches the worktree path).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/server/resolve.ts`, add the import:

```ts
import { isWorktreePath, mainEquivalent } from '../mainpath';
```

Then change the match block (currently lines 50-52):

```ts
  const candidates = await collectCandidates(root);
  let matches = candidates.filter((c) => c.path === abs || c.path.endsWith(sep + qMd));
  if (matches.length === 0 && isWorktreePath(abs)) {
    const mainEq = mainEquivalent(abs);
    if (mainEq) matches = candidates.filter((c) => c.path === mainEq);
  }
  if (matches.length === 0) return null;
```

(`matches` changes from `const` to `let`; everything below is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/resolve.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/resolve.ts src/lib/server/resolve.test.ts
git commit -m "feat: resolveDoc falls back to the main equivalent of a gone worktree path"
```

---

### Task 4: `/api/spec` GET fallback + PUT read-only guard

**Files:**
- Modify: `src/routes/api/spec/+server.ts` (whole file)

**Interfaces:**
- Consumes: `assertSpecPath` (`$lib/server/paths`), `isWorktreePath`, `isMainPath`, `mainEquivalent` (`$lib/mainpath`).
- Produces: `GET` responds `{ content, mtime, path }` where `path` is the effective path actually read (the main equivalent on fallback). `PUT` returns 403 for a main path, else `{ mtime }` as before.

This task is route wiring; its correctness rests on the helper unit tests from Tasks 1 and 3. Verify manually with the dev server (Step 4).

- [ ] **Step 1: Rewrite the endpoint**

Replace the entire contents of `src/routes/api/spec/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { assertSpecPath } from '$lib/server/paths';
import { isWorktreePath, isMainPath, mainEquivalent } from '$lib/mainpath';
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

async function readSpec(path: string): Promise<{ content: string; mtime: number } | null> {
  try {
    const content = await readFile(path, 'utf8');
    const { mtimeMs } = await stat(path);
    return { content, mtime: mtimeMs };
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const path = safePath(url);
  let effectivePath = path;
  let data = await readSpec(path);

  // The worktree copy is gone (merged to main). Fall back to the landed main
  // file, re-validating the computed path before reading it.
  if (!data && isWorktreePath(path)) {
    const mainEq = mainEquivalent(path);
    if (mainEq) {
      let validMain: string | null = null;
      try {
        validMain = assertSpecPath(mainEq);
      } catch {
        validMain = null;
      }
      if (validMain) {
        const mainData = await readSpec(validMain);
        if (mainData) {
          data = mainData;
          effectivePath = validMain;
        }
      }
    }
  }

  if (!data) throw error(404, 'spec not found');
  return json({ content: data.content, mtime: data.mtime, path: effectivePath });
};

export const PUT: RequestHandler = async ({ url, request }) => {
  const path = safePath(url);
  if (isMainPath(path)) throw error(403, 'main checkout is read-only');
  const content = await request.text();
  await writeFile(path, content, 'utf8');
  const { mtimeMs } = await stat(path);
  return json({ mtime: mtimeMs });
};
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 4: Manual verification**

Start the dev server: `npm run dev`. Then, with a real landed spec (a file that exists at `~/Projects/<p>/docs/superpowers/specs/<f>.md` but NOT in any worktree), in another shell:

```bash
# Fallback GET: request the (nonexistent) worktree path, expect 200 + main path echoed.
curl -s 'http://127.0.0.1:4510/api/spec?path=/Users/'"$USER"'/Projects/<p>/.claude/worktrees/gone/docs/superpowers/specs/<f>.md' | head -c 300
# PUT to a main path: expect HTTP 403.
curl -s -o /dev/null -w '%{http_code}\n' -X PUT 'http://127.0.0.1:4510/api/spec?path=/Users/'"$USER"'/Projects/<p>/docs/superpowers/specs/<f>.md' --data 'x'
```

Expected: the GET JSON `path` field is the main path (no `.claude/worktrees`); the PUT prints `403`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/spec/+server.ts
git commit -m "feat: /api/spec falls back to main and refuses writes to main"
```

---

### Task 5: Editor honors a `readOnly` prop

**Files:**
- Modify: `src/lib/components/Editor.svelte:3,12-18,115-140,144-152`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Editor` accepts a `readOnly: boolean` prop (default `false`); when true the CodeMirror view is non-editable and reconfigures live when the prop flips.

This is component wiring (no colocated component tests exist in this codebase); verify in Task 6's end-to-end manual check.

- [ ] **Step 1: Import `Compartment`**

In `src/lib/components/Editor.svelte`, change the `@codemirror/state` import (line 3):

```ts
  import { EditorState, Compartment } from '@codemirror/state';
```

- [ ] **Step 2: Add the prop**

Update the `$props()` block (lines 12-18):

```ts
  let {
    content,
    onInput,
    readOnly = false
  }: {
    content: string;
    onInput: (value: string) => void;
    readOnly?: boolean;
  } = $props();
```

- [ ] **Step 3: Add an editability compartment and wire it at mount**

Just below the `$props()` block, add:

```ts
  const editable = new Compartment();
```

In `onMount`, add the compartment to the extensions array (inside `EditorState.create({ ... extensions: [ ... ] })`), e.g. as the last extension before the closing `]`:

```ts
          editable.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])
```

- [ ] **Step 4: Reconfigure when `readOnly` changes**

After the existing external-content `$effect` (the one ending at line 152), add:

```ts
  // Switch between an editable worktree file and a read-only main file without
  // remounting the editor.
  $effect(() => {
    const ro = readOnly;
    if (!view) return;
    view.dispatch({
      effects: editable.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(!ro)])
    });
  });
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Editor.svelte
git commit -m "feat: Editor supports a readOnly prop"
```

---

### Task 6: Page adopts the effective path, derives read-only, and guards writes

**Files:**
- Modify: `src/routes/+page.svelte:7-8,11-21,62-76,109-137,202-210`

**Interfaces:**
- Consumes: `isMainPath` (Task 1); `Editor` `readOnly` prop (Task 5); `/api/spec` effective `path` (Task 4); `/api/resolve` (existing).
- Produces: end-to-end behavior — a stale worktree tab becomes switchable, adopts the main path, captions `main · <project>`, and is read-only.

This task is the integration; verify end-to-end manually (Step 5).

- [ ] **Step 1: Import `isMainPath` and add `readOnly` state**

Add to the imports near the top (after line 8):

```ts
  import { isMainPath } from '$lib/mainpath';
```

Add to the state block (after `saveStatus`, around line 17):

```ts
  let readOnly = $state(false);
```

- [ ] **Step 2: Adopt the effective path in `selectSpec` and add `adoptPath`**

Replace `selectSpec` (lines 62-76) with:

```ts
  async function adoptPath(oldPath: string, newPath: string) {
    const res = await fetch(`/api/resolve?q=${encodeURIComponent(newPath)}`);
    const group: DisplayGroup | null = res.ok ? await res.json() : null;
    if (!group) return;
    openedGroups = openedGroups.map((g) => (g.parent.path === oldPath ? group : g));
    if (lastSelectedGroup?.parent.path === oldPath) lastSelectedGroup = group;
    persistOpened();
  }

  async function selectSpec(path: string): Promise<boolean> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    if (!res.ok) return false;
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    const effective: string = data.path ?? path;
    // Worktree gone → server served the main copy; rewrite the opened tab so the
    // selection, caption, autosave, and persistence all target the real file.
    if (effective !== path) await adoptPath(path, effective);
    selectedPath = effective;
    readOnly = isMainPath(effective);
    saveStatus = 'idle';
    localStorage.setItem(SELECTED_KEY, effective);
    return true;
  }
```

- [ ] **Step 3: Guard writes on `readOnly`**

In `save()` (line 110), change the guard:

```ts
    if (!selectedPath || readOnly) return;
```

In `handleInput()` (after line 132's `function handleInput(value: string) {`), add as the first line:

```ts
    if (readOnly) return;
```

- [ ] **Step 4: Pass `readOnly` to the Editor**

In the template, update the `<Editor>` usage (line 222):

```svelte
        <Editor {content} {readOnly} onInput={handleInput} />
```

- [ ] **Step 5: Type-check, test, and verify end-to-end**

Run: `npm run check` — expected: no new errors.
Run: `npm test` — expected: PASS.

Manual end-to-end (`npm run dev`):
1. Open a worktree spec, then simulate the worktree landing: copy that spec to its project's `docs/superpowers/specs/` (the main equivalent) and delete the worktree's copy (or the whole worktree dir).
2. Click the now-stale tab. Expected: it switches (no 404), the header path updates to the main path, the tab caption reads `main · <project>`, and typing in the editor is blocked (read-only). The save indicator never shows `saving…`.
3. Reload the page. Expected: the tab is still present (re-resolved to main) and still read-only.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: adopt main path on fallback, derive read-only, guard writes"
```

---

## Self-Review

**Spec coverage:**
- Shared main/worktree helper → Task 1.
- `/api/spec` GET fallback + effective path → Task 4. PUT 403 on main → Task 4.
- `resolveDoc` fallback → Task 3.
- Tab `main` caption label → Task 2.
- Client adopt path + re-resolve opened tab + persist → Task 6.
- Read-only derived from `isMainPath`; write guards → Task 6. Editor read-only → Task 5.
- Header unchanged (shows adopted path) → no task needed (existing behavior).
- 404 when neither copy exists → Task 4 (`readSpec` returns null both times) + Task 3 test.
- Re-validate computed main path through `assertSpecPath` → Task 4.

**Type consistency:** `isWorktreePath` / `isMainPath` / `mainEquivalent` signatures defined in Task 1 are used identically in Tasks 2, 3, 4, 6. `/api/spec` GET response `{ content, mtime, path }` (Task 4) is consumed in Task 6 as `data.path`. `Editor` `readOnly?: boolean` (Task 5) matches the `{readOnly}` pass-through (Task 6).

**Placeholder scan:** none — every code step shows complete code; the only `<p>`/`<f>` placeholders are in manual `curl` verification, which is inherently environment-specific.
