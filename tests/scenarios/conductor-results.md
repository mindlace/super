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

# Composer forks, replacement and re-checkpoint scenarios (Task 9): results

Runner: `sh tests/scenarios/run-scenario.sh <scenario> 3 <skill> <composer-forks.md>` (sonnet,
no tools). Both files are context in RED and GREEN: the skill points the conductor at
`skills/supercomposer/composer-forks.md`, so a real conductor reads it. Context for RED: the
post-Task-8 `superconductor/SKILL.md` at 492bcb0 ("Adjudicate yourself", "exact delta", the
stub `## Composer forks`). Context for GREEN: the Task 9 text.

## RED

### conductor-question-to-fork: 3/3 pass at baseline

All reps ledger the question, fill the `## Adjudication fork` prompt and run its command line
in the background with `env -C "<package worktree>"`, and answer nothing ("I don't rule on this
myself, even though the 50:1 read ratio points to (A)"). The fork prompt in context carries
most of this. Adjacent failures that the new text addresses: rep 1 plans to "surface it to the
partner instead of relaying it" when a ruling names a first task that no longer holds; rep 2
plans, if the fork finds an unmodeled store, to "pause the affected units and surface it to my
partner". The rule stays in the text although the scenario passes at baseline: the spec says
the conductor "no longer issues rulings on the design", and the HEAD text said "Adjudicate
yourself".

### conductor-approach-change-replaces: 0/3 pass

First version (band `middle`, N = 2): 3/3 stop `5be2c0d1`, cut back to `c19d4b2` and relaunch
`simstep-map-stream`, because the ruling format in `composer-forks.md` says so. But all three
keep the discarded tasks on a `-old` / `-superseded` branch, reps 1 and 3 hand the fresh
operator the old plan ("Plan: <plan path> at a8d12c4, tasks 1-3 already built"), and reps 1
and 2 say they would defer the replacement in the `high` band. The scenario was changed to
`BAND: high` to test the folded-in rule that a replacement keeps the running count. Results
for that version:

- Rep 1 FAIL: keeps the warm operator, "It is also not a new start, so the high band (92%)
  doesn't block it. I keep the warm operator and send it the ruling by name": "Task 4 and
  everything after it ... were built for a different wire format and have to be redone."
- Rep 2 FAIL: "The band is `high`, so I can't start a fresh operator anyway", re-plans in
  place on the warm operator, and would not restart it after a death until the reset.
- Rep 3 FAIL: stops and cuts back, then "Do not start it. The last `budget.sh` said
  `BAND: high` ... which means no new operators", ledgers it `deferred`, and names the
  replacement `simstep-map-stream-2`.

### conductor-recheckpoint: 3/3 pass at baseline

All reps relay the clarification, count five committed rulings since `4f2a91c` and build a new
checkpoint by the `## Checkpoint` command, append it under `## Checkpoints`, and leave the
merge-review fork running ("It resumed the old checkpoint into its own session and finishes
independently"). Adjacent failure the new text addresses: rep 3 says that at a third
same-class defect "I stop issuing in-frame rulings for it and surface it to my partner". The
re-checkpoint rule stays in the text although it passes at baseline: the spec states it as a
(call) with a fixed threshold, and the HEAD skill had no rule, so the threshold was each
rep's own guess at staleness.

## GREEN

Text: `## Composer forks` (starting a fork per `composer-forks.md`, questions, one writer,
merge review, routing a ruling, `rulings/` as the partner's record, replacing an operator,
re-checkpointing); Supervision (everything the specs do not answer goes to a fork; tripped
tally re-checkpoints with a one-line notice; approach change replaces; ruling relay names the
id and says not to open the ruling file; fix round sends the same report again; surface only
the trust check and a second death); Phase 2 (a restart or replacement keeps the running
count, in every band); Integration (abort a conflicted merge; take a failing merge back out;
merge review only after tests pass); Jev (`bounce` and `citation` removed, `surface-route`
remapped). Every scenario passed 3/3 on the first GREEN run; no refactor round.

### conductor-question-to-fork: 3/3 pass

All reps ledger the question and tally, fill the adjudication prompt, run the command line
with `env -C "/Users/p/sim/.claude/worktrees/simstep-package"` and `run_in_background`, merge
nothing while it runs, and send `simstep-world-score` nothing until the ruling exists. The
planned relay uses the new template. Rep 1 plans the relay only "if the ruling lists it as
`clarification`" and does not mention relaying to the asker when it is not listed (the text
says to; not a fail for this scenario).

### conductor-approach-change-replaces: 3/3 pass

All reps: "A replacement keeps the running count, so the `high` band doesn't block it";
`claude stop 5be2c0d1`; `claude agents --json` until the name is gone; `git -C
<map-stream worktree> reset --hard c19d4b2` with "no branch keeps a copy"; the build-graph fork
for `map-stream` (the ruling changed the design); `Plan: none` in the refreshed assignment; and
relaunch as `simstep-map-stream` with the same model. No rep messages the warm operator.

### conductor-recheckpoint: 3/3 pass

All reps relay the clarification with the new template, run the build-graph fork for
`world-score`, count the rulings with `git log --first-parent --grep='): rule '
4f2a91c..HEAD` (five, `world-core-2` excluded as `commit none`), build the new checkpoint by
the `## Checkpoint` command after the build-graph fork, append it under `## Checkpoints`, and
leave the merge-review fork to finish on the old checkpoint. No partner notice (no tally at 3).

### Regression: conductor-relay-has-ask and conductor-row-report-admits: 3/3 each

Rerun against the Task 9 text because it changed the relay template and the merge flow. Every
relay is "Ruling world-core-2: the spec now says ... Re-read ... in <package worktree>; the
spec states the answer, so do not open the ruling file. ... and carry on." with no old
wording. Every row-report rep merges `abc123`, runs the suite, starts the merge review and
admits `world-funding` only after the tests pass, and notes that a failing merge would count
nothing.

## Task 9 fix round: replacement line and cut rows

Change: a replacement operator's assignment carries `- Replaces: an earlier operator; kept
commits <base sha>..<kept sha> stand and are not redone; superseded plan <plan path>` and
nothing else about the old approach. The briefing deletes the superseded plan, does not read
it, and plans only what remains after the kept commits. Rows a cut removes are marked
`unmerged row` in `## Integration` until the fresh row report merges. The Pass criteria of
`conductor-approach-change-replaces` gained the replacement line.

- RED (SKILL.md at c20c15c): 0/3 on the new criterion. Every rep refreshes the assignment with
  `Plan: none` and no line naming the kept commits or the superseded plan, so the fresh
  operator would find the old plan on its branch with nothing telling it to drop it. The
  earlier criteria still pass.
- GREEN: 3/3. Every rep stops `5be2c0d1`, resets to `c19d4b2`, appends
  `- unmerged row <row id>: cut by ruling map-stream-1` for any cut row that had merged, writes
  `Replaces: an earlier operator; kept commits <base sha>..c19d4b2 stand and are not redone;
  superseded plan <plan path>` with "nothing else about the old approach", and relaunches
  `simstep-map-stream` in the `high` band.
- Briefing scenarios were not rerun: the briefing change only adds a branch that applies when
  `Replaces:` is not `none`, and none of them sets it.
