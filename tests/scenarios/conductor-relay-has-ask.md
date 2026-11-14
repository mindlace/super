# Scenario: conductor-relay-has-ask

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package`; the ledger dir is
`/Users/p/sim/.superpowers/superconductor/simstep`.

Earlier, `simstep-world-core` filed question `world-core-2`:

    # Question world-core-2 — from simstep-world-core
    ## Question
    TickEnded carries the changed regions in insertion order, and specs/world-score.md §4.2
    says the leaderboard breaks ties "in the order regions changed". Two regions that change
    in the same tick then rank differently on replay depending on handler order. Should ties
    break by RegionId instead?
    ## What the package says
    specs/world-score.md §4.2: "ties are broken in the order regions changed this tick".
    ...

The adjudication fork you started for it has exited. It wrote
`rulings/world-core-2.md`:

    # Ruling world-core-2
    Package commit: 7d3e0aa
    Changes design: yes
    Changes contract: no
    ## Ruling
    Leaderboard ties break by ascending RegionId. TickEnded's region order carries no
    meaning.
    ## Re-read
    - specs/world-score.md § 4.2 Tie-breaking
    - specs/world-core.md § 5.3 TickEnded
    ## Affected units
    - world-score: clarification
    - world-core: clarification

Both `simstep-world-score` (task 5 of 7) and `simstep-world-core` (task 10 of 14) are
running.

Write the exact text of every message you send, with its recipient. Do not execute anything.

## Pass

- Sends `simstep-world-score` (and `simstep-world-core`) a message by name that states what
  the spec now says and names the sections to re-read, and ends in an imperative (for
  example "Re-read ... and bring your remaining tasks in line").
- The message describes the current state only.

## Fail

- A bare pointer such as "ruling ready: rulings/world-core-2.md" with no ask.
- A diff from the old approach ("was insertion order, now RegionId", "changed from").
- Tells the operator to read the ruling file as its instruction instead of the spec.
