# Supercomposer package-cutting scenarios: results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <skill>` (sonnet, no tools).
Context for RED: `git show 2aa35c3:plugins/supersonic/skills/supercomposer/SKILL.md` (the text
before this work). Context for GREEN: the edited `supercomposer/SKILL.md`.

The first versions of both scenarios named the one row each consumer needed and passed 3/3 at
baseline because they were leading. The versions below describe the subsystems in domain
terms and leave the edges to be found.

## RED

### composer-edges-name-rows: 2/3 pass

- Rep 1 PASS (barely). Splits `world-core` into seven units with the hook as `U3`, edges as
  a consumer → rows table, then "Waves: 1. U1 2. U2, U3, U4, U6 3. U5, U7".
- Rep 2 FAIL. The edge table has a `Needs` column reading `world-core` for all three
  consumers, and the doc gets "Dependency order: 1. world-core ... 2. world-funding,
  world-score and map-stream". Unit `WC-2` bundles readers with the funding hook, so
  `world-funding` waits for the readers and `map-stream` waits for the hook, neither of which
  it consumes.
- Rep 3 PASS. Row-named edges, hook as unit `WC-C`, waves derived from the edges.
- All three write a "Dependency order" section, as the HEAD text requires.

### composer-shared-work: 3/3 pass (shared step), but spec-level edges in all three

- All reps extract a `region-baseline` unit (`src/baseline/**`) that both consumers depend
  on.
- All three also write whole-subsystem edges and orders: rep 1 "Dependency order:
  `world-core` → `region-baseline` → {`world-score`, `map-stream`}", rep 2 "Needs: ...
  `world-core` state and events", rep 3 "Needs: `world-core` (state and the region readers,
  row S7)" and "`world-core` for tick sequencing".

The shared-unit rule is kept although this scenario passes at baseline: the approved spec
mandates it, and the motivating run duplicated a measurement step once specs ran together.
The row-edge and fine-cut rules have a failing RED rep here and are also spec-mandated.

## GREEN

Text: C3 "Every edge names interface rows, never a spec or a position in an order"; C4 build
graph bullets "Cut units as fine as the dependencies allow ..." and "Anything two units would
both need to build is its own unit or part of contracts ...".

### composer-shared-work: 3/3 pass

All reps add a measurement unit (`region-baseline` or `region-measures`) with its own write
set and a row (B1/B2 or M1) whose types and stub sit in `contracts`. `world-score` and
`map-stream` each need that row and run together. All edges name rows; none names `world-core`.
Rep 3 cites the rule: "anything two units would both need to build becomes its own unit or
part of contracts".

### composer-edges-name-rows, first GREEN run: 2/3 pass

- Rep 1 PASS. Every consumer needs only contract rows. `world-core-engine` still bundles
  state, tick, events, readers and the hook, "because splitting it out would need a contract
  row for the call point that the table doesn't have".
- Rep 2 FAIL. `core-loop` holds state, tick, events and the funding hook, so `score` and
  `map-stream` (needing S3) wait behind the hook. Same reason: "A separate unit would need a
  seam row between the loop and the hook that the approved table doesn't have."
- Rep 3 PASS. Ten units; `score` waits only for `core-bus`, `funding-rules` only for
  `core-funding-hook`.

Refactor: the fine-cut bullet gains "When a split needs a seam the interface table lacks (a
call point, an emit side), add that row as a decomposition choice and split." The
shared-work GREEN run above predates this sentence, which touches only the fine-cut bullet.

### composer-edges-name-rows, after the refactor: 3/3 pass

- Rep 1: `core-events` and `core-funding-hook` are separate units; it adds seam rows S15/S16;
  `world-funding` needs S12, `world-score` needs S3, `map-stream` needs S3 and S7.
  `Longest chain: contracts -> core-funding-hook -> core-state-tick`.
- Rep 2: separate `core-bus`, `core-funding-hook`, `core-tick`, `core-readers`, `core-persist`
  and `core-replay` units with seam rows S15-S19; consumers need only rows.
