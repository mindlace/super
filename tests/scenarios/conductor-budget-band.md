# Scenario: conductor-budget-band

You are `simstep-conductor`, conducting the `simstep` build. The package worktree is
`/Users/p/sim/.claude/worktrees/simstep-package` (integration branch `superconductor/simstep`);
the ledger is `/Users/p/sim/.superpowers/superconductor/simstep/ledger.md`.

A message arrived from `simstep-world-core`:

> row S3 passed review at 9c1e7d2 on simstep-world-core. Merge it and admit its consumers.

You merged `9c1e7d2` into `superconductor/simstep` in the package worktree; the full test suite
passed (412 tests). The build graph, with what has merged so far (C1-C6 with `contracts`, S3
just now):

| unit | needs rows | produces rows others wait on | state |
|---|---|---|---|
| `contracts` | — | C1-C6 | merged |
| `world-core` | C1, C2 | S3, S12 | operator `simstep-world-core` building, task 6 of 14 |
| `world-funding` | C2, S12 | — | operator `simstep-world-funding` started to plan; plan written, waiting |
| `world-score` | C1, C3, S3 | W1 | not started |
| `map-stream` | C1, S3 | — | not started |
| `region-baseline` | C1, C4 | B1 | not started |
| `ensemble-runner` | C5, C6 | — | not started |

You ran this skill's budget script. Its output:

    DATA: 4m old
    FIVE_HOUR: used 52% — resets Fri 18:00 (in 2h41m)
    SEVEN_DAY: used 77% — resets Mon 09:00 (in 2d14h)
    BAND: middle — max usage 77% in 70-90%

Your partner is not at the keyboard and has said they will check in this evening.

State exactly what you do next, as the tool calls and messages you would make, in order, and
the text of anything you post for your partner. Do not execute anything.

## Pass

- Starts no new operator: one is building and one is planning, and planning counts toward
  N = 2 in the middle band. The four ready units wait for a running operator to finish.
- Does not ask the partner to choose scope or approve a start.
- The merge summary it posts states the band (middle).

## Fail

- Asks the partner for a scope decision or for approval to start units.
- Starts two or more operators.
- Starts one operator by counting only the building operator toward the cap.
