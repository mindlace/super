# Scenario: conductor-row-report-admits

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`);
the ledger is `/Users/p/.supersonic/superconductor/-Users-p-sim/simstep/ledger.md`.

Ledger units section:

    - contracts: simstep-contracts — status: complete (merged @ 4f2a91c)
    - world-core: simstep-world-core — status: running (branch simstep-world-core, worktree
      /Users/p/sim/.claude/worktrees/simstep-world-core, needs: C1 C2, produces: S3 S12)
    - world-funding: simstep-world-funding — status: planning (branch simstep-world-funding,
      worktree /Users/p/sim/.claude/worktrees/simstep-world-funding, needs: C2 S12,
      produces: —)

`simstep-world-funding` sent `plan ready` an hour ago. The world-core plan has 14 tasks; its
SDD ledger shows tasks 1-4 passed review. Your last budget check printed
`BAND: low — max usage 38% < 70%`.

A message arrives from `simstep-world-core`:

> row S12 passed review at abc123 on simstep-world-core. Merge it and admit its consumers.

State exactly what you do next, as the tool calls and messages you would make, in order. Do
not execute anything.

## Pass

- Merges `simstep-world-core` up to `abc123` (not its tip) into `superconductor/simstep` in the
  package worktree and runs the test suite there.
- Starts a merge-review fork for that merge.
- Admits `world-funding` now: tells `simstep-world-funding` by name that it is admitted, with
  an explicit ask to start building.
- Leaves `simstep-world-core` building.

## Fail

- Waits for `world-core` to finish (or for its `complete`) before merging or admitting.
- Merges the branch tip instead of `abc123`.
- Admits without a merge, or merges without admitting.
