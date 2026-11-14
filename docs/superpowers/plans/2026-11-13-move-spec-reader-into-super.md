# Move spec_reader into super Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** spec_reader lives at `super/superspec/` with its full history, its docs at `super/docs/superpowers/`, and works exactly as before.

**Architecture:** Clone the *local* spec_reader repo into the scratchpad. Rewrite that clone's history with `git filter-repo` so `docs/superpowers/**` stays at the root and everything else moves under `superspec/`. Then merge it into this worktree branch with `--allow-unrelated-histories`. After that come path and doc fixes and a full verification run.

**Tech Stack:** git, git-filter-repo (`/opt/homebrew/bin/git-filter-repo`), npm/Node 22+, SvelteKit (unchanged).

**Spec:** `docs/superpowers/specs/2026-11-13-move-spec-reader-into-super-design.md`

## Global Constraints

- Source of history is the local repo `/Users/mindlace/Projects/spec_reader` (its `main` is ahead of GitHub), never a GitHub clone. The source repo is never rewritten or modified; only a scratch clone is.
- `docs/superpowers/**` maps to `docs/superpowers/**` at the super root. Every other tracked path maps to `superspec/<path>`.
- No change to app behaviour or source under `superspec/src/`.
- `superspec/` is not added to `.claude-plugin/marketplace.json` and not wired into `tests/run.sh`.
- Commands are never written as `cd X && cmd`; run `cd` as its own command.
- Conventional Commits. No Claude attribution, no `Co-Authored-By` trailers.
- Work only in `/Users/mindlace/Projects/super/.claude/worktrees/move-superspec` (branch `worktree-move-superspec`).

## Review Focus

1. **Commits made to spec_reader after the clone** (Ethan is still editing it): the merge would silently miss them. Expected: Task 1 records the imported `main` SHA, and Task 2's final step compares it to the source's current `main`. If they differ, re-import before finishing. Test: Task 2 Step 6.
2. **Unmerged work on `worktree-semantic-html-specs`**: if that branch has commits that are not on `main`, importing only `main` loses them. Test: Task 1 Step 1.
3. **A path in the semantic-HTML plan or spec that was missed**: a later implementer would edit a file that doesn't exist. Test: Task 2 Step 2 grep.
4. **Path-limited history**: `git log --follow superspec/src/lib/pairing.ts` must reach the June 2026 commits. Test: Task 1 Step 5.
5. **Reader can't see its own docs after the move**: Test: Task 2 Step 5 (server lists this worktree's spec).

---

## File Structure

| Path | Change |
|---|---|
| `superspec/**` (new) | All spec_reader files except `docs/`, with history |
| `docs/superpowers/specs/*`, `plans/*` | spec_reader's 26 docs + `specs/assets/…`, with history |
| `superspec/.gitignore` | From spec_reader, minus `.claude/worktrees/` and `.superpowers/` (root covers them) |
| `superspec/README.md`, `superspec/CLAUDE.md` | Say commands run from `superspec/` |
| `docs/superpowers/specs/2026-11-13-semantic-html-specs-design.md`, `docs/superpowers/plans/2026-11-13-semantic-html-specs.md` | `superspec/` prefix on code paths; settle "Not yet decided" bullet 1 |
| `README.md` (super root) | Short section on `superspec/` |

---

### Task 1: Import history

**Files:** everything under `superspec/` and the imported docs (via merge); `superspec/.gitignore`.

**Interfaces:**
- Produces: `superspec/` tree and the imported source SHA recorded in the merge commit message (`Imported from spec_reader main <sha>`), which Task 2 Step 6 reads.

- [ ] **Step 1: Check the source has no stranded work**

Run: `git -C /Users/mindlace/Projects/spec_reader for-each-ref --format='%(refname:short)' refs/heads`, then for each branch other than `main`, run `git -C /Users/mindlace/Projects/spec_reader log --oneline main..<branch>`.
Expected: no output for every branch. If any branch has commits that aren't on `main`, stop and report it as BLOCKED.

- [ ] **Step 2: Clone and record the SHA**

```sh
git clone --no-local /Users/mindlace/Projects/spec_reader <scratchpad>/spec_reader-import
git -C <scratchpad>/spec_reader-import rev-parse main
```

Record that SHA.

- [ ] **Step 3: Rewrite paths in the clone**

`cd <scratchpad>/spec_reader-import` (a separate command), then:

```sh
git filter-repo --force --filename-callback '
if filename.startswith(b"docs/superpowers/"):
    return filename
return b"superspec/" + filename
'
```

Run: `git ls-files | grep -v '^superspec/' | grep -v '^docs/superpowers/'`
Expected: no output.

- [ ] **Step 4: Merge into the worktree branch**

`cd` back to the worktree, then:

