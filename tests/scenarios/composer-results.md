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
