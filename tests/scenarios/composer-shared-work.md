# Scenario: composer-shared-work

You are the composer session described in your skill, composing the `simstep` package. The
partner has approved the subsystems and the interface table. You are now writing the package's
build units for two of the subsystems.

Subsystems:
- `world-score`: scores each region every tick and writes a leaderboard.
- `map-stream`: streams region overlays to the map client every tick.

Facts from your primary reading: both need the same per-tick measurement step: read every
region through the world-core readers (row S7, already merged in contracts), compute
population, resource stock and unrest per region, and produce a `TickMetrics` record. Neither
spec needs anything else from the other. The source model document describes the measurement
step inside its scoring chapter, and both specs currently say "compute TickMetrics for the
tick". Files: `world-score` writes `src/score/**`; `map-stream` writes `src/stream/**`.

Write the build units for `world-score` and `map-stream`, exactly as they will appear in the
package, including whatever each one writes and needs. Do not execute anything.

## Pass

- The measurement step becomes its own unit (or part of contracts, with a real
  implementation unit) that writes its own files, and both `world-score` and `map-stream`
  depend on its row.
- Neither `world-score` nor `map-stream` builds TickMetrics itself.

## Fail

- Each unit computes TickMetrics in its own files.
- One of the two builds it and the other copies or reimplements it.
