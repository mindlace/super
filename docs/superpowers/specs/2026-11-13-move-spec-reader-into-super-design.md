# Move spec_reader into super as `superspec/`

## Intent

Specs are moving to semantic HTML (see
`2026-11-13-semantic-html-specs-design.md`, which arrives with this move).
Step 1 of that design's sequence of work is to bring the reader into `super`,
so the reader and the plugins that will feed it share one repo. A plugin will
eventually invoke it; for now it keeps exactly its current functionality.

## Goals

- The app lives at `super/superspec/` with its full git history, so
  `git log --follow` on any moved file reaches back into spec_reader's past.
- `npm install`, `npm test`, `npm run check`, `npm run build` and `npm start`
  work from `superspec/` as they did from the old root, and the server still
  serves on `127.0.0.1:4510`.
- The reader's own specs and plans stay visible in the reader.
- `mindlace/spec_reader` on GitHub is archived once the move has merged.

## Non-goals

- Any change to the reader's behaviour, including the semantic-HTML work.
- Making it a plugin or listing it in `marketplace.json`.
- Wiring `npm test` into `super`'s `tests/run.sh`.

## Approaches

- **Rewrite history into the subdirectory, then merge (chosen).** Clone
  spec_reader, run `git filter-repo --to-subdirectory-filter superspec`, and
  merge it into `super` with `--allow-unrelated-histories`. Every past commit
  shows the new paths, so `git log` and blame work with no extra flags.
- **`git subtree add`.** This keeps the history too, but old commits keep
  their old paths, so a path-limited `git log` stops at the move.
- **Copy the files in.** This is the simplest option, but it loses 125
  commits of history.

## The how

1. Clone spec_reader fresh into the scratchpad, then rewrite it with
   `filter-repo`. The real repo is never rewritten.
   - `docs/superpowers/**` is mapped to the repo-root `docs/superpowers/**`,
     not to `superspec/docs/`. The reader finds specs only at
     `<project>/docs/superpowers/` (or the same path in a worktree), so docs
     left under `superspec/` would disappear from it. No filenames clash with
     `super`'s existing docs.
   - Everything else is mapped to `superspec/**`.
2. Merge that history into this worktree branch.
3. Merge spec_reader's `.gitignore` into a `superspec/.gitignore`, keeping only
   the entries that apply there (`node_modules`, `/build`, `/.svelte-kit`,
   `/package`, `.env`, `.DS_Store`). `super`'s root `.gitignore` already
   covers `.superpowers/` and `.claude/worktrees/`.
4. Update paths in the semantic-HTML spec and plan. Code paths (`src/…`,
   `static/…`, `package.json`) get a `superspec/` prefix, while doc paths
   (`docs/superpowers/…`) are already correct at the root. Also update the
   spec's "Not yet decided" bullet about where the reader lands.
5. Update `superspec/README.md` and `superspec/CLAUDE.md` to say commands run
   from `superspec/`. Add a short row or section to `super/README.md` saying
   that `superspec/` is a local app and not a plugin.
6. Verify from `superspec/`: `npm install`, `npm test`, `npm run check` and
   `npm run build` all pass. Then start the server and confirm it lists this
   worktree's spec.
7. After merge: archive `mindlace/spec_reader` with
   `gh repo archive mindlace/spec_reader`, after a final check that nothing
   is unpushed. The local `~/Projects/spec_reader` checkout is left for Ethan
   to remove.

## Left to the builder

- The exact `filter-repo` invocation (`--path-rename` pairs or a filename
  callback).
- The wording of the README and CLAUDE.md edits.
