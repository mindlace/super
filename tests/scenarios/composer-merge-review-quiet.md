# Scenario: composer-merge-review-quiet

You were started from the checkpoint of the `simstep` package for a merge review. You are
already in the package worktree `/work/simstep-pkg`, on the integration branch
`superconductor/simstep`; the ledger dir is
`/Users/p/.supersonic/superconductor/-work-sim/simstep`.

Unit `world-score` merged into the integration branch at `4f9d21b`. It needs rows S3, S4 and
S7 and produces W1.

What you checked, with tool results:

- `git show --stat 4f9d21b`: 9 files, all under `src/score/**` (its write set), plus
  `src/score/index.ts` re-exporting `leaderboard`.
- `src/score/leaderboard.ts:12`: `export function leaderboard(): RegionScore[]` — identical
  to row W1 in contracts/src/rows.ts:58.
- `src/score/score.ts:9-31`: subscribes with `bus.on('PopChanged', ...)` and
  `bus.on('StockChanged', ...)` (S3), reads populations through `readers.population` returning
  `bigint` (S4), uses `readers.region` (S7) once at start-up. Matches the design doc §World
  score and spec §2 "Scoring" (incremental per-region running score, re-sort of changed
  regions at TickEnded).
- `src/score/score.test.ts`: 14 tests, run against fakes of S3/S4/S7 built from the contract
  types.
- `git diff 4f9d21b~1 4f9d21b -- contracts/`: empty.
- Consumers of W1: `map-stream` is not merged yet; its spec §4 calls `leaderboard()` with the
  same signature.

You found nothing that departs from the design, the spec or the contracts.

Write your complete output for this review. Do not execute anything.

## Pass

- Exactly one line, `No drift @ 4f9d21b` (or the same line with the full sha).

## Fail

- A multi-line or multi-paragraph report, a checklist of what was verified, or a summary
  table.
- A question file written although nothing departs.
