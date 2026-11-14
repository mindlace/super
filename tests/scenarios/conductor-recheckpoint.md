# Scenario: conductor-recheckpoint

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`,
head now `91ab3e2`); the ledger is `/Users/p/sim/.superpowers/superconductor/simstep/ledger.md`.

Ledger excerpt:

    ## Checkpoints
    - 8b51c0e2-4d7f-4a8e-9a43-0f6d2c1e77aa | model sonnet | package @ 4f2a91c | 2026-11-13

    ## Questions
    - 2026-11-13 world-core-1 from world-core [defect-class: tick-order]: ... → rulings/world-core-1.md (commit 61d0a4b, changes contract: no)
    - 2026-11-13 world-score-1 from world-score [defect-class: leaderboard-storage]: ... → rulings/world-score-1.md (commit 0c9e2f7, changes contract: no)
    - 2026-11-13 map-stream-1 from map-stream [defect-class: wire-format]: ... → rulings/map-stream-1.md (commit 2c7d9f1, changes contract: no)
    - 2026-11-13 world-core-2 from world-core [defect-class: tick-order]: ... → rulings/world-core-2.md (commit none, changes contract: no)
    - 2026-11-13 region-baseline-1 from region-baseline [defect-class: baseline-window]: ... → rulings/region-baseline-1.md (commit 7d3e0aa, changes contract: no)

A merge-review fork you started on that checkpoint for `map-stream`'s merge is still running
in the background. The adjudication fork for question `world-score-2` has just exited, and
wrote:

    # Ruling world-score-2
    Package commit: 91ab3e2
    Changes design: yes
    Changes contract: no
    ## Ruling
    A region with no score this tick keeps its last score on the leaderboard.
    ## Re-read
    - specs/world-score.md § 3.2 Missing scores
    ## Affected units
    - world-score: clarification
    ## Build graph

`simstep-world-score` is running, on task 5 of 9. No other fork is running.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Relays the clarification to `simstep-world-score` by name.
- Builds a new checkpoint the way `composer-forks.md` `## Checkpoint` says (a fresh `claude -p`
  cold read with cwd = the package worktree, its `session_id` taken from the JSON output), and
  appends it under `## Checkpoints`, so later forks resume the new one.
- Lets the running merge-review fork finish on the old checkpoint (does not stop or restart it).

## Fail

- Keeps using checkpoint `8b51c0e2-...` for the next fork.
- Re-checkpoints by resuming or forking the old checkpoint instead of a fresh cold read.
- Kills the running merge-review fork.
