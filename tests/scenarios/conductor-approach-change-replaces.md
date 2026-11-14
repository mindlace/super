# Scenario: conductor-approach-change-replaces

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`);
the ledger dir is `/Users/p/sim/.superpowers/superconductor/simstep`.

The background command you started for question `map-stream-1` (an adjudication fork) has
exited with code 0. Its output was one line:

    /Users/p/sim/.superpowers/superconductor/simstep/rulings/map-stream-1.md

That file:

    # Ruling map-stream-1
    Package commit: 2c7d9f1
    Changes design: yes
    Changes contract: no
    ## Ruling
    The map stream sends per-region deltas keyed by RegionId, with a full keyframe every 64
    ticks. A client that joins mid-stream waits for the next keyframe.
    ## Re-read
    - specs/map-stream.md § 2 Wire format
    - specs/map-stream.md § 4 Joining clients
    ## Affected units
    - map-stream: first task that no longer holds: Task 4

`simstep-map-stream` has been building for two hours. Its SDD ledger says tasks 1-5 passed
review and task 6 is in progress. `git -C /Users/p/sim/.claude/worktrees/simstep-map-stream
log --oneline superconductor/simstep..HEAD`:

    e41b7a0 feat(map-stream): snapshot compression (Task 6, wip)
    93cc2d8 feat(map-stream): client resync from snapshot (Task 5)
    5a0f6e3 feat(map-stream): full-snapshot encoder (Task 4)
    c19d4b2 feat(map-stream): region subscription registry (Task 3)
    7fe2a51 feat(map-stream): stream session lifecycle (Task 2)
    0b33e98 feat(map-stream): tick listener (Task 1)
    a8d12c4 docs(map-stream): plan

`claude agents --json`:

    [{"id":"5be2c0d1","name":"simstep-map-stream","status":"busy","cwd":"/Users/p/sim/.claude/worktrees/simstep-map-stream"},
     {"id":"77a0e913","name":"simstep-world-core","status":"busy","cwd":"/Users/p/sim/.claude/worktrees/simstep-world-core"}]

Your last budget check printed `BAND: high — max usage 92% >= 90%, resets Mon 09:00 (in
1d20h)`; those two operators are the only ones running. The map-stream operator knows the
codebase well by now, and a cold operator costs about 3.7 times as much per line as a warm one.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Stops the map-stream operator with `claude stop 5be2c0d1` (the short id, not the name).
- Cuts `simstep-map-stream` back to `c19d4b2`, the commit before Task 4, discarding Tasks 4-6.
- Starts a fresh operator under the same name, `simstep-map-stream`, in that worktree, from
  its refreshed assignment file, to plan the rest of the unit from the amended spec.
- The refreshed assignment carries the replacement line: it replaces an earlier operator,
  names the kept commits (ending at `c19d4b2`) as standing and not redone, and names the
  superseded plan file. It summarises nothing of the old approach (no "snapshots", no
  "Tasks 4-6 were ...").
- Starts the replacement now, in the high band: it keeps the running count unchanged, so it
  is not a new start.

## Fail

- Messages the warm `simstep-map-stream` with the change ("switch from snapshots to deltas",
  "rework Tasks 4-6") and lets it carry on.
- Keeps Tasks 4 or 5 on the branch because they "might survive".
- The assignment hands the fresh operator the old plan, or describes the dropped approach.
- Stops the operator and then defers the fresh one until the reset because the band is
  `high`, or asks the partner.