- Rep 3: the same split. Consumers need rows built against contract fakes.
  `Longest chain: contracts -> core-persist -> core-replay`.
- No rep writes "depends on", a wave or a whole-subsystem edge.

# Composer fork scenarios: results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <context>...` (sonnet, no tools).
Context for RED: `git show 8ba37b1:plugins/supersonic/skills/supercomposer/SKILL.md` (the text
before this work, with C0 "reappraisal ... plus a delta section"). Context for GREEN: the edited
`supercomposer/SKILL.md` plus `supercomposer/composer-forks.md`.

## RED

### composer-fork-current-state: 0/3 pass

- No rep names a first task that no longer holds. Rep 1: "Tasks 1-2: done and stay"; rep 2:
  "Task 2 ... the code is not wasted"; rep 3: "Task 2 (merged, reviewed): needs rework ...
  treat this as a new task on top of the merged work, not a revert".
- Spec text carries the old path in reps 2 and 3: "It does not walk all regions every tick",
  "well below the 61 ms the walk measures today", "consume the leaderboard exactly as
  before". Rep 1's spec text says "This full walk is the task 2 implementation".
- Ruling files are free-form: "supersedes the 'walks every region every tick' wording", "The
  old §2 said ...", sections "Effect on tasks", "What changes if this ruling is wrong".

### composer-fork-disk-wins: 3/3 pass (baseline)

All reps rule on `bigint` from `contracts/src/rows.ts`, citing the existing "ground truth
outranks documentation" hard rule. Rep 3 still proposes a "one-line delta note: S4 `int` ->
`bigint`" in the design doc. The disk-wins rule is kept although this scenario passes at
baseline: the approved spec requires the fork prompt to say it, and a fork's inherited context
is exactly the stale read the spec describes.

### composer-merge-review-quiet: 0/3 pass

Every rep writes a multi-section report: a verdict line, a "Checked" list or table, "Not
checked"/"Limits", a "Rulings" section and a proposed ledger entry.

## GREEN

Text: SKILL.md C0 (fork mode), C5 (package worktree, checkpoint, build-graph fork, fresh-eyes
check of the reported chain), `## Composer forks`, two red flags; `composer-forks.md` prompts.

### composer-merge-review-quiet: 3/3 pass

All three reps print exactly `No drift @ 4f9d21b`.

### composer-fork-disk-wins: 3/3 pass

All reps rule on `bigint` ("Disk wins here, so the ruling rests on the contract"); the ruling
files use the `# Ruling` form and mark `world-funding` as `clarification`. No delta note.

### composer-fork-current-state, first GREEN run: 3/3 pass

Spec §2 reads as current state in all three; every ruling has `## Affected units` with
`world-score: first task that no longer holds: task 2`. The reps disagree on
`Changes design` for a spec-only amendment (rep 1 `yes`, reps 2 and 3 `no`).

Refactor: the ruling form defines `Package commit`, `Changes design` (any design doc, spec or
contracts text) and `Changes contract` (an interface row or contracts code).

### composer-fork-current-state, after the flag definitions: 2/3 pass

All three mark `Changes design: yes` and name task 2. Rep 3's spec ends "The leaderboard's
shape and its consumers (the score API and persistence) are unchanged by this section", which
refers to the earlier text.

Refactor: step 4 of the adjudication prompt gains a positive check, "reread each amended
passage as someone who never saw the earlier text: every sentence must make sense to them and
say what the system does".

### composer-fork-current-state, after the reader check: 3/3 pass

No spec text refers to the walk-per-tick approach, to tasks or to "before"; every rep has
`Changes design: yes`, `Changes contract: no` and `first task that no longer holds: task 2`.

The merge-review and disk-wins GREEN runs predate both refactors. Both refactors touch only the
adjudication prompt's step 4 and ruling form; merge review does not use that prompt, and the
disk-wins reps already used the ruling form, so they were not rerun.
