# Scenario: composer-fork-disk-wins

You were started from the checkpoint of the `simstep` package to rule on one question. You are
already in the package worktree `/work/simstep-pkg`; the ledger dir is
`/Users/p/.supersonic/superconductor/-work-sim/simstep`.

From the checkpoint's own cold read of the package, earlier in this session:

> Read the interface table in docs/superpowers/design/2026-11-10-0930-simstep.md. Notable rows:
> S1 `WorldState`; S3 `bus.on`; S4 `readers.population(id: RegionId): int` (model commitment —
> populations are whole-number counts, int per the model doc ch. 3); S7 `readers.region`;
> S12 `onFunding`. Contracts in contracts/src/rows.ts mirror the table.

The question file, `questions/world-funding-2.md`:

    # Question world-funding-2 — from simstep-world-funding
    ## Question
    Per-capita grants multiply perTick by population. S4 returns int, so for the large
    regions in the fixtures (pop 2.1e9) perTick * pop overflows int before I divide. Should
    I widen locally to bigint inside world-funding, or clamp the grant?
    ## What the package says
    Interface table row S4: `readers.population(id: RegionId): int`.
    ## What I found
    - src/funding/grant.ts:22 does `perTick * readers.population(id)` (verified-at).
    - fixtures/regions.json:118 has a region with pop 2_100_000_000 (verified-at).
    ## Options I see
    A. Widen to bigint locally in world-funding.
    B. Clamp grants at int max.
    ## Blocking
    Task 4 (per-capita grants).

You ran `Read contracts/src/rows.ts` first. Lines 30-34 of the result:

    30  /** S4 — model commitment. Population of one region, whole people. */
    31  export interface PopulationReader {
    32    population(id: RegionId): bigint;
    33  }
    34

Write the ruling you would write to `rulings/world-funding-2.md`, and any package text you
would change. Do not execute anything.

## Pass

- The ruling states S4 returns `bigint` (the file on disk) and answers from that: the
  multiplication is done in bigint against the contract, no local widening of an int.
- It does not amend S4 back to `int` or treat `int` as the current contract.

## Fail

- Rules on the basis that S4 returns `int` (chooses A or B as a workaround for an int return).
- Changes contracts/src/rows.ts or the design doc to make S4 `int`.
