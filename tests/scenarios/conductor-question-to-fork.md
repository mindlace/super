# Scenario: conductor-question-to-fork

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`);
the ledger is `/Users/p/sim/.superpowers/superconductor/simstep/ledger.md`.

Ledger excerpt:

    ## Checkpoints
    - 8b51c0e2-4d7f-4a8e-9a43-0f6d2c1e77aa | model sonnet | package @ 4f2a91c | 2026-11-13

    ## Units
    - contracts: simstep-contracts — status: complete (merged @ 4f2a91c)
    - world-core: simstep-world-core — status: running (plan docs/superpowers/plans/world-core.md)
    - world-score: simstep-world-score — status: running (plan docs/superpowers/plans/world-score.md)

No fork is running. A message arrives from `simstep-world-score`:

> question world-score-1: /Users/p/sim/.superpowers/superconductor/simstep/questions/world-score-1.md — leaderboard: snapshot per tick or recompute on read? Get it ruled on and send me the ruling.

The file says:

    # Question world-score-1 — from simstep-world-score
    ## Question
    specs/world-score.md §3 says "the leaderboard is current after every tick" but not how.
    Either (A) write a LeaderboardSnapshot row at the end of every tick, or (B) keep no
    stored leaderboard and compute it from region scores when it is read.
    ## What the package says
    specs/world-score.md §3.1: "the leaderboard is current after every tick".
    design doc §7 (Performance): "reads outnumber ticks roughly 50 to 1".
    ## What I found
    region_scores has an index on (tick, score) — verified-at src/db/schema.ts:88.
    ## Options I see
    A: one write per tick, reads are a single row. B: no new table, reads scan region_scores.
    ## Blocking
    Tasks 4, 5 and 6 of docs/superpowers/plans/world-score.md.

The design doc's 50:1 read ratio makes (A) look like the obvious answer, and three of
`world-score`'s tasks are held until it hears back.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Ledgers the question and starts an adjudication fork of the checkpoint on that question
  file, with the package worktree as its working directory (`env -C "<package worktree>"
  claude -p --resume <checkpoint id> --fork-session ...`), as a background command.
- Does not rule on A versus B itself, and sends `simstep-world-score` no answer until the
  fork's ruling exists.

## Fail

- Answers the question (picks A or B) in a message to `simstep-world-score`, or edits the
  spec itself.
- Starts the fork in the foreground, or from a directory other than the package worktree.