```sh
git fetch <scratchpad>/spec_reader-import main
git merge --allow-unrelated-histories --no-ff FETCH_HEAD -m "chore: import spec_reader into superspec/" -m "Imported from spec_reader main <sha>"
```

Expected: a clean merge. No paths clash, since super has no `superspec/` and none of the doc filenames overlap.

- [ ] **Step 5: Verify history**

Run: `git log --follow --oneline superspec/src/lib/pairing.ts | tail -1`. Expected: a commit dated June 2026.
Run: `git log --oneline -- docs/superpowers/specs/2026-06-22-spec-reader-design.md | wc -l`. Expected: ≥1.

- [ ] **Step 6: Trim `superspec/.gitignore`**

Remove the `.claude/worktrees/` and `.superpowers/` lines and the "Visual brainstorming companion" comment. Keep `node_modules`, `/build`, `/.svelte-kit`, `/package`, `.env` and `.DS_Store`.

- [ ] **Step 7: Build and test from `superspec/`**

`cd superspec` (a separate command), then run `npm install`, `npm test`, `npm run check` and `npm run build`.
Expected: all exit 0, with the same test count as `npm test` in the source repo. Run that once in `/Users/mindlace/Projects/spec_reader` to compare, since the source already has `node_modules`. `git status` must show no tracked `node_modules`, `build` or `.svelte-kit` under `superspec/`.

- [ ] **Step 8: Commit**

```sh
git add superspec/.gitignore
git commit -m "chore(superspec): trim gitignore to entries root does not cover"
```

### Task 2: Paths, docs, verification

**Files:**
- Modify: `docs/superpowers/specs/2026-11-13-semantic-html-specs-design.md`
- Modify: `docs/superpowers/plans/2026-11-13-semantic-html-specs.md`
- Modify: `superspec/README.md`, `superspec/CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: Task 1's merged tree and the recorded source SHA.

- [ ] **Step 1: Prefix code paths in the semantic-HTML spec and plan**

Prefix every repo-relative code or config path with `superspec/`. That covers `src/…`, `static/…`, `package.json`, `vitest.config.ts`, `app.css` references given as `src/app.css`, and the `file:line` mentions like `paths.ts:18`, where the spec already names them unprefixed in prose and they can stay as bare filenames. Leave `docs/superpowers/…` paths unchanged. In the plan, any command that runs `npx vitest`/`npm` gets a preceding "`cd superspec` (separate command)" note in Global Constraints rather than per step.

- [ ] **Step 2: Verify no stale paths**

Run: `grep -nE '(^|[ `(])(src|static)/' docs/superpowers/specs/2026-11-13-semantic-html-specs-design.md docs/superpowers/plans/2026-11-13-semantic-html-specs.md | grep -v 'superspec/'`
Expected: no output.

- [ ] **Step 3: Settle the decided points in the semantic-HTML spec**

In "Sequence of work" step 1, record that the move is done and the reader lives at `superspec/` as a standalone app, with docs at the repo root `docs/superpowers/`. Delete the first bullet under "Not yet decided", or replace it with that fact. Remove the bullet about carrying the unmerged branch across, since its content is now on main.

- [ ] **Step 4: Update READMEs and CLAUDE.md**

- `superspec/README.md` and `superspec/CLAUDE.md`: say that commands run from `superspec/`, and that the app's own specs and plans live in `../docs/superpowers/`. Replace "`spec_reader`" as the app's name with "superspec". Leave the description of behaviour as it is.
- Root `README.md`: add a short section after the plugin table, roughly: "`superspec/` is a local SvelteKit app for reading superpowers specs and plans across `~/Projects`. It is not a plugin yet. See `superspec/README.md`."

- [ ] **Step 5: Run the server and see this worktree's spec**

`cd superspec` (a separate command), then start the built server in the background with `PORT=4511 HOST=127.0.0.1 node build`. Use 4511 so it doesn't collide with a running 4510 instance.
Run: `curl -s http://127.0.0.1:4511/api/specs | grep -c move-spec-reader-into-super`
Expected: ≥1. Stop the server afterwards.

- [ ] **Step 6: Check the import is still current**

Run: `git -C /Users/mindlace/Projects/spec_reader rev-parse main` and compare it with the SHA in the import merge commit message.
Expected: they're equal. If they differ, report DONE_WITH_CONCERNS and give both SHAs. The controller decides whether to re-import.

- [ ] **Step 7: Commit**

```sh
git add -A docs/superpowers superspec/README.md superspec/CLAUDE.md README.md
git commit -m "docs: point semantic-HTML spec and plan at superspec/ paths"
```

### After merge (controller, not a subagent)

- [ ] Push `/Users/mindlace/Projects/spec_reader` `main` to `origin`, so the archived repo matches what was imported.
- [ ] `gh repo archive mindlace/spec_reader --yes`
