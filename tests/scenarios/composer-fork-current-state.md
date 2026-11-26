# Scenario: composer-fork-current-state

You were started from the checkpoint of the `simstep` package to rule on one question. You are
already in the package worktree `/work/simstep-pkg`; the ledger dir is
`/Users/p/.supersonic/superconductor/-work-sim/simstep`. Package HEAD is `7c1e0a2`.

The question file, `questions/world-score-1.md`:

    # Question world-score-1 — from simstep-world-score
    ## Question
    The spec has the score recomputed from scratch every tick by walking all regions. With
    4,000 regions and 20 ticks/s that is 80k region reads per second and the reviewer flagged
    task 3 as too slow. Can I switch to an incremental score: keep a running score per region
    and apply only the PopChanged/StockChanged events of the tick (row S3/S4)?
    ## What the package says
    docs/superpowers/specs/2026-11-10-world-score-design.md §2 "Scoring": "At TickEnded,
    world-score walks every region through the region readers (S7), computes
    score = pop * 0.6 + stock * 0.4 for each, and rebuilds the leaderboard from the results."
    ## What I found
    - src/score/score.ts:14 implements the walk (task 2, merged into my branch, reviewed).
    - src/score/score.test.ts:40 measures 61 ms per tick at 4,000 regions (verified-at).
    - The event payloads carry region id, old value and new value (contracts/src/events.ts:8).
    ## Options I see
    A. Incremental: apply the tick's events to a per-region running score, re-sort only the
       changed regions.
    B. Keep the walk, cache readers.
    ## Blocking
    Tasks 3 (leaderboard), 4 (score API), 5 (persistence of scores). Tasks 1-2 are done.

The spec section as it reads on disk now (`docs/superpowers/specs/2026-11-10-world-score-design.md`
§2):

    ## 2. Scoring

    At TickEnded, world-score walks every region through the region readers (S7), computes
    score = pop * 0.6 + stock * 0.4 for each, and rebuilds the leaderboard from the results.
    The leaderboard is the full region list sorted by score, highest first.

The operator has two tasks of code on the walk approach, and the partner reads `rulings/` to
see what was decided. You decide option A is right.

Write exactly what you write to disk: the new text of §2 of the spec, and the full ruling file
`rulings/world-score-1.md`. Do not execute anything.

## Pass

- The new §2 reads as if it had always said this: it states the incremental approach with no
  reference to the walk.
- The ruling names, for `world-score`, the first task that no longer holds (task 2, the walk,
  or task 3 if the fork keeps the walk as a seed path), so the branch can be cut back there.

## Fail

- "previously", "changed from", "instead of", "no longer walks", "replaces the walk", "as
  before", "today", a reference to the old approach ("does not walk all regions every tick"),
  or a delta/change-history section anywhere in the spec text.
- The ruling names no first task that no longer holds.
