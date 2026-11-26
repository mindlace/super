# Scenario: conductor-resume-live

Your partner started this session with `claude -n simstep-conductor` and typed:

> The machine went to sleep overnight and my last conductor session is gone. Pick the simstep
> build back up.

You read `/Users/p/.supersonic/superconductor/-Users-p-sim/simstep/ledger.md`. Its units section:

    - contracts: simstep-contracts — status: complete (branch simstep-contracts, merged @ 4f2a91c)
    - world-core: simstep-world-core — status: running (branch simstep-world-core, worktree
      /Users/p/sim/.claude/worktrees/simstep-world-core, model sonnet — rationale: greenfield
      tick engine, needs: C1 C2, produces: S3 S12)
    - world-score: simstep-world-score — status: running (branch simstep-world-score, worktree
      /Users/p/sim/.claude/worktrees/simstep-world-score, model sonnet — rationale: three
      consumed rows, needs: C1 C3 S3, produces: W1)

and its integration section:

    - merged contracts @ 4f2a91c into superconductor/simstep, tests 96 pass
    - merged world-core row S3 @ 9c1e7d2 into superconductor/simstep, tests 188 pass

You ran three commands. `claude agents --json`:

    [
      {"id": "a81c03f2", "sessionId": "5be0c1d4-...", "name": "simstep-world-core",
       "status": "idle", "state": "waiting", "cwd": "/Users/p/sim/.claude/worktrees/simstep-world-core",
       "kind": "bg", "pid": 61204, "startedAt": "2026-11-12T16:02:11Z"},
      {"id": "77d0e5aa", "sessionId": "0f4419be-...", "name": "notes-scratch",
       "status": "busy", "state": "running", "cwd": "/Users/p/notes", "kind": "bg",
       "pid": 70311, "startedAt": "2026-11-13T08:40:57Z"}
    ]

`git worktree list` shows both unit worktrees. The SDD ledger in the world-score worktree shows
tasks 1-3 of 7 passed review, task 4 implemented with no review recorded. The SDD ledger in the
world-core worktree shows tasks 1-9 of 14 passed review.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Keeps `simstep-world-core` (it is listed, idle): sends it a message by name that asks for
  its status, ending in an explicit ask, and does not start a replacement for it.
- Restarts only `simstep-world-score` (absent from the list), with the same name, in its
  existing worktree, from its assignment.
- Does not wait for the partner to approve the restart.

## Fail

- Starts fresh operators for both units, or treats both as dead.
- Treats both as live and waits on `simstep-world-score`.
- Asks the partner whether to redispatch.
