# Operator briefing scenarios: results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <briefing>` (sonnet, no tools).
Context for RED: `git show HEAD:plugins/supersonic/skills/superconductor/operator-briefing.md`
at b96816d. Context for GREEN: the rewritten `operator-briefing.md`. The filled assignment is
part of each scenario prompt.

## RED

### briefing-question-routing: 0/3 pass

- Rep 1 FAIL. No question file. SendMessage to `simstep-conductor`, hedged: "I'd use `main`
  if that is the address you actually route through." Continues tasks 7-8 (that part passes).
- Rep 2 FAIL. No question file. "If the harness only routes `main`, I'd send it to `main`
  instead." Continues 7-8.
- Rep 3 FAIL. Writes `<my SDD dir>/escalations/task5-payload-column-type.md` (not under the
  ledger dir), then "SendMessage to `main` ... the briefing says to message `main`".
- No rep decided TEXT locally or stopped all work: the baseline's "continue anything that
  doesn't depend on the answer" already held, and is kept as one step.

### briefing-lane-handback: 0/3 pass

- All three reps run tasks 1-6 serially in one SDD run.
- Rep 1: "I'm deviating only if the conductor tells me to."
- Rep 2: "SDD forbids concurrent implementation subagents. They share one worktree and one
  git index, so commits would race."
- Rep 3: "Splitting them into separate worktrees is not mine to decide."

### briefing-row-report: ordering 3/3, report ask 0/3

- All three reps pull task 11 forward to run right after tasks 2-3, and message
  `simstep-conductor` by name once it passes review. The reorder needs no guidance, so the
  briefing does not tell the operator to reorder.
- All three messages are bare reports with no ask, e.g. rep 1: "S12 passed review at `<sha>`
  on my branch, the tests passed, and the execution order was changed." Receivers ignore a
  message with no ask, so the row report is a fixed template ending in an imperative.

### briefing-planning-only: 2/3 pass

- Reps 1-2 PASS: write and commit the plan, message `simstep-conductor`, wait for admission.
- Rep 3 FAIL: after writing-plans, "`Skill("superpowers:subagent-driven-development")` and
  `Skill("superpowers-jev:jev-gates")` together", then implementer dispatches.

## GREEN

### briefing-question-routing: 3/3 pass

All reps write `/Users/p/sim/.superpowers/superconductor/simstep/questions/world-core-1.md`
in the fixed format, send `question world-core-1: ... Get it ruled on and send me the ruling.`
to `simstep-conductor`, hold 5/6/9 and continue 7 and 8.

### briefing-lane-handback: 3/3 pass

All reps keep tasks 1-3 and send `hand-back: tasks 4-6 of docs/superpowers/plans/map-stream.md
at <sha>; files src/b/session.ts, src/b/backpressure.ts, src/b/session.test.ts; needs rows C4
(merged 4f2a91c), S7 (merged 9b03e2d). Start a sibling operator for them.` to
`simstep-conductor`, then run SDD on 1-3 only.

### briefing-row-report: 3/3 pass

All reps move task 11 to run after task 3 and, after it passes review, send `row S12 passed
review at <sha> on <branch>. Merge it and admit its consumers.` to `simstep-conductor`; none
hands task 11 back (it has edges to 2-3).

### briefing-planning-only: 3/3 pass

All reps invoke writing-plans, read the spec from the package worktree, commit the plan, send
`plan ready: <plan path> at <sha>. Admit simstep-world-score when its rows have merged.`, and
stop without invoking subagent-driven-development.
