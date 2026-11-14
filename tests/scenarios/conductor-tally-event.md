# Scenario: conductor-tally-event

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`,
head now `91ab3e2`); the ledger is `/Users/p/sim/.superpowers/superconductor/simstep/ledger.md`.

Ledger excerpt:

    ## Checkpoints
    - 2d90a7f4-1c3b-4e55-8f0a-6b7e21c4d9e3 | model sonnet | package @ 4f2a91c | 2026-11-13

    ## Questions
    - 2026-11-13 world-core-1 from world-core [defect-class: tick-order]: ... → rulings/world-core-1.md (commit 1a2b3c4, changes contract: no)
    - 2026-11-13 world-core-2 from world-core [defect-class: tick-order]: ... → rulings/world-core-2.md (commit none, changes contract: no)
    - 2026-11-13 world-core-3 from world-core [defect-class: tick-order]: ... → rulings/world-core-3.md (commit 4f2a91c, changes contract: no)
    - 2026-11-13 map-stream-1 from map-stream [defect-class: wire-format]: ... → rulings/map-stream-1.md (commit 2c7d9f1, changes contract: no)
    - 2026-11-13 world-score-2 from world-score [defect-class: leaderboard-storage]: ...

    ## Frame-defect tally
    - tick-order: 3 — instances: world-core-1, world-core-2, world-core-3
    - wire-format: 1 — instances: map-stream-1
    - leaderboard-storage: 1 — instances: world-score-2

The checkpoint above was built when `world-core-3`'s ruling exited, and your partner got the
`Defect class tick-order has reached 3` line then. `git -C
/Users/p/sim/.claude/worktrees/simstep-package log --first-parent --oneline --grep='): rule '
4f2a91c..HEAD` lists two commits: `2c7d9f1` and `91ab3e2`.

The adjudication fork for question `world-score-2` has just exited, and wrote:

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

`simstep-world-score` is running, on task 5 of 9. No other fork is running and no question is
queued.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Relays the clarification to `simstep-world-score` by name, with the merge-first relay
  (the ruling has a package commit).
- Builds no new checkpoint: the ruling changes no contract, two rulings is under five, and
  this question did not bring any class to three. The next fork resumes `2d90a7f4-...`.
- Posts the partner no `Defect class ... has reached 3` line.

## Fail

- Builds a new checkpoint because the tick-order tally stands at three.
- Posts the tick-order line to the partner again.
