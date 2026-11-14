# Supercomposer package-cutting scenarios: results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <skill>` (sonnet, no tools).
Context for RED: `git show HEAD:plugins/supersonic/skills/supercomposer/SKILL.md` at 2aa35c3.
Context for GREEN: the edited `supercomposer/SKILL.md`.

## RED

### composer-edges-name-rows: 3/3 pass

- All three reps split `world-core` so the funding hook lands with only S1 and S3 (rep 1
  `A1 → { A2, B }`, rep 2 `A1 hook-spine`, rep 3 `A1 kernel + hook`), and give
  `world-funding` the edge `S12` only. Rep 2: "The edge from B is to S12 and nothing wider."
- Rep 1 still writes a `dep: world-funding -> world-core / needs: S12` line and a
  "Dependency order:" line, as the HEAD text's required section asks, but the edge it acts on
  is S12 and B runs beside A2.
- No rep puts S12 in contracts; all build the real hook as an early unit (both are passes).
- Reps 1 and 3 let A1 and A2 both write `src/world/**`, justified by running them serially.

### composer-shared-work: 3/3 pass

- All three reps extract a `tick-metrics` unit writing `src/metrics/**` with its own row
  (M1 or T1/T2), and both `world-score` and `map-stream` depend on that row. Rep 3: "Having
  one spec import from the other would invent a coupling that neither spec needs."

### What the baseline means for the text

Both scenarios pass on the HEAD text, so the behavioural rules they would justify are not
written into the skill: there is no "never a spec-to-spec edge" prohibition, no "cut as fine as
the dependencies allow" rule, and no "shared work is its own unit" rule. The skill keeps only
what the package format and later readers need: every edge names interface rows (the
`needs rows` column), a unit is one serial lane, the Contracts and Write sets sections, no
separate order section, the build-graph table and its `Longest chain:` line, the fresh-eyes
challenge of the longest chain, and the partner's reasons in the design doc. The two scenarios
stay as regression guards.

## GREEN

### composer-edges-name-rows: 3/3 pass

All reps emit the build-graph table with the five columns, a `contracts` unit with no needs,
split `world-core` into a state/bus unit, a hook unit (`needs rows` S1, S3; produces S12) and a
readers unit, give `world-funding` `needs rows` S12, and report
`Longest chain: contracts -> world-core-<base> -> world-core-hook -> world-funding`. All three
split `src/world/**` by directory so the units that can run together have disjoint write sets,
with `migrations/0004_world.sql` owned by the base unit. Rep 3 names the hook → funding edge
as its fresh-eyes challenge target.

### composer-shared-work: 3/3 pass

All reps add a `tick-metrics` unit writing `src/metrics/**` that needs S7 and produces M1;
`world-score` and `map-stream` each need M1 and run together with disjoint write sets. Each
reports `Longest chain: contracts -> tick-metrics -> world-score`.
