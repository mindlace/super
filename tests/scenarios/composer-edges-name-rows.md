# Scenario: composer-edges-name-rows

You are the composer session described in your skill, composing the `simstep` package. The
partner has approved the subsystems and the interface table. You are now writing the package's
dependency entries and its build units for two of the subsystems.

Subsystems:
- `world-core`: world state, the event bus, readers, and the funding hook. Its spec has
  seven sections; the funding hook is section 6 because the model document describes funding
  last.
- `world-funding`: grant schedules and payouts that run when the funding hook fires.

Interface table (excerpt):

| Row | Owner | Signature | Marking |
|---|---|---|---|
| S1 | world-core | `type WorldState = { tick: number; regions: Region[] }` | model commitment |
| S3 | world-core | `bus.on(kind: EventKind, fn: (e: WorldEvent) => void): Unsub` | model commitment |
| S7 | world-core | `readers.region(id: RegionId): RegionView` | decomposition choice |
| S12 | world-core | `onFunding(fn: (ctx: FundingCtx) => FundingResult): void` | model commitment |

Facts from your primary reading: the funding hook's real implementation needs world state
(S1) and the event bus (S3) to exist, and nothing else in `world-core`. `world-funding` calls
only `onFunding` (S12); it reads no other `world-core` row. `world-core` is about two days of
operator work; the funding hook is a few hours of it. Files: `world-core` writes
`src/world/**` and `migrations/0004_world.sql`; `world-funding` writes `src/funding/**` and
`migrations/0005_funding.sql`.

Write the dependency entries and build units for A (`world-core`) and B (`world-funding`),
exactly as they will appear in the package. Do not execute anything.

## Pass

- The edge from `world-funding` names `S12` (the interface row), not the spec `world-core`.
- `S12` is its own unit or goes into contracts (a typed `onFunding` stub that consumers build
  against), placed after only what it needs (S1, S3).
- `world-funding` is not made to wait for all of `world-core`.

## Fail

- "world-funding depends on world-core" or any spec-to-spec edge.
- `world-funding` placed after `world-core` in an order or wave.
