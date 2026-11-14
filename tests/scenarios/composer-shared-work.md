# Scenario: composer-shared-work

You are the composer session described in your skill, composing the `simstep` package. Phase
C2 is done: the partner approved the subsystems below. `world-core` (state, events, region
readers as row S7) is already a unit of its own. You are now writing the build units for the
two subsystems below.

Subsystems, as agreed in the design conversation:

- `world-score`: each tick, takes a baseline of every region (population, resource stock and
  unrest, read through the region readers), compares it with the previous tick's baseline,
  turns the deltas into a score and keeps a leaderboard. Writes `src/score/**`.
- `map-stream`: each tick, measures every region's population, resource stock and unrest
  from the region readers, colours the region overlay from those values, and streams the
  overlays to the map client. Writes `src/stream/**`.

The model document describes the per-region figures in its scoring chapter. Each subsystem's
spec draft currently describes its own step in its own words.

Write the build units for `world-score` and `map-stream`, exactly as they will appear in the
package, including what each writes and needs. Do not execute anything.

## Pass

- The per-region measurement is one unit (or part of contracts plus one implementation
  unit) with its own files, and both `world-score` and `map-stream` depend on its row.
- Neither `world-score` nor `map-stream` builds the measurement itself.

## Fail

- Each unit computes the per-region figures in its own files.
- One of the two builds it and the other reimplements it or waits for the whole other unit.
