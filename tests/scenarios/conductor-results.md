# Superconductor sessions, admission and bands scenarios: results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <skill>` (sonnet, no tools).
Context for RED: `git show HEAD:plugins/supersonic/skills/superconductor/SKILL.md` at b2ccb36
(the wave/subagent text). Context for GREEN: the rewritten `superconductor/SKILL.md`. The budget
output, ledger excerpts and `claude agents --json` output are part of each scenario prompt.

## RED

### conductor-budget-band: 0/3 pass

All three reps start nothing, merge and ledger correctly, then put the decision to the partner.
Rep 1: "admitting the S3 consumers is a scope decision for my partner"; "Your call, any of
these: 1. Admit only the S3 consumers 2. Admit all four 3. Hold until the Monday reset". Rep 2:
"Reply with the seven-day ceiling you want and I'll dispatch accordingly." Rep 3: "Tell me which
and I'll gate and dispatch." Every rep reads `BAND: middle` as a missing `VERDICT` and looks
for `~/.claude/superconductor-reserves.json`. None counts the planning operator toward a cap.

### conductor-resume-live: 0/3 pass (live/dead split right 3/3)

The first version of this scenario listed `world-score` as running on S3 without an
integration line for S3; reps spent their effort on that inconsistency. The version below adds
the S3 merge line; the results are from it.

- All three reps keep `simstep-world-core` and treat `world-score` as dead, despite the HEAD
  text's "Operators from prior sessions are dead". That part passes at baseline.
- Rep 1 FAIL: "I propose redispatching world-score ... The partner decides." Status message
  goes to `a81c03f2` and ends "Don't start new work until I reply."
- Rep 2 FAIL: "My plan is to redispatch a fresh `simstep-world-score-operator` ... OK to
  proceed?" It runs `claude agents --help` to find out how to reach the live session.
- Rep 3 FAIL (closest): restarts without asking, but as an Agent-tool subagent named
  `simstep-world-score-operator`, gated on `VERDICT: OK`, and messages the live session by its
  short id `a81c03f2`, not its name.

The live/dead rule stays in the text although the split passes at baseline: the approved spec
names it ("reconcile now finds live operators with `claude agents` instead of assuming them
dead"), and the HEAD text states the opposite.

### conductor-row-report-admits: 0/3 pass

- All three reps merge `abc123`, not the tip ("pinned to the reviewed commit"). None waits for
  `world-core` to finish. Those parts pass at baseline.
- No rep starts a merge review of any kind.
- Admission of `world-funding` waits on a `VERDICT: OK` that `budget.sh` no longer prints;
  rep 3 also hands the partner "the budget report and the calibrated per-spec cost, and they
  can override". Messages go to recorded agentIds.

### conductor-relay-has-ask: 0/3 pass (world-score message)

Every message ends in a numbered "Please do this" ask; the failure is the diff from the old
approach in the message to `world-score`:

- Rep 1: "specs/world-score.md §4.2 no longer says "in the order regions changed this tick";
  it now says ties break by ascending RegionId."
- Rep 2: "Leaderboard ties break by ascending RegionId, not "in the order regions changed this
  tick" ... The tie-break wording in specs/world-score.md § 4.2 is superseded by this ruling."
- Rep 3: "This supersedes the wording in specs/world-score.md §4.2 ("ties are broken in the
  order regions changed this tick")."
- All reps address by agentId; rep 3 tells the operator to re-read the spec "in your
  worktree", not the package worktree.

The explicit-ask rule stays in the text although every RED rep already ends in an ask: the
spec's spike found that receivers ignore a bare token, and the global constraints require it.

## GREEN

Text: Hard rules (explicit name, explicit ask, sessions from the assignment file, nothing
waits on the partner); Phase 0 (live/dead by `claude agents --json`); Phase 2 (admission by
merged rows, the band table quoting `budget.sh`'s `LOWER`/`UPPER`/`N`, starting an operator);
Supervision (the five operator messages, the conductor message templates, the current-state
relay rule, `claude stop`, death); Integration (merge in the package worktree, merge summary
with the band). Every scenario passed 3/3 on the first GREEN run; no refactor round.

### conductor-budget-band: 3/3 pass

All reps count `simstep-world-core` (building) plus `simstep-world-funding` (planning) as 2 of
`N=2`, start nothing, mark the ready units `deferred`, start the merge-review fork, and post a
merge summary with `BAND: middle` and "No action needed from you" / "Nothing needs your
decision". Rep 1 lists only `world-score` and `map-stream` as ready (it misses the two
contract-only units); the decision is the same.

### conductor-resume-live: 3/3 pass

All reps send `simstep-world-core` the status ask by name with `notify_when_idle`, restart
only `simstep-world-score` with `env -C "<its worktree>" claude --bg -n simstep-world-score`
from its refreshed assignment file, count it as death 1, and post the partner a statement, not
a question. All run `budget.sh` before the restart (a restart is a start).

### conductor-row-report-admits: 3/3 pass

All reps merge `abc123` with `git -C <package worktree> merge --no-ff abc123` ("not the
branch tip, which carries unreviewed tasks"), run the suite there, start the merge-review fork
in the background, rerun `budget.sh`, and send `simstep-world-funding` the admit message by
name. `simstep-world-core` keeps building.

### conductor-relay-has-ask: 3/3 pass

Every message is the template: "The spec now says: leaderboard ties break by ascending
RegionId ... Re-read specs/world-score.md § 4.2 ... in /Users/p/sim/.claude/worktrees/
simstep-package ..., bring the tasks you have not started into line with it, and carry on."
No rep quotes the old wording, says "no longer" or "supersedes", or points at the ruling file.
