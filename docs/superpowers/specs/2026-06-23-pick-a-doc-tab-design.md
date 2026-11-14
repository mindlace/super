# Pick-a-doc tab

## Problem

The tab strip only shows worktree specs/plans whose `recency` falls inside the
last 24 hours. There is no way to open an older doc, a doc that lives in a main
checkout, or any doc you happen to know the name of. When there are no recent
specs at all, the strip is empty and the app is a dead end.

We want a manual escape hatch: a tab — always sorted to the far right — that
lets you type a doc name (or path) and open it, regardless of the discovery
rules. When nothing recent exists, this picker is the only tab visible.

## Behavior

- A **"choose a doc"** tab is always present and always rightmost. It renders a
  text input below the label.
- You type a value and press **Enter** to submit. Accepted forms:
  - a bare doc name, with or without `.md` (`my-feature-design`, `my-feature-design.md`)
  - a relative path fragment (`docs/superpowers/specs/x.md`, `proj/docs/.../x.md`)
  - a fully-qualified absolute path
- **On success:** the picker tab loads the requested doc. If the doc is a spec,
  its plans load with it (nested as plan links, exactly like a normal spec tab).
  A fresh empty "choose a doc" tab then appears to the right of it.
- **On failure** (no match / outside the glob): the input **clears** and the
  input area does a short left-to-right **shake**. Nothing else changes.
- When there are **no specs in the last 24 hours**, the picker is the only
  visible tab.

### Resolution rules (decided)

- **Scope:** any `.md` under the glob — every project's
  `docs/superpowers/{specs,plans}`, in both main checkouts *and* worktrees,
  with no 24-hour filter. A true escape hatch (broader than the sidebar's
  worktree-only rule).
- **Relative input:** resolved by **suffix match** — a candidate file matches if
  its on-disk path ends with the given fragment (on a path-separator boundary).
  This handles bare names (`/<name>.md`) and partial paths alike.
- **Ambiguity:** when the input matches more than one file, **open the newest**
  by `recency = max(mtime, filename-date)` — the same ordering the app already
  uses everywhere.
- Resolution can only ever return a path it discovered by walking the real
  `~/Projects/**/docs/superpowers/**.md` tree (safe by construction), and every
  read still funnels through `assertSpecPath` at the `/api/spec` layer.

### Opened-tab management (decided)

- Each successful pick adds a tab. Opened-doc tabs **persist across reloads**:
  their paths are stored in `localStorage` and re-resolved on mount.
- Because they persist, opened-doc tabs are **closeable** — each carries a small
  `×` affordance that removes it from the strip and from the persisted list.
  (Normal discovery-driven tabs are not closeable; they are governed by
  discovery and the 24h window.)
- **Dedupe:** picking a doc that is already shown (as a normal tab or an
  already-opened tab) just **selects** the existing tab — no duplicate.
- **Tab sizing:** tabs are no longer fixed-width. Each sizes to its title
  content and only shrinks when the total row width exceeds the viewport
  (there are ~4 tabs at most). Replaces the current `min-w-[12rem] max-w-[15rem]`
  + horizontal-scroll behavior.

## Architecture

The app stays a thin client over server endpoints that walk the filesystem. Two
new pieces: a resolver module + endpoint on the server, and opened-doc state +
a picker/close UI on the client.

### Server: `src/lib/server/resolve.ts` + `src/routes/api/resolve/+server.ts`

`resolveDoc(query: string, root = PROJECTS_ROOT): Promise<DisplayGroup | null>`

1. **Walk.** Walk every superpowers dir under `root` — main checkout *and*
   `.claude/worktrees/*` — collecting `specs/` and `plans/` `.md` files as
   candidates. (Reuses the same `listDirs` / `listMarkdown` walking style as
   `discovery.ts`; the shared helpers are factored out so both modules use them.)
2. **Match.** With `q = query` normalized to end in `.md`, a candidate matches
   when:
   - its path `=== resolve(q)` (handles a fully-qualified absolute path), **or**
   - its path ends with `sep + q` (suffix match; covers bare name and fragment,
     and naturally handles a dropped date prefix since the date is a prefix).

   There is no separate absolute-path branch and no `assertSpecPath` call: the
   resolver only ever returns paths it found by walking the real glob tree, so
   it is safe by construction. An absolute path outside the glob simply matches
   nothing → `null`.
