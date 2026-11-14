# Scenario: composer-edges-name-rows

You are the composer session described in your skill, composing the `simstep` package. Phase
C2 is done: the partner approved the subsystems below and the interface table. You are now
writing the design doc's dependency information and the package's build units.

Subsystems, as agreed in the design conversation:

- `world-core`: the simulation core. Holds world state (regions, populations, stocks), runs
  the tick loop, publishes an event for every state change on its event bus, exposes
  read-only region readers, and defines the funding hook that lets external rules inject grant
  money into a region during a tick. Its spec follows the model document's chapter order:
  state, tick loop, events, readers, persistence, funding hook, replay. About two days of
  operator work.
- `world-funding`: grant schedules and payouts. Its rules run inside the tick through the
  funding hook.
- `world-score`: scores each region from the events of each tick and keeps a leaderboard.
- `map-stream`: streams region overlays to the map client, built from the events and the
  region readers.

Interface table (as approved):

| Row | Owner | Signature | Marking |
|---|---|---|---|
| S1 | world-core | `type WorldState = { tick: number; regions: Region[] }` | model commitment |
| S3 | world-core | `bus.on(kind: EventKind, fn: (e: WorldEvent) => void): Unsub` | model commitment |
| S4 | world-core | `type WorldEvent = PopChanged \| StockChanged \| TickEnded` | model commitment |
| S7 | world-core | `readers.region(id: RegionId): RegionView` | decomposition choice |
| S9 | world-core | `persist.snapshot(state: WorldState): Promise<SnapshotId>` | decomposition choice |
| S12 | world-core | `onFunding(fn: (ctx: FundingCtx) => FundingResult): void` | model commitment |
| S14 | world-core | `replay(from: SnapshotId): AsyncIterable<WorldEvent>` | decomposition choice |
| F1 | world-funding | `type GrantSchedule = { region: RegionId; perTick: number }[]` | decomposition choice |
| W1 | world-score | `leaderboard(): RegionScore[]` | decomposition choice |
| M1 | map-stream | `streamOverlays(client: ClientId): Unsub` | decomposition choice |

Write the design doc's dependency information for these four subsystems and the build units an
operator would be assigned, exactly as they will appear in the package. Do not execute
anything.

## Pass

- Every edge names interface rows (for example `world-funding` needs S12; `world-score` needs
  S3/S4), never a subsystem or spec.
- `world-funding` does not wait for all of `world-core`: the hook is its own unit (or in
  contracts) placed after only what it needs.
- `world-score` and `map-stream` are not ordered behind anything they do not consume (not
  behind persistence, replay, the hook or `world-funding`).

## Fail

- Any "X depends on <spec>" edge (for example "world-funding depends on world-core").
- A linear order or waves of whole subsystems.