3. **Pick winner** = highest `recency` among matches; `null` if none.
4. **Build the group.** From the winner's superpowers root, build `SpecEntry`s
   for the matched file and (if it is a spec) the sibling `plans/` files, then
   run them through the existing `pairAndGroup` and return the group whose
   `parent.path` is the matched file. If the matched file is a **plan**, return
   it as a standalone group (`parent` = the plan, `children: []`) — we open
   exactly the doc requested.

`GET /api/resolve?q=<input>` → `200` with the `DisplayGroup` on success;
`404` when `resolveDoc` returns `null`; `400` when `q` is missing. The client
treats any non-`200` identically (shake).

Reads still go through the existing guarded `GET /api/spec`; `/api/resolve` only
locates the file and assembles its group.

### Client: `src/routes/+page.svelte`

- New state `openedGroups = $state<DisplayGroup[]>([])` and a persisted
  `localStorage` key `sr:openedPaths` (array of parent paths).
- `tabGroups = $derived(...)` merges `visibleGroups` with `openedGroups`,
  deduped by `parent.path` (an opened group that already appears in
  `visibleGroups` is dropped from the opened side).
- `pickDoc(query)`: `GET /api/resolve`. On success, if the resolved path is
  already a tab → just `selectSpec(it)`; else push the group into
  `openedGroups`, persist, and `selectSpec(it)`. Returns ok/fail so the picker
  can shake on fail.
- `closeOpened(path)`: remove from `openedGroups` + persisted list; if it was
  selected, clear the selection (fall back to empty editor / "select a spec").
- On mount: read `sr:openedPaths`, re-resolve each via `/api/resolve`
  (dropping any that no longer resolve), populate `openedGroups`.

### Client: `src/lib/tabs.ts` + `src/lib/components/TabStrip.svelte`

- `Tab` gains `closeable: boolean`. `buildTabs(groups, selectedPath, openedPaths)`
  sets `closeable` when `parent.path ∈ openedPaths`.
- `TabStrip` props gain `onPick`, `onClose`. It renders the doc tabs from
  `buildTabs`, an `×` button on closeable tabs, and then **always** appends a
  synthetic **picker tab** (rightmost) containing the label + `<input>`.
- The picker input: `Enter` calls `onPick(value)`; on a `false`/rejected result
  it clears the input and triggers the shake; on success the input clears
  naturally (the value became a tab and a fresh picker renders).
- **Restyle:** drop `min-w-[12rem] max-w-[15rem]` and `overflow-x-auto`; the
  `nav` is a flex row whose tabs size to content and may shrink (`min-w-0`)
  when the row overflows the viewport.
- **Shake:** a `@keyframes shake` in the component `<style>`, applied to the
  input wrapper while a short-lived `shaking` flag is true (cleared on a timer).

## Error handling

- Empty/whitespace input on Enter: no-op (no shake, no request).
- Any `/api/resolve` non-200: clear input + shake; strip is otherwise unchanged.
- Absolute path outside the glob: `assertSpecPath` → `400` → shake.
- A persisted opened path that no longer resolves on mount is silently dropped.
- Resolution never bypasses `assertSpecPath`; `/api/spec` keeps its own guard.

## Testing

Pure-unit, colocated, against a passed-in `root` / plain inputs (matching the
existing discovery/pairing/paths style):

- **`resolve.test.ts`** — fixture tree with the same name in two projects:
  bare name, name without `.md`, relative fragment (suffix), absolute path;
  ambiguity resolves to **newest**; no-match → `null`; absolute outside glob →
  rejected; a spec match attaches its sibling plans; a plan match returns a
  childless group.
- **`tabs.test.ts`** — `buildTabs` marks `closeable` only for paths in
  `openedPaths`; non-opened tabs stay non-closeable.
- Picker UI behavior (shake, clear, dedupe-select) is light and covered by the
  resolver + tabs unit tests plus manual verification; no component test harness
  is added for this.

## Out of scope

- Autocomplete / typeahead in the picker.
- Opening a plan with its parent spec auto-attached (a picked plan opens alone).
- Reordering or pinning tabs.
