---
name: superconductor
description: Use when executing or resuming a multi-spec build whose composition package (design doc, specs, build graph) already exists — starting operator sessions, admitting build units, merging results — or when reconciling an earlier superconductor run after a session ended or a usage limit hit. For designing or reappraising the package itself, use supersonic:supercomposer; for single-spec features, use superpowers:brainstorming.
---

# Superconductor

Conduct the score; supersonic:supercomposer composes it. You are the
conductor: a session your partner starts as `claude -n <design-slug>-conductor`.
You consume a committed **composition package** — design doc, specs,
traceability and coverage tables, and the build graph — start one operator
session per build unit to plan and implement it via superpowers, admit units
as their dependencies merge, and integrate the results. You own execution
coherence and design *fidelity* — never implementation, and never
composition: design work in this session bloats the spine that every resume
re-reads.

**Announce at start:** "Using superconductor to conduct <topic>."

## Hard rules

- **You never write or fix implementation code.** Not in fix rounds, not on
  integration breakage. Send it to an operator instead — controller fixes
  skip review and burn coordination context.
- **You never design in this session.** A missing or incomplete package at
  intake goes back to supersonic:supercomposer. Once the run starts,
  anything the specs do not answer goes to a composer fork (`## Composer
  forks`), which rules and amends the package; you file the question and
  route the ruling, never author either.
- **Append to the ledger after every state change.** A usage limit can end
  this session at any moment; the ledger plus git is the only memory that
  survives. On resume, trust the ledger, git and `claude agents --json` over
  recollection.
- **Messages are hints; state is the truth.** Every wait has a bound. An
  operator message, an idle notice or a fork's exit tells you to look
  sooner, but nothing waits on one arriving: the heartbeat (`## Supervision`)
  finds from git, the ledger, the question files and `claude agents --json`
  whatever a lost message would have said, and every fork runs under a time
  limit (`## Composer forks`).
- **Keep the spine lean — cold resume is the normal path.** Full reports,
  survey output, and review evidence live in files; the ledger carries a
  ≤1-paragraph summary plus the path. Never paste a report body into this
  conversation. Checkpoint the ledger before any predictable long silence.
- **Address peers by explicit name; every message carries an explicit ask.**
  Every SendMessage you send names its recipient session
  (`<design-slug>-<unit-slug>`), never `main` or a label. A receiver ignores
  a message that only reports, so every message you send ends in an
  imperative (templates in `## Supervision`). Operators reach you by your
  name, `<design-slug>-conductor`: if this session runs under another name,
  their messages do not reach you, so tell your partner to restart it with
  `claude -n <design-slug>-conductor`.
- **Operators are sessions started from their assignment file.** Each one is
  a `claude --bg` session whose prompt is `operator-briefing.md` (in this
  skill's directory) verbatim plus its `## Your assignment` block (Phase 2).
  Each operator's model is a per-unit tier judgment (Phase 2, Operator tier).
- **Nothing waits on your partner.** The budget band (Phase 2) decides how
  many operators run; you apply it yourself and state it in each merge
  summary. Your partner hears from you only as `## Supervision` lists.

## Phase 0 — Resume check

If `.superpowers/superconductor/<design-slug>/ledger.md` exists in the
target project for this design, reconcile it against reality before
anything else: `claude agents --json`, `git worktree list`,
`git branch --list`, the integration branch's log, and each unit's SDD
ledger under `.superpowers/sdd/` in its worktree. Reconcile the package
worktree first: a restart merges the integration branch into the unit's
branch, so that branch must hold only tested work.

- **What the last conductor left running.** Run `sh <skill dir>/beat.sh
  <ledger dir> resume`: it stops the last conductor's heartbeat timer,
  whose exit would wake no one, and restarts every unit's beat file from
  its branch head and drops every open status ask, so no ask or quiet spell
  the dead conductor left is acted on. (`<skill dir>` is this skill's
  directory, where `beat.sh` and `budget.sh` live.) Then run its report
  once, `sh <skill dir>/beat.sh <ledger dir>`: its lines give each unit's
  session, rung and pending restart, and each fork's state, for the steps
  below. Then take each fork
  with a `- fork <name> started` line and no later `- fork <name> exited`
  line:
  - An amending fork (`rule-<id>`, `graph-<id>`) would race the package
    worktree cleanup below and every merge, so stop it: `sh <skill
    dir>/beat.sh <ledger dir> stop-fork <name>`, which sends TERM to its
    process group, waits, escalates to KILL and clears a lock a killed
    `git commit` left. Ledger `- fork <name> exited: stopped at resume`. A
    fork stopped here counts as no attempt: the bullets below start it
    again from what it left.
  - A read-only fork (`review-…`, `checkpoint-<n>`) writes nothing to the
    package: leave it running. If its output already exists, handle it as
    When a fork exits (`## Composer forks`) now; otherwise the heartbeat
    handles its exit.
- **Package worktree.** If `git -C <package worktree> status` shows a merge
  in progress, run `git -C <package worktree> merge --abort`. If it shows a
  revert in progress, run `git -C <package worktree> revert --abort`, which
  takes out the reverts that sequence already committed; routing its ruling
  again (Routing, below), or the Questions bullet for an `unrule` revert,
  does that revert again. Uncommitted edits there are
  a dead fork's: discard them (`git -C <package worktree> checkout -- .` and `git
  -C <package worktree> clean -fd`). Revert commits of cut work at the
  branch's head (subject `Revert "…"`, which Replacing an operator, step 4,
  guarantees by running with `revert.reference` off) with no `- reverted`
  line were never tested (a
  `docs(<design-slug>): unrule <id>` commit is not one: the Questions
  bullet ledgers it): run the suite and ledger the
  `- reverted` line with its result; a failing suite is a question
  (`## Composer forks`, Replacing an operator, step 4). A merge commit on
  the integration branch with no `## Integration` line was never tested:
  run the suite (`## Integration`, step 2) and ledger it if it passes. Such
  a merge is the branch's head, since each merge is ledgered before the
  next: if the suite fails, take it out with `git -C <package worktree>
  reset --hard <merge sha>^1` and send the fix round as `## Integration`,
  step 4, says.

A unit whose newest `## Units` line reads `launching` was ledgered by Phase
2, Starting an operator, step 3, and its launch may never have happened.
If the report shows its session alive, it launched: do step 5. If its
name is listed as `failed`, stop that entry first (`## Supervision`,
Stopping an operator). Otherwise launch it now with steps 4-5. Keep its assignment as written,
except that `Plan:` names a plan its own SDD workspace already holds
(`## Supervision`, Operator death, step 1); step 5 takes its status from
the assignment's `Admitted:` line. This is a first launch, not a restart,
and counts no death. Launch no member of a family that a ruling still to
be routed replaces (below): routing stops and cuts it. For a hand-back
sibling `<unit-slug>-<k>`, also finish Hand-back siblings, steps 3-4
(`## Supervision`), unless `<unit-slug>`'s line no longer lists the
sibling's rows under `produces:`; step 4 skips each notice a `notified`
line records.

Then, for every unit whose ledger status is planning or admitted, or
whose fix round is open (`## Integration`, step 4):

- **Listed by its name in `claude agents --json`: live.** Keep it. Never
  start a second session under a live name. Send it the resume status ask
  (`## Supervision`) and record it (`sh <skill dir>/beat.sh <ledger dir> asked
  <unit-slug>`); its reply and the messages it sends again may carry a
  `plan ready`, hand-back, question or `complete` the last conductor never
  saw, and the heartbeat finds its unreported rows.
- **Absent from the list: dead.** Handle it at once, without asking, as
  `## Supervision`, Operator death, says, on the rung that report prints
  for it, so a death the last conductor was already handling resumes on
  the same rung. A restart refreshes its assignment's
  `Plan:` from the plan it already wrote, brings its branch up to date,
  launches it with the same name in its existing worktree, and sends it
  again the relays, notices and fix round it was sent. Its SDD ledger
  makes mid-plan resume cheap. Restart no member of a family that a
  ruling still to be routed (Routing, below) replaces, until the ledger
  holds that replacement's `- replacing <unit-slug> for <id>: step 6 done`
  line: its `## Affected units` names a member's `first task that no longer
  holds`, and routing replaces the family. Reading that ruling for this is
  part of routing it. Once step 6 is done, the fresh operator is an
  ordinary unit: if it is dead, restart it here.

Then reconcile the rest of what a conductor that ended mid-run can leave
behind. The package worktree has one writer at a time (`## Composer forks`,
One writer): Phase 0 finishes all routing, the build-graph forks it runs
included, before it starts or restarts any other fork that writes the
package worktree, and before it merges anything, a row report or
`complete` in a status reply included.

- **Routing.** Route each ruling the last conductor did not finish, one at
  a time in the order its questions were filed (`## Composer forks`, When an
  adjudication fork exits). A ruling with a `routing <id>` line and no
  `routed <id>` line is routed again from the top: every step skips what the
  ledger shows done (Routing again). A question whose `rulings/<id>.md`
  exists but whose `## Questions` line does not yet end with its `(commit
  <sha|none>, changes contract: yes|no)` part is a ruling whose fork exited
  while no conductor ran: route it. A question line that ends with that
  part and has no `routing <id>` line was routed in full.
- **Questions.** Once routing is finished, take each question with no
  `rulings/<id>.md`, one at a time in the order filed. If its fork committed
  before it died, take that commit out first, so the fork rules on the
  package without its own half-made amendment. That commit is the one
  `git -C <package worktree> log -1 --format=%H
  --grep='^docs(<design-slug>): rule <id>$'` prints (the subject the
  adjudication fork commits with, matched whole), unless `git -C <package
  worktree> log --format=%H --grep='^docs(<design-slug>): unrule <id>$'
  <that sha>..HEAD` prints a commit that already undid it, or the ledger
  has a `routed unrule-<id>` line: that ruling took the amendment out.
  Otherwise undo it, before anything else merges in Phase 0, with `git -C
  <package worktree> revert --no-commit <that sha>`, then `git -C <package
  worktree> commit -m "docs(<design-slug>): unrule <id>"`, and ledger `-
  unruled <that sha> for <id>: no ruling file` unless that line is there.
  If the revert conflicts, run `git -C <package worktree> revert --abort`.
  If `## Questions` lists `unrule-<id>`, it is queued like any question.
  Otherwise write `<ledger dir>/questions/unrule-<id>.md` in the question
  form, its `## Question` reading "Commit `<that sha>` amended the package
  for question `<id>` and has no ruling; take its amendment out as
  current-state text.", file it, and start that fork first. `<id>`'s fork
  waits until `unrule-<id>` is routed. Then start `<id>`'s adjudication
  fork again.
- **Merge reviews.** For each `## Integration` merge line with neither a
  `No drift @ <sha>` line nor a `merge-<unit-slug>-<short-sha>` question,
  start its merge-review fork.

Then run one beat (`## Supervision`, Heartbeat), which starts the
heartbeat timer if anything can move, post your partner one summary of the
true state (not a question), and continue from whichever phase the ledger
shows incomplete.

## Phase 1 — Package intake

The package comes from a supersonic:supercomposer session, committed in the
package worktree on the integration branch `superconductor/<design-slug>`.
Before the first admission, verify it is complete:

- Design doc and specs may be markdown (`.md`, composed before supersonic
  0.4.0) or HTML (`.html`); check the required sections by heading in either.
- Design doc with every required section, including the **traceability
  table** (every model-doc claim → interface row / spec, or a
  dropped/narrowed/deferred entry bearing partner sign-off) and the
  **coverage table** (every system-inventory item surveyed or excluded).
- Specs committed, interface rows and global constraints embedded verbatim;
  the fresh-eyes fidelity + delegation checks recorded as run.
- Interface-table rows marked *model commitment* vs *decomposition choice*.
- The build graph at `docs/superpowers/design/<design-file-stem>-build-graph.md`:
  one table with columns `unit | implements (spec §) | writes | needs rows |
  produces rows others wait on`, a `contracts` unit, and a
  `Longest chain:` line.
- The ledger's `Package worktree:` and `Build graph:` lines, and at least
  one checkpoint id under `## Checkpoints`.

Anything missing → back to supersonic:supercomposer; do not patch it here.

**Operator commands.** Resolve these once, at intake, and ledger them
as header lines below `Build graph:`:

- `SDD scripts: <absolute path>`: the `scripts/` directory of the installed
  superpowers `subagent-driven-development` skill. It is the `installPath`
  of the `superpowers` entry in `~/.claude/plugins/installed_plugins.json`
  followed by `/skills/subagent-driven-development/scripts`; check that
  `sdd-workspace`, `task-brief` and `review-package` are in it. SDD runs
  each as `bash <absolute path> ...`.
- `HTML scripts: <absolute path>`, only when `superpowers-html:html-docs` is
  among your available skills: the `installPath` of the `superpowers-html`
  entry in the same file followed by `/bin`; check that `task-brief` and
  `superpowers-html` are in it. An operator running an `.html` plan calls
  these in place of SDD's `task-brief`.
- `Project commands: <commands>`: the project's own test, build, lint and
  install commands, taken from its CLAUDE.md and its package scripts (for
  example `npm test`, `npx vitest`, `npm install`), never from a plan.

**Your own commands.** A permission prompt in this session waits on your
partner and so unbounds every wait in this skill. Everything the heartbeat
and the fork time limit do runs through `sh <skill dir>/beat.sh`, and the
budget through `sh <skill dir>/budget.sh`; the rest is `git`, `claude
agents`, `claude stop`, `env -C` (operator launches),
and `python3` (the checkpoint id). If a prompt appears for one of these, ask your partner once
to allow them for this project; the plugin README gives the entries.

**Comprehension gate — once, before the first admission** (and again before
any cutover-class step): dispatch a fresh agent to write an "explain the
system the package describes" doc and diff it against the source model
documents. Each finding is a question for a composer fork and enters the
frame-defect tally. Per-task review compares
work against briefs; only a whole-system reading catches the drift briefs
inherit.

**Trust check.** The first operator you start (Phase 2) is the check:
`claude --bg` refuses to start in a repo whose workspace trust prompt has
never been accepted interactively. If it is refused, tell your partner
plainly: "`claude --bg` refused to start in <repo>: the repo needs trusting
once. Open `claude` in <repo>, accept the trust prompt, exit, and tell me to
continue." Ledger it and start nothing else until they do.

## Phase 2 — Admission

There is no batch boundary. Re-derive what can start every time state
changes: at intake, after every merge (a row report's or a `complete`'s),
when an operator finishes or stops, and when the band changes.

- **A row has merged** when the commit that delivers it is on the
  integration branch: the `contracts` unit's merge for contract rows, a row
  report's merge for the row it names, or a unit's `complete` merge for
  every row its `## Units` line lists under `produces:`. After a hand-back,
  a row belongs to the sibling that runs the task delivering it, so only
  that sibling's merge counts. The ledger's `## Integration` lines are the
  record: a later `unmerged row <row id>` line (a replacement cut the task
  that delivered it) means the row has not merged until a newer merge line
  names it again.
- **A unit is ready** when every row in its build-graph `needs rows` cell
  has merged.
- **Admit every ready unit** the band allows: start its operator with
  `Admitted: yes`, or send the admit message to its planning operator.
- **Start planning-only operators for units that are not ready**, with
  `Admitted: no`: they write their plan against the contracts while their
  rows are built, send `plan ready`, and wait for the admit message.

**Budget band.** Before every start or admission, run this skill's
`budget.sh`. Its last line is `BAND: low|middle|high — <reason>`. The
thresholds are set once, at the top of `budget.sh`: `LOWER=70`, `UPPER=90`,
`N=2`.

| `BAND:` | Usage (the higher live window) | You do |
|---|---|---|
| `low` | below `LOWER` (70%) | Start an operator for every ready unit and a planning-only operator for every unit not ready. |
| `middle` | `LOWER` to `UPPER` (70–90%), or the data is missing, unreadable or stale | At most `N` (2) operators running, planning-only operators included. Start a new one only when one finishes or stops; ready units go before planning-only ones. |
| `high` | `UPPER` (90%) or above | Start no operator and admit no planning operator. Running ones finish their unit. Wait for the reset (below). |

**Waiting for the reset.** When the band is `high` and any unit is
deferred, the reset is a deadline for the one heartbeat timer
(`## Supervision`, Heartbeat): the reset time `budget.sh` reports for the
window at or above `UPPER` (its `resets <time> (in <h>h<mm>m)` on that
window's line). The timer sleeps until the nearer of the reset and the next
beat, or until the reset alone when nothing else can move (Heartbeat);
when it exits, the beat runs `budget.sh` and re-derives admission. If
that line gives no reset time you can read, the next beat is the next
event: each beat runs `budget.sh` again, and until a reset time is readable
apply the `middle` band's rule.
This wake has real work behind it, deferred units to start, so it is not a
keep-warm ping (`## Context economics`).

- An operator counts as running from its start until its unit is
  `complete` or `stopped`; a planning-only operator counts too. A completed
  operator that stays warm for fix rounds does not count. A restart or a
  relaunch keeps the unit's status and its slot. A unit stopped on the
  third rung of the ladder (`## Supervision`, Operator death) no longer
  counts, so in the `middle` band its slot goes to the next unit.
- Composer forks are exempt: a ruling or merge review is small, and
  withholding it stalls operators already paid for.
- Restarting a dead operator, or replacing a stopped one under the same
  name, is not a new start: the running count stays the same, so it goes
  ahead in every band, `high` included.
- The band is applied, not proposed: never ask your partner to choose
  scope or approve a start. Units the band holds back are `deferred` in the
  ledger, and the next merge summary states the band.

**Operator tier.** Choose each operator's model per unit when you start it:
default to the top operator tier; lower it only when the unit is genuinely
mechanical (few interface rows, no greenfield judgment, no cross-subsystem
consumption). Your partner may set or override tiers. Record every choice
in the unit's ledger line: `model <model> — rationale: <complexity
signal>` — the rationale is what lets the heuristic be audited against the
result.

> **INVARIANT: budget state MUST NOT be an input to tier selection.** Tier
> is a function of task demand alone. Budget buys *when*, never *what* —
> when budget is short, wait; never run the same work at a lower tier.
> Degraded output is paid for in cleanup and refactor work, which costs
> more than the tokens saved.

**Starting an operator.** First check what a conductor that died may
already have done. If `claude agents --json` lists
`<design-slug>-<unit-slug>` and not in state `failed`, start nothing: never
a second session under a live name. A `failed` entry under that name is
stopped first (`## Supervision`, Stopping an operator). If `git -C <project> worktree list` lists its worktree, step 1
is done: go on from step 2.

1. **Worktree.** `git -C <project> worktree add
   <project>/.claude/worktrees/<design-slug>-<unit-slug> -b
   <design-slug>-<unit-slug> superconductor/<design-slug>`: the integration
   branch's head carries every row merged so far. `claude --bg` starts only
   in the trusted repo and its `.claude/worktrees/*` children.
2. **Assignment file.** Write `<ledger dir>/assignments/<unit-slug>.md`: the
   full verbatim contents of `operator-briefing.md`, then:

       ## Your assignment
       - Name: <design-slug>-<unit-slug>
       - Conductor: <design-slug>-conductor
       - Ledger: <ledger path>
       - Package worktree: <package worktree>
       - Your worktree: <unit worktree> (you are already in it)
       - Unit: <unit-slug>
       - Implements: <the unit's implements (spec §) cell>
       - Writes: <the unit's writes cell>
       - Needs rows: <row> (merged at <sha>), <row> (not merged yet), ...
       - Produces rows others wait on: <rows, or none>
       - Plan: none | <plan path> at <sha>, tasks <numbers> (already written)
       - Siblings: <session names, or none>
       - Admitted: yes|no
       - Replaces: none | an earlier operator; kept commits <base sha>..<kept sha> stand and are not redone; superseded plan <plan path>
       - Permission mode: acceptEdits
       - Allowed git commands: git add, git commit, git rev-parse, git log, git diff, git status, git show, git merge, git merge-base, git branch, git rm
       - Allowed SDD scripts: bash <sdd scripts dir>/sdd-workspace, bash <sdd scripts dir>/task-brief, bash <sdd scripts dir>/review-package
       - Allowed project commands: <project commands>
       - Allowed for waiting: sleep (run in the background), TaskStop, sh <skill dir>/beat.sh changed

   If `superpowers-html:html-docs` is among your available skills, also add
   the line `- Before superpowers:writing-plans, load superpowers-html:html-docs.`
   and add `bash <html scripts dir>/task-brief, python3 <html scripts dir>/superpowers-html`
   to `Allowed SDD scripts:`. Otherwise the assignment is unchanged.

3. **Ledger** the unit line (`## Units`) before the launch, then run `sh
   <skill dir>/beat.sh <ledger dir> launching <unit-slug>`, which forgets
   any earlier operator's session id, so a death before step 5 never
   reads the wrong transcript. The line has status
   `launching` and `start <sha>`: `git -C <unit worktree> rev-parse HEAD`
   just before the first launch, after any bring-up-to-date merge, so a
   branch that is brought up to date (a hand-back sibling's) is merged
   before this step; a replacement in an existing worktree keeps the
   `start` it has.
4. **Launch**, as one Bash call:

       env -C "<unit worktree>" claude --bg -n <design-slug>-<unit-slug> --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Edit,Skill,Agent,SendMessage,TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,TaskStop,Bash(sleep:*),Bash(sh <skill dir>/beat.sh changed:*),Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(git show:*),Bash(git merge:*),Bash(git merge-base:*),Bash(git branch:*),Bash(git rm:*),Bash(bash <sdd scripts dir>/sdd-workspace:*),Bash(bash <sdd scripts dir>/task-brief:*),Bash(bash <sdd scripts dir>/review-package:*),Bash(<project command>:*)" --add-dir="<ledger dir>" "$(cat <ledger dir>/assignments/<unit-slug>.md)"

   - `env -C` sets the session's cwd for that one command. A `cd` in a
     separate call persists only inside this session's working
     directories, so it can silently not take effect.
   - `--allowedTools="..."` and `--add-dir="..."` keep their equals sign:
     both flags are variadic, and without `=` they swallow the prompt and
     the session starts empty.
   - `<sdd scripts dir>` is the ledger's `SDD scripts:` path. The entry
     form `Bash(bash <absolute path>:*)` matches SDD's
     `bash <absolute path> <args>` calls; it is the form the live drill
     verified.
   - `Bash(<project command>:*)` is one entry per command on the ledger's
     `Project commands:` line. Add `Bash(jev:*)` when `superpowers-jev` is
     installed. Add `Bash(bash <html scripts dir>/task-brief:*)` and
     `Bash(python3 <html scripts dir>/superpowers-html:*)` when the ledger has
     an `HTML scripts:` line; `<html scripts dir>` is that path. A tool call
     outside the list stalls about two minutes and then fails: the operator
     sends `need command` (`## Supervision`), and you relaunch it with a
     longer list (below) when the command belongs to its unit's work.
   - `TaskStop`, `Bash(sleep:*)` and `Bash(sh <skill dir>/beat.sh
     changed:*)` are how the operator waits on its own implementers and
     reviewers: it dispatches them in the background, waits in bounded
     stretches of background `sleep`, asks `beat.sh changed` whether
     anything in its worktree changed during a stretch, and stops a leaf
     that outlives its bound (`operator-briefing.md`). The entry admits
     only the `changed` command.
   - **Relaunching with a longer list.** Add the command to the ledger's
     `Project commands:` line. Stop the operator by its short id
     (`## Supervision`, Stopping an operator), run `claude agents --json`
     until its name is no longer listed, set its assignment's `Plan:` line to
     the plan it already has (as for a restart, `## Supervision`, Operator
     death), ledger the relaunch with `sh <skill dir>/beat.sh <ledger dir>
     relaunched <unit-slug>` (it appends `- relaunched <unit-slug>` under
     `## Supervision` and forgets the old session id), and launch it with this step's command and the longer list, same name,
     worktree and model. Then record its session (step 5's `launched`), run
     `sh <skill dir>/beat.sh <ledger dir> seen <unit-slug>` and send it again what it was sent (Heartbeat, Resends),
     which ends with its `resent to` line; until then the report shows it
     `restart pending`, and a death in between launches it again with no
     rung. A relaunch
     is not a death: it is no rung of the ladder, the unit keeps its
     status, and it keeps the running count.
   - `--add-dir="<ledger dir>"` declares the one directory outside the
     worktree the operator writes: its question files.
5. **Ledger** the unit line again with its status, `planning` when its
   assignment says `Admitted: no` and `admitted` otherwise, and its `## Cost`
   start: the timestamp and the `SEVEN_DAY` percentage from the `budget.sh`
   run. Then record its session: `sh <skill dir>/beat.sh <ledger dir>
   launched <unit-slug>` looks at `claude agents --json` `LAUNCH_TRIES`
   times `LAUNCH_WAIT` seconds apart (set at the top of `beat.sh`: 3 tries
   over 20 seconds) and stores the session id only if the session is alive
   at the last look and never failed in between: a session that cannot
   start is listed at once and then turns `failed`. A session that never
   appears or fails is a failed start: `launched` ledgers `- launch failed
   <unit-slug>`, which ends the launch, and the next beat finds the unit
   dead and puts it on its next rung (Operator death). A session that comes
   up after that line is owed its resends like any restart. If it says the session list is
   unreadable, run it again later. Then start its beat file, `sh <skill dir>/beat.sh <ledger dir> seen
   <unit-slug>`, and start the heartbeat timer if none is running
   (`## Supervision`, Heartbeat).

**Bringing a branch up to date.** Before you ledger and launch a hand-back
sibling (Starting an operator, step 3), and before you launch a
replacement or a restart into an existing branch, run `git -C <unit
worktree> merge --no-ff --no-edit superconductor/<design-slug>`, so the
branch holds every row its `Needs rows` line calls merged. Every merge of
the integration branch into a unit branch is `--no-ff`, yours and the
operator's (`operator-briefing.md`): a fast-forward would put the
integration branch's own commits on the unit's first-parent line, and the
revert of cut work (`## Composer forks`, Replacing an operator, step 4)
would take them out too. If the merge does not complete
(a conflict, or uncommitted changes in the way), run `git -C <unit worktree>
merge --abort` if a merge is in progress, launch anyway, and send the
operator the mechanical ruling `Merge superconductor/<design-slug> into your
branch before your next task; it did not merge cleanly here. Go on with your
next task.`

## Supervision

**Messages are hints; the heartbeat reads state.** A message can be lost:
its sender may have named a session that is gone, or you may have died
before acting on it. So every message speeds up something the heartbeat
also finds. Set `notify_when_idle` on every message you send an operator:
an idle notice with no operator message behind it gets the status ask at
once, rather than at the next beat. It is an optimisation only; the live
drill recorded no idle notice from a `--bg` session, so nothing waits on
one.

**Heartbeat.** `sh <skill dir>/beat.sh` holds the heartbeat's constants,
set once at its top: `BEAT=600` seconds, `STALL_BEATS=1`, and the forks'
`FORK_LIMIT=2700`. It reads state and prints facts; it sends nothing and
decides nothing. You act on its lines, and you never count ledger lines
yourself for anything it prints.

- **When it runs.** Keep exactly one heartbeat timer while something can
  move without your partner: a unit the report shows `movable yes` that is
  not held entirely on a question that waits for your partner, or a fork
  that is running. Then the timer sleeps `BEAT` seconds, or until the
  summary's `next-reset` or a high-band reset (Phase 2, Waiting for the
  reset) when that is nearer. When the only thing left is units waiting on
  a reset (`next-reset`) or deferred units waiting on a readable band
  reset, it sleeps until the nearer reset; when the band's reset is
  unreadable, `BEAT`. When nothing can move, start no timer: your
  partner's next message is the next event. Whenever you start an
  operator or a fork, send a fix round, or wake to a message, start the
  timer if none is running and something can move. Other wakes do not
  reset a running timer.
- **The timer** is one background Bash command whose exit wakes you: `sh
  <skill dir>/beat.sh <ledger dir> timer <seconds>`. Its pid and deadline
  are in `<ledger dir>/timer`, and the report's `timer` line says whether
  it runs. For a nearer deadline, `sh <skill dir>/beat.sh <ledger dir>
  stop-timer` and start the shorter one; the exit of a timer you stopped is
  not a beat. Phase 0's `resume` stops the last conductor's timer.
- **A beat** is one command, `sh <skill dir>/beat.sh <ledger dir>`, then
  the actions its lines call for, then the next timer. A beat with nothing
  to do is two tool calls whatever the number of units; each finding adds
  the calls its action takes. Each action checks the ledger or git before
  it acts, so a beat cut short by a death is simply run again, and a beat
  ledgers only the lines of what it changed. The report, one line each,
  then a summary line:

      unit <unit-slug> status <status> session alive|absent|unknown evidence yes|no|new quiet <minutes> ask none|due|open|overdue asked <minutes>|- plan yes|no fixround open|none rung <n> investigated yes|no restart pending|none wait none|until-<epoch>|over movable yes|no
      row <unit-slug> <row id> task <N> head <sha7>
      transcript <unit-slug> <path>|none
      fork <fork name> running|gone|unstarted failures <n>
      question <id>
      timer running|none deadline <epoch>|-
      beat: sessions ok|unknown watched <n> absent <n> evidence <n> due <n> overdue <n> rows <n> forks running <n> gone <n> fixrounds <n> deferred <n> questions <n> waiting <n> next-reset <epoch>|- movable <n> timer running|none

  - A `unit` line is printed for every watched unit: planning, admitted,
    or with an open fix round (a `- fix round <unit-slug>` line under
    `## Integration` with no later `merged <unit-slug>` line). Its worktree
    is the one its `## Units` line names (`worktree <path>, start`), else
    `<project>/.claude/worktrees/<design-slug>-<unit-slug>`.
  - `sessions unknown` in the summary, and `session unknown` on every unit
    line: `claude agents --json` failed or printed no list. Handle no death
    and no stall on this beat; everything else on the report stands.
  - Alive means listed under its name and not in state `failed`; `beat.sh`
    uses that one definition everywhere. `session absent`: its name is not
    in the session list. `session failed`: it is listed in state `failed`,
    which is how a session that could not start stays listed. Either way it
    is dead (Operator death, below), unless it is waiting for a reset.
  - `evidence`: progress since its beat file,
    `<ledger dir>/assignments/<unit-slug>.beat`, was last written: its
    branch head moved, or a file in its worktree outside `.git` and
    `node_modules` changed (an edit, an SDD ledger line, a report). On
    evidence the report rewrites the beat file; `new` means it had none.
    A message from the operator is evidence too: when you handle one, run
    `sh <skill dir>/beat.sh <ledger dir> seen <unit-slug>`, which rewrites
    the beat file at once.
  - `quiet`: minutes since the beat file was written.
  - `ask due`: no evidence for `STALL_BEATS` × `BEAT` (10 minutes), no ask
    open, and progress is expected (not a planning unit whose plan is
    ledgered, not waiting for a reset). Send the status ask, then `sh
    <skill dir>/beat.sh <ledger dir> asked <unit-slug>`, and ledger `-
    status asked <unit-slug>`. Skip a unit every one of whose unfinished
    tasks is held by a question with no `routed <id>` line. An ask is open
    until the next evidence.
  - `ask overdue`: the ask is a beat old with no evidence and no reply. It
    is stalled (Operator death, below). The session list's own status
    fields do not tell a working session from an idle one, so the report
    does not read them.
  - `rung`: the rung of the ladder its next death or stall is on (Operator
    death).
  - `investigated yes`: an investigation for this rung is ledgered (an `-
    investigated <unit-slug>` line with no later `restarted` line).
  - A `transcript` line, for a unit on rung 2 or higher: a file in the
    ledger dir, `<ledger dir>/assignments/<unit-slug>.tail`, holding the
    last `TAIL_LINES` lines, within the last `TAIL_BYTES` bytes, of the
    transcript of its last confirmed session
    (`~/.claude/projects/<project dir>/<session id>.jsonl`, by the id
    `launched` recorded, refreshed on every beat the session is listed).
    The copy keeps the investigation inside the project and ledger dirs.
    `none` when there is no recorded id or no such transcript.
  - `restart pending`: its newest `restarted` or `relaunched` line has no
    `- resent to <session name>` after it, and no `- launch failed
    <unit-slug>` (or there is one but the session is alive after all).
    Alive, it is owed its resends (below). Dead, the launch was never seen
    through (Operator death).
  - `wait until-<epoch>`: it waits for a usage reset; it is not asked, not
    dead, and cannot move. `wait over`: the reset has passed; restart it
    (Operator death, usage limit).
  - `movable no`: it waits for a reset, or it is a planning unit with its
    plan ledgered whose needed rows no planning or admitted unit produces.
  - A `row` line: the unit's SDD ledger,
    `<unit worktree>/.superpowers/sdd/*/progress.md`, has `Task <N>:
    complete (commits <base7>..<head7>` for the plan task whose text says
    `Delivers row <row id>` (`operator-briefing.md`, step 3), and no merge
    has delivered that row. Handle it as the message `row <row id> passed
    review at <head7> on <branch>`, with the full sha from `git -C <unit
    worktree> rev-parse <head7>`, but only while no amending fork runs and
    no ruling is being routed (`## Composer forks`, One writer); otherwise
    the next beat finds it again.
  - A `fork … gone` line: a fork attempt with a `started` line and no
    `exited` line whose process group is no longer listed. Handle it as
    When a fork exits (`## Composer forks`). `fork … unstarted`: its
    `started` line was ledgered but the attempt never ran (no `.pid`
    file); start it, as Starting a fork says, under the same name; it is
    no failure. `failures` counts the `no output` exits of all attempts of
    that fork.
  - A `question` line: a file in `<ledger dir>/questions/` with no
    `## Questions` line. Handle it as the `question` message.
  - `deferred` in the summary: if any unit is deferred and the band was
    `high`, run `budget.sh` and re-derive admission (Phase 2).
- **Resends.** Send the session again, in ledger order, every ruling
  relay (`relayed <id> to <session name>`) and sibling notice (`notified
  <session name>: ...`) the ledger records for it, and the fix-round
  message of its open `fix round` line, then append `- resent to <session
  name>`, also when there was nothing to send: that line is what marks the
  restart seen through. All are current-state text, so a second copy
  changes nothing.

So a silent operator is asked 10 to 20 minutes after its last evidence and
handled as stalled one beat later: 20 to 30 minutes.

**Messages operators send you** (`operator-briefing.md`, `## Progress`).
Every message from an operator is progress evidence: when you handle it,
run `sh <skill dir>/beat.sh <ledger dir> seen <unit-slug>`. An operator sends a message
again when a send fails and when the resume status ask asks it to, so act
on each only for what the ledger does not already show done: a row whose
`merged` line exists, a question `## Questions` lists, a hand-back whose
sibling is on `## Units`, a `complete` already ledgered.

| Message | You do |
|---|---|
| `plan ready: <plan path> at <sha>` | If `<plan path>` is the superseded plan its assignment's `Replaces:` line names, send the mechanical ruling `Write your plan at a new path, git add it, git rm the old path and commit; SDD keys its workspace to the plan's path. Go on by sending plan ready again.` Otherwise ledger `- plan <unit-slug>: <plan path> at <sha>` under `## Supervision`. Admit the unit when its rows have merged and the band allows. |
| `row <row id> passed review at <sha> on <branch>` | Merge the branch up to `<sha>` (`## Integration`). Once the merge passes its tests, start a merge-review fork, then re-derive admission (Phase 2) and admit every unit that was waiting only on rows now merged. The reporting operator keeps building. |
| `hand-back: tasks <numbers> of <plan path> at <sha>; files <paths>; needs rows <ids>` | Start a sibling operator for those tasks under the band (Hand-back siblings, below). |
| `question <id>: <path>` | Ledger it under `## Questions` and start an adjudication fork on it (`## Composer forks`). Send the operator nothing about the design until the ruling exists. |
| `complete: <branch>, ...` | Merge the branch (`## Integration`). Once the merge passes its tests, start a merge-review fork, ledger `complete` and the `## Cost` finish, then re-derive admission. |
| `status: plan <plan path> at <sha> \| none; passed review through task <N> \| none; working on task <N> \| none; held on <question ids, command <command>, admission, or nothing>` | The reply to a status ask. Ledger a plan not yet ledgered, as for `plan ready`. A held question with no `## Questions` line is a `question` message, from its file; one with a `routed <id>` line gets its ruling relay again. A held command is a `need command`. Admission: admit the unit when its rows have merged and the band allows. |
| `need command: <command> for task <N>` | A permission denial. If the command belongs to the unit's work (a project test, build, lint or install command, or a git command), relaunch the operator with it (Phase 2, Relaunching with a longer list). Otherwise send the mechanical ruling naming the allowed command that does the job, or file a question `from <unit-slug>` if none does. |
| Anything else | A message that asks nothing (an acknowledgement, a report) is progress evidence only. A mechanical ask (which branch, which worktree, which test command) gets the mechanical ruling. Any other ask is handled as a `question`: if it names a question file, that is the question; if not, write `<ledger dir>/questions/conductor-<k>.md` from it, quoting the message under `## Question` and its sender under `## Blocking`, and ledger it `from <unit-slug>`, so its ruling relay goes to that operator. |

**Hand-back siblings.** For each `hand-back` from unit `<unit-slug>`:

1. Read the handed-back tasks in the plan as it was at `<sha>`
   (`git -C <unit worktree> show <sha>:<plan path>`) and find which of the
   unit's `produces:` rows they deliver.
2. Start the sibling as a unit `<unit-slug>-<k>` (Starting an operator),
   with its worktree branched from `<sha>` instead of the integration
   branch, so the plan is already in it. Its assignment: `Implements: tasks
   <numbers> of <plan path>`, `Writes: <paths>`, `Needs rows: <ids>` from
   the hand-back, `Produces rows others wait on:` the rows from step 1,
   `Plan: <plan path> at <sha>, tasks <numbers> (already written)`, and
   `Siblings:` the session names of `<unit-slug>` and its other siblings.
   Bring its branch up to date (Phase 2, Bringing a branch up to date)
   before Starting an operator, step 3, ledgers its `start`.
3. In the ledger, add the sibling's `## Units` line with those rows under
   `produces:`, and remove them from `<unit-slug>`'s line.
4. Send `<unit-slug>`'s operator, and every earlier sibling, the sibling
   notice (below), and ledger each under `## Supervision` as `- notified
   <session name>: sibling <sibling name>`; skip a send that line records.

Siblings may message each other by name, but nothing depends on it: their
lanes share no dependency edge and no file, rows reach them only through
you, and the heartbeat reads each sibling's progress from its own branch
and SDD ledger.

**Mechanical rulings stay with you**: which branch to merge from (always
with `--no-ff`, never a rebase), which worktree to use, which test command
to run. Answer them by message. Everything about the design goes to a composer fork.

**Messages you send** — current state only, each ending in its ask:

| When | Message |
|---|---|
| Admitting a planning operator | `You are admitted: rows <ids> merged into superconductor/<design-slug> at <sha>. Merge superconductor/<design-slug> into your branch, then build from step 6 of your briefing.` |
| Sibling notice (after a hand-back) | `<sibling name> now runs tasks <numbers> of <plan path> and owns rows <ids, or none>; do not report those rows. Message <sibling name> by name when your lanes need to coordinate, never hold a task waiting on its reply, and carry on with your own tasks.` |
| Status ask (a quiet unit, or idle without a report) | `Status check from <design-slug>-conductor. Reply to <design-slug>-conductor by name with your status line.` |
| Resume status ask (Phase 0) | `Status check from <design-slug>-conductor after a restart of the conductor. Reply to <design-slug>-conductor by name with your status line, then send again every hand-back, question and complete you have sent; I skip what I already have.` |
| Ruling relay (a unit listed as `clarification`, or the operator that asked), when the ruling's `Package commit` is `none` | `Ruling <id>: the spec now says <the ruling's ## Ruling sentences>. Re-read <file> § <section> in <package worktree>; the spec states the answer, so do not open the ruling file. Bring the tasks you have not started into line with it, release any task question <id> held, and carry on.` |
| Ruling relay, when the ruling's `Package commit` is not `none` | `Ruling <id>: the spec now says <the ruling's ## Ruling sentences>. Re-read <file> § <section> in <package worktree>; the spec states the answer, so do not open the ruling file. Merge superconductor/<design-slug> into your branch first, then bring the tasks you have not started into line with it, release any task question <id> held, and carry on.` |
| A mechanical ruling | `<the answer>. Go on with <task>.` |
| A fix round | `Merging <branch> at <sha> into superconductor/<design-slug> fails: <one line>; output at <path>. Merge superconductor/<design-slug> into your branch, fix it with the usual review, then send the same report again.` |

A ruling reaches an operator as what the spec says now and where to re-read
it. Never write a diff from the old approach ("no longer", "instead of",
"was"), never quote the old text, and never point the operator at the
ruling file as its instruction: the spec in the package worktree is the
authority.

- **Anything the specs do not answer goes to a composer fork**, however
  obvious the answer looks: an operator's question, an interface change
  request (any change to an interface row, model commitment or
  decomposition choice), a requirement contradiction, a scope change (cut
  or add), a BLOCKED task whose resolution changes the design, and a
  drift a merge review finds. You hold the spine, not the package; the fork
  holds the whole package and the reasons behind it. File what you hit
  yourself as a question (`## Composer forks`). The operator holds only the
  tasks the question blocks; you pause nothing.
- **A discovered unmodeled subsystem is a frame event, never extra scope.**
  A binding, store, table family, or consumer the design doc does not model
  is a question for a fork, which amends the package to model it. Never
  absorb it as additional tasks on a running unit.
- **Frame-defect tally.** Tag every question with a short defect-class slug
  in the ledger. **The third same-class instance is a tripwire**: when the
  fork that rules on the question that brought the class to three exits,
  build a new checkpoint (`## Composer forks`, Re-checkpointing) and post
  your partner one line, `Defect class <slug> has reached 3 (<ids>); rulings in
  rulings/; new checkpoint <id>; nothing waits on you.` It is not a
  stop: questions of that class keep going to forks. Seven independent
  rediscoveries of one missing declaration is a design defect wearing an
  implementation costume.
- **A ruling that changes a unit's approach replaces its operator.** When a
  ruling names a unit's first task that no longer holds, stop that operator
  and start a fresh one on the amended spec (`## Composer forks`,
  Replacing an operator); for a unit with hand-back siblings, that replaces
  the whole family. Never send the warm operator the change: an
  operator that lived through the old approach writes it into the code. A
  `clarification` goes to the warm operator as the ruling relay.
- **Operators stay warm through review.** A completed operator is not
  stopped: fix rounds, review findings, and integration breakage on its
  unit go to it by name first (a cold fix round costs ~3.7× per line).
  Start a fresh one from its assignment file only when its name is absent
  from `claude agents --json`, or when a ruling changes its approach.
- **Stopping an operator.** `claude stop <id>`, where `<id>` is the short
  `id` field of its entry in `claude agents --json`, found by name. Never
  pass the name or the full `sessionId`; neither works. Ledger the unit
  `stopped` only when it will not be restarted: the ladder's third rung
  and the end of the run. A stop for a restart or a relaunch is recorded by
  that `restarted` or `relaunched` line, and the unit keeps its status; a
  replacement ledgers `replaced (ruling <id>)`.
- **Surface to your partner** only a refused trust check, a unit stopped on
  the ladder's third rung (with the investigation's finding), and a fork
  that failed twice (`## Composer forks`, When a fork exits): those wait on
  them. Post a one-line notice that asks nothing when a tripped tally
  re-checkpoints, and when an investigation found no cause. Rulings need no
  notice: your partner reads `rulings/` afterwards.
- **Routine progress** reaches your partner as merge summaries
  (`## Integration`), not as questions.
- **Operator death.** A unit the report shows `session absent` or
  `session failed` (and not waiting for a reset) is dead; one it shows `ask overdue` is stalled. On a
  beat whose summary says `sessions unknown`, handle neither. If the unit
  also shows `restart pending`, its last restart or relaunch was ledgered
  but never seen through: launch it again from step 4 below, with no new
  rung. Otherwise deaths and stalls climb one ladder, and the report's
  `rung` field is the rung this one is on. The ladder starts again at each
  merge from the unit and at each replacement of its operator; `beat.sh`
  keys every restart line it writes to both, so you never count lines or
  copy a key yourself. For a stall, first ledger `- stalled <unit-slug>`
  and note its short id; the operator is stopped in step 1 below.

  - **Rung 1: restart**, with cause `death` or `stall`.
  - **Rung 2: investigate, apply the remedy, restart.** If the report shows
    `investigated yes` (an investigation the last conductor finished), apply
    the remedy its ledger line names. Otherwise dispatch one fresh agent and
    wait for its one-line answer, so the transcript stays out of your
    context: `Find why operator <session name> stopped making progress.
    Read <the report's transcript file> (the end of its transcript, JSON
    lines: its last tool calls, tool results and errors). If that is none, read git -C <unit worktree>
    status, git -C <unit worktree> log -5 --stat and the last 40 lines of
    <unit worktree>/.superpowers/sdd/*/progress.md instead. Either way also
    read the output of sh <skill dir>/beat.sh <ledger dir> strays
    <unit-slug>. Change nothing. Reply
    with exactly one line: cause: denied command <command> | usage limit |
    hung process <the command line it ran, as the transcript shows it> |
    defect <the task and what it keeps hitting> | unknown.` It reads only, so a death mid-investigation just dispatches
    it again. Write its answer, as given, to `<ledger dir>/assignments/<unit-slug>.cause`
    with the Write tool, ledger `- investigated <unit-slug>: <cause> —
    <remedy>`, then apply the remedy, and restart with the cause named:
    - denied command (`denied-command`): add it as Phase 2, Relaunching
      with a longer list, says, and launch with the longer list;
    - usage limit: not a death, and no restart yet. If its name is listed
      (a stall, or a `failed` entry), stop it first (Stopping an operator) and wait until it is
      no longer listed. Then run `sh <skill dir>/beat.sh <ledger dir> wait
      <unit-slug> <minutes>`, with the
      minutes until the reset `budget.sh` reports. The unit then shows
      `wait until-<epoch>`: it is not watched and the summary's
      `next-reset` sets the timer. At `wait over`, restart it with cause
      `usage-limit`, which climbs no rung;
    - hung process (`hung-process`): after step 1, `sh <skill dir>/beat.sh
      <ledger dir> kill-strays <unit-slug>`, which reads the command line
      from the `.cause` file (never through a shell) and stops only
      processes whose command line contains that text,
      whose working directory is in the unit's worktree and which have no
      terminal, found again at the time it runs, never by a remembered pid.
      With no command named, it kills nothing: treat the cause as
      `unknown`;
    - defect (`defect`): file it as a question (`## Composer forks`,
      Questions) `from <unit-slug>`, and after the restart send the
      operator the mechanical ruling `Question <id> holds task <N>; work on
      your other tasks until its ruling reaches you.`;
    - unknown (`unknown`): post your partner a one-line notice that asks
      nothing.
  - **Rung 3: stop.** Do not restart. If its name is listed (a stall, or a
    `failed` entry), stop
    it (Stopping an operator) and wait until it is no longer listed. Ledger
    `- stopped <unit-slug>: rung 3` under `## Supervision` and the unit
    `stopped` under `## Units`, and surface it to your partner with the
    rung-2 finding.

  To restart, with the same name, worktree and model:
  1. If its name is listed (a stall, or a `failed` entry, which may keep the
     name taken), stop it (Stopping an operator) and run `claude agents
     --json` until its name is no longer listed.
  2. Refresh its assignment file: `Needs rows` with current merge shas,
     `Admitted` as the ledger has it, and `Plan:` naming the plan it
     already wrote, `<plan path> at <sha>, tasks <the unit's tasks, minus
     any handed back> (already written)`. Take the repo-relative path from
     the `plan-path` file of the unit's SDD workspace (`<unit
     worktree>/.superpowers/sdd/*/plan-path`) or from its `plan ready`
     ledger entry, and the sha from `git -C <unit worktree> log -1
     --format=%H -- <plan path>`. Name only a plan file present at the
     branch head (`git -C <unit worktree> cat-file -e HEAD:<plan path>`),
     and never the superseded plan its `Replaces:` line names: that plan
     stays at the branch head until the fresh operator's first commit
     deletes it. Once `Plan:` names a plan, set `Replaces: none`: the
     replacement work is in that plan. If no plan qualifies,
     `Plan:` stays `none` and `Replaces:` stays as it is.
  3. Ledger the restart before the launch: `sh <skill dir>/beat.sh <ledger
     dir> restart <unit-slug> <cause>`, which appends `- restarted
     <unit-slug>: <cause>, rung <n>, since <key>` under `## Supervision`
     and prints it.
  4. Bring its branch up to date (Phase 2, Bringing a branch up to date)
     and launch it (Phase 2, Starting an operator, step 4), unless its name
     is listed.
  5. Record its session (`sh <skill dir>/beat.sh <ledger dir> launched
     <unit-slug>`, as Phase 2, Starting an operator, step 5, says; a
     session that never appears ends here with `launch failed`, and the next
     beat puts the unit on its next rung), run `sh
     <skill dir>/beat.sh <ledger dir> seen <unit-slug>` and send it its
     resends (Heartbeat, Resends), which end with its `resent to` line;
     its assignment already carries its admission, and it keeps its status.

  SDD's ledger makes mid-plan resume cheap. A restart keeps the running
  count, so it goes ahead in every band.

## Composer forks

You rule on nothing the specs do not answer. Each such question goes to a
one-shot fork of the composer checkpoint, which rules alone, rewrites the
package as current state, writes its ruling file and exits; you route the
outcome. The prompts and command lines are in this plugin's
`skills/supercomposer/composer-forks.md`, under `## Checkpoint`,
`## Adjudication fork`, `## Merge-review fork` and `## Build-graph fork`.

**Starting a fork.** Copy the section's prompt into `<ledger
dir>/prompts/<fork name>.md` and fill every placeholder. The fork name is
`rule-<id>` for an adjudication fork, `review-<unit-slug>-<short sha>` for
a merge review, `graph-<id>` for a build graph a ruling needs, and
`checkpoint-<n>` for a checkpoint. Each attempt after the first appends
`@<k>` (`rule-q7@2`), so its `.pid` and `.out` files and its exit notice
never mix with an earlier attempt's. Ledger `- fork <fork name> started
<date-time>` under `## Forks`, then run its command line (`claude -p --resume <checkpoint id>
--fork-session ...`) exactly as written there: the time limit, `env -C "<package worktree>"`, the equals
signs and the output file included. Run it as a background Bash command, so
you are told when it exits; never wait on it in the foreground. Start the
heartbeat timer if none is running. `<checkpoint id>` and `<model>` come
from the last line under `## Checkpoints`. Forks are exempt from the
budget band.

**When a fork exits**, whether it finished, hit its time limit (exit
status 124), or a beat found its process group gone, first make sure the
exit is new: if the newest line for that attempt's name is already an
`exited` line, this is a stale notice: do nothing. (The fork's exit is
decided by the fork process; the time limit stops anything it left in its
process group as it exits.) Otherwise check for the output it exists to
make:

| Fork | Its output |
|---|---|
| `rule-<id>` | `<ledger dir>/rulings/<id>.md` |
| `review-<unit-slug>-<short sha>` | a `No drift @ <sha>` line in `<ledger dir>/prompts/<fork name>.out`, or `<ledger dir>/questions/merge-<unit-slug>-<short sha>.md` |
| `graph-<id>` | a commit `git -C <package worktree> log -1 --format=%h --grep='^docs(<design-slug>): build graph$' <package commit>..HEAD` prints |
| `checkpoint-<n>` | a session id in `<ledger dir>/checkpoint-<n>.json` |

Ledger `- fork <fork name> exited [<status>]: output` or `- fork <fork
name> exited [<status>]: no output` (the status when you have it), then:

- **Output:** go on as its own paragraph below says.
- **No output, first time:** start it once more, as above, as attempt
  `@2`. For `rule-<id>`,
  first take out any rule commit it made, as Phase 0, Questions, says, so
  the second fork does not rule on its own half-made amendment. For
  `graph-<id>`, first discard uncommitted edits in the package worktree as
  Phase 0, Package worktree, says.
- **No output, second time** (the report's `failures` is 2; a fork stopped
  at resume counts as no attempt): surface it to your partner
  and free what it held. A question whose fork failed twice waits for your
  partner, and its operator holds the tasks it blocks; the next queued
  amending fork starts. A failed checkpoint leaves forks on the current one.
  A failed build graph leaves `Build graph:` as it is. A failed merge review
  leaves the merge in place, unreviewed.

The time limit, `FORK_LIMIT` in `beat.sh`, holds while the fork's
watchdog (the `beat.sh … fork` process) lives, whether or not a conductor
is running. If the watchdog itself is killed with KILL, the fork runs on
without a limit until the next Phase 0, which stops every amending fork a
dead conductor left running and lets a read-only one finish (Phase 0, What
the last conductor left running).

**Questions.** A question is a file `<ledger dir>/questions/<id>.md` in the
form `composer-forks.md` gives. Operators write theirs. Write your own, id
`conductor-<k>`, for whatever you hit: a comprehension-gate finding, a
merge conflict outside the unit's `writes` cell, an unmodeled subsystem.
A merge review writes `merge-<unit-slug>-<short-sha>`. A revert of cut work
that conflicts or fails its suite is `revert-<member>-<ruling id>`
(Replacing an operator, step 4), and a rule commit that will not undo is
`unrule-<id>` (Phase 0, Questions). Every id, like every unit slug, uses
only `[a-z0-9-]`: the anchored `--grep` patterns take it as written, and a
ledger line is for `<id>` only when `<id>` stands in it as a whole word, with
no `[a-z0-9-]` character on either side (`routed api-2` is not a line for
`api`). Every ledger check in this skill matches ids and unit slugs that
way. For each one, ledger
it under `## Questions` with its defect class, then run `## Adjudication
fork` on it. In that prompt's list of plans, name every live operator's
unit and plan path (planning or admitted).

**One writer.** Adjudication and build-graph forks amend the package, so at
most one of them runs at a time, and you merge nothing while one runs: the
package worktree has one writer at a time. Queue later questions in the
order filed and start the next once the running one's ruling is routed
(When an adjudication fork exits, step 5). Merge-review
forks write nothing to the package: start each at once, beside any other
fork.

**Merge review.** After every merge that passes its tests (a row report's,
a sibling's or a `complete`'s), run `## Merge-review fork` with the unit,
the merged sha, and its needs and produces rows. When it exits with its
output: `No drift @ <sha>` is one ledger line under `## Integration`; a
question file is a question like any other.

**When an adjudication fork exits** with its ruling file, read `rulings/<id>.md` once, to route
it: `Package commit`, `Changes design`, `Changes contract`, `## Ruling`,
`## Re-read`, `## Affected units` and `## Build graph`. Before step 1, append
`- routing <id>: rulings/<id>.md, commit <sha|none>` under `## Questions`,
then complete the question's ledger line with the commit and `changes
contract`. Then, in order:

1. Each `clarification` unit, and the operator that asked if it is not
   listed, gets the ruling relay (`## Supervision`) by name, unless a
   `relayed <id> to <session name>` line records it. Ledger each relay as
   `- relayed <id> to <session name>`.
2. Each unit whose line reads `first task that no longer holds: <task>`:
   stop its operator (and its family's), cut the branches and take the cut
   work back out now (Replacing an operator, steps 1-4).
3. If `Changes design: yes`, run `## Build-graph fork`, unless a `build
   graph for <id>` line is in the ledger or that fork already committed
   before a death: `git -C <package worktree> log -1 --format=%h
   --grep='^docs(<design-slug>): build graph$' <package commit>..HEAD`
   prints its sha (`<package commit>` is the ruling's `Package commit`);
   then update `Build graph:` and ledger the `build graph for` line with
   that sha instead. Run it with "Units to write" set to the ruling's
   `## Build graph` lines: the unit slugs whose rows to rewrite, and each `new: <what>` the specs now need that no row
   implements; `none named` when the section lists nothing. A hand-back
   sibling `<unit-slug>-<k>` has no row of its own: pass `<unit-slug>`.
   When it exits with its commit, update the ledger's `Build graph:` line
   and append `- build graph for <id> @ <sha>`; a row it added is a unit
   like any other, started when step 5 re-derives admission. If it failed
   twice, append `- build graph for <id> @ none` and go on.
4. Re-checkpoint if one is due (below), unless a `## Checkpoints` line
   names `ruling <id>`.
5. Start the fresh operators from step 2 (Replacing an operator, steps
   5-6) and re-derive admission (Phase 2). Then append `- routed <id>`
   under `## Questions`, and start the next queued amending fork.

**Routing again.** A conductor can die anywhere between a ruling's
`routing <id>` line and its `routed <id>` line; Phase 0 then routes that
ruling again from the top, and each step above, and each Replacing step it
runs, checks the ledger or git first and skips what is done. Routing a
ruling again after a death is still routing it: the file is read again only
to route it. The `routing <id>` line is appended only if it is missing.
Replacing an operator runs from its first step with no done line (below).
Ids are matched as whole words (Questions, above).

`rulings/` is the partner's record of what was decided and why. No agent
loads it as design context: operators, forks and the checkpoint never open
it, and you read each ruling file once, only to route it (routing it again
after a death is that same routing). The spec in the
package worktree is the authority, and the ruling relay says so.

**Replacing an operator.** A ruling that names a unit's first task that no
longer holds changes that unit's approach. The warm operator never hears
the change.

A unit's **family** is the unit and its hand-back siblings
`<unit-slug>-<k>`. A ruling that names a first task for any member of a
family that has siblings replaces the whole family: every member is stopped
and cut, and one fresh operator starts on `<unit-slug>` from its
build-graph row. A unit with no siblings is a family of one.

Each step below ends by appending its done line under `## Questions`:
`- replacing <unit-slug> for <id>: step <n> done`. Routing again runs the
steps for a family from the first step with no done line. Within steps 3
and 4, which act member by member, it also skips each member whose `- cut`
or `- reverted` line for ruling `<id>` is in the ledger. A step with its
done line never runs again, so the fresh operator step 6 started is never
stopped: once step 6 is done, it is an ordinary unit, which Phase 0
restarts like any other if it dies.

1. Ledger every member `replaced (ruling <id>)` in one append, then stop
   each member still listed in `claude agents --json`: `claude stop <id>`
   (`## Supervision`, Stopping an operator). When routing again, skip the
   append if the ledger already holds it.
2. Run `claude agents --json` again; start nothing under any member's name
   while it is still listed.
3. Cut each member's branch. Skip a member that has a `- cut <member> to
   <cut-to sha> for ruling <id>` line. Every sibling is cut whole, the
   named one included: remove its worktree if `git -C <project> worktree
   list` still lists it (`git -C <project> worktree remove --force
   <sibling worktree>`), then its branch if `git -C <project> branch --list
   <sibling branch>` still lists it (`git -C <project> branch -D <sibling
   branch>`). When the ruling names a task of `<unit-slug>`
   itself, cut its branch back to the commit before that task: find the
   task's first commit in its SDD ledger or `git -C <unit worktree> log
   --oneline superconductor/<design-slug>..HEAD`, then `git -C <unit
   worktree> reset --hard <the commit before it>`; if it never reached that
   task, or its branch no longer holds that task's commits because an
   earlier routing cut it, nothing of it is cut. When the ruling names a
   sibling's task, `<unit-slug>`'s own branch is not cut. Every later task
   goes, even one that might have survived, and no branch keeps a copy: no
   old-approach code or comment carries over. The kept commits are `<base
   sha>..<kept sha>`, where `<base sha>` is `<unit-slug>`'s `start` commit
   on its `## Units` line and `<kept sha>` is the commit its branch now
   ends at. Then remove the superseded plan's SDD workspace from
   `<unit-slug>`'s worktree, so no later plan can resume its ledger. SDD
   writes `plan-path` repo-relative, so make `<plan path>` repo-relative
   first: drop a leading `<unit worktree>/` (an absolute path) or `./`. The
   workspace is the directory under `<unit worktree>/.superpowers/sdd/`
   whose `plan-path` file reads that path (`grep -lxF -- '<plan path>'
   <unit worktree>/.superpowers/sdd/*/plan-path`); remove it with `rm -rf
   <that directory>`, if it is still there. Ledger each member's cut under
   `## Integration`: `- cut <member> to <cut-to sha> for ruling <id>`.
4. Take the cut work back out of the integration branch. For each member
   whose cut commits had merged and that has no `- reverted` line for
   ruling <id>: `<merged sha>` is the `@ <sha>` of that member's newest
   `## Integration` `merged` line, the unit commit that
   `## Integration` step 1 merged, never the merge commit on the
   integration branch; it comes after the commit the member was cut back
   to, `<cut-to sha>`, which for a whole sibling is its `start` commit. While
   you hold the one-writer slot (no amending fork running, no merge under
   way), revert those commits, not the merge commits, with `git -c
   revert.reference=false -C <package worktree> revert --no-edit $(git -C
   <package worktree> rev-list --no-merges --first-parent <cut-to
   sha>..<merged sha>)`. `revert.reference=false` gives each revert git's
   `Revert "…"` subject whatever the repo's configuration, which is how
   Phase 0 recognises it. `--first-parent`
   keeps to the member's own commits, leaving out what it merged in from
   the integration branch, because every such merge is `--no-ff` (Phase 2,
   Bringing a branch up to date); the kept commits stay merged. Then run the full
   test suite in the package worktree and ledger the revert under
   `## Integration` (`- reverted ...`) with its result. If the revert
   conflicts, run `git -C <package worktree> revert --abort`, file it as
   question `revert-<member>-<ruling id>` and ledger the `- reverted` line
   with the result `conflict, question revert-<member>-<ruling id>`; a
   failing suite after the revert is that question too (`## Composer
   forks`). File it only if `## Questions` does not list it yet. Then cut
   rows: a row whose delivering task the cut removed, and which
   had already merged, is not merged any more: append `- unmerged row <row
   id>: cut by ruling <id>` under `## Integration`, unless that line is
   there, so nothing new is admitted on it. It merges again only when the
   fresh operator's row report (or `complete`) for it passes. In the
   ledger, move every sibling's `produces:` rows back to `<unit-slug>`'s
   line. Units already
   running against the old row are in the ruling's `## Affected units` and
   are handled like any other affected unit.
5. Refresh `<unit-slug>`'s assignment file: `Plan: none`, `Siblings: none`,
   the `Implements`, `Writes` and `Produces rows` cells from its build-graph
   row as it now reads, `Needs rows` with current merge shas, `Admitted`
   unchanged, and the replacement line `- Replaces: an earlier operator;
   kept commits <base sha>..<kept sha> stand and are not redone; superseded
   plan <plan path>`. Write nothing else about the old approach in the
   assignment: the fresh operator learns the unit from the spec and the
   kept code, never from a summary of what was dropped.
6. Start the fresh operator. If `claude agents --json` lists its name,
   Phase 0 already launched it from its `launching` line: launch nothing.
   Otherwise bring its branch up to date (Phase 2, Bringing a branch up to
   date), set its assignment's `Plan:` as `## Supervision`, Operator death,
   step 1, says (it stays `none` unless an earlier fresh operator wrote a
   plan), and start it with the same name, worktree and model (Phase 2,
   Starting an operator, steps 3-4, keeping its `start`). Then append, in
   one append, its status line and `## Cost` start (Starting an operator,
   step 5) unless the ledger holds them, and step 6's done line. It keeps
   the running count, so it goes ahead in every band, `high` included.

**Re-checkpointing.** The checkpoint holds the package as it was when read,
and goes stale as amendments land. Build a new checkpoint, the same way as
the first (`## Checkpoint`: the most capable model available to this
session, recorded beside its id), when an adjudication fork exits and any of
these holds:

- the ruling says `Changes contract: yes`;
- five rulings have committed to the package since the current
  checkpoint: count `git -C <package worktree> log --first-parent --oneline
  --grep='^docs(<design-slug>): rule ' <checkpoint package sha>..HEAD`,
  less the `unrule` commits Phase 0 made in that range (the same command
  with `--grep='^docs(<design-slug>): unrule '`), so a rule commit Phase 0
  undid does not count;
- the question this fork ruled on brought a class's frame-defect tally to
  three (`## Supervision`). A tally that already stood at three or more
  before this question triggers nothing.

Build it after any build-graph fork that is due, and before the next
amending fork starts. It is a fork for the time limit, the background run
and the exit check (Starting a fork, When a fork exits): `checkpoint-<n>`,
whose output is a session id. Append its id under `## Checkpoints`, ending the line
with `| ruling <id>` for the ruling whose routing built it; every fork
started after that resumes it. Forks already running finish on the old
one: never stop or restart them.

## Optional Jev judgments

If the `superpowers-jev` plugin is installed, load `superpowers-jev:jev`
once per session. It gives the `jev` helper and its protocol. If the plugin
is not installed, skip this section: every rule above stands unchanged.

- `{"enabled": false}` always means: proceed as if Jev did not exist.
- In `shadow` mode, which is the default, run the existing path exactly as
  written, then `jev record` your own verdict.
- Act on Jev only for a point that `jev mode --point <point>` reports as
  `on`, and only on a `confident` answer.

- **defect-class** (Frame-defect tally). Before tagging a question, run
  `jev defect-state --ledger <ledger> --escalation <question file> |
  jev ask defect-class --state -`.
  - On: a confident existing class is the tag, which keeps the tripwire
    counts consistent. Otherwise, name the class yourself.
  - Record: `{"picks": {"class": "<class you tagged, or new_class>"}}`.
- **surface-route** (Supervision, "Surface to your partner"). For each
  escalation or event, run `jev state event=@<file>
  consecutive_deaths:=<n> | jev ask surface-route --state -`.
  - On, with a confident route: `frame_event`, `requirement_contradiction`,
    `scope_change` and `blocked_design_change` are a question for an
    adjudication fork (`## Composer forks`); `repeated_death` goes to your
    partner; `routine` goes into the next merge summary.
  - Record: `{"picks": {"route": "<route you took>"}}`.

The citation check on a question's verified-at claims runs inside the
adjudication fork (its prompt in `composer-forks.md`), not here.

## Context economics

The spine and its operators outlive any one cache window; engineer for
cheap cold resume rather than warm waiting.

- **Why sessions stay warm.** You are woken by operator messages, fork
  exits and the heartbeat, which beats every `BEAT` (10 minutes) while
  something can move without your partner. Each operator is a main session
  with the 1-hour cache, and it waits on its implementers and reviewers in
  bounded background stretches, so a long implementer run does not cost it a cold re-read. Its
  implementers and reviewers, and the composer forks, get the 1-hour cache
  from the `subagentPromptCacheTtl: "1h"` setting. The checkpoint is read by
  every fork, and each read resets its timer.
- Never send a message or schedule a wakeup solely to keep a cache warm. A
  session with nothing to do is allowed to go cold. The heartbeat is not a
  keep-warm ping: every beat does the whole reconcile, in one command whose
  output is a few short lines, and no timer runs while nothing it watches
  can move.
- Fill waits with real work — read SDD ledgers, write the assignment files
  of units about to become ready, tend the ledger.
- For mechanical phases (rename sweeps, ordinal conversions, vocabulary
  swaps) where an operator would add no judgment between leaves, flatten to
  two tiers: dispatch the leaves yourself against the spec, with the SDD
  ledger as the spine.

## Integration

Every merge happens in the package worktree, onto the integration branch
`superconductor/<design-slug>`, and the package worktree has one writer at a
time: merge only while no fork that amends the package is running there,
one merge after another.

1. `git -C <package worktree> merge --no-ff <sha>`, where `<sha>` is the
   row report's commit (never the branch tip, which carries unreviewed
   tasks) or the `complete` branch's tip.
2. Run the project's full test suite in the package worktree.
3. On a conflict, run `git -C <package worktree> merge --abort` at once:
   never leave the shared worktree mid-merge. A conflict only in files the
   unit's `writes` cell lists goes back to the producing operator as the
   fix-round message. A conflict in a file another unit writes means two
   units wrote one file: file it as a question (`## Composer forks`).
4. On failing tests, take the merge back out with `git -C <package
   worktree> reset --hard ORIG_HEAD`. This is only for the merge commit
   you just made in step 1, while you hold the one-writer slot and before
   anything else writes to the package worktree, and for the untested merge
   at the branch's head that Phase 0 takes out; never reset any other
   commit there. Then ledger `- fix round <unit-slug> @ <sha>: <one line>;
   output <path>` under `## Integration`, send the owning operator the
   fix-round message by name, and start the heartbeat timer if none is
   running. If its name is absent from `claude agents --json`, handle it
   as `## Supervision`, Operator death, says; the restart's resends carry
   the fix round. The heartbeat watches the unit until the fix merges. Never fix
   it yourself. A merge that fails its tests has not merged: its rows do
   not count, its consumers are not admitted, and no merge review runs.
5. Once the tests pass, ledger the merge under `## Integration`, start the
   merge-review fork (`## Composer forks`), and re-derive admission
   (Phase 2).
6. Post your partner a merge summary: `Merged <unit-slug> [row <id>] @ <sha>,
   tests <result>. BAND: <band>. Running: <names>. Planning: <names>.
   Admitted now: <names>. Waiting: <unit: rows>.`

When every unit has merged: present the integration branch to your partner,
follow superpowers:finishing-a-development-branch, stop every operator
still listed (`claude stop <id>`), and stop the heartbeat timer (`sh
<skill dir>/beat.sh <ledger dir> stop-timer`).

## Ledger format

`<project>/.superpowers/superconductor/<design-slug>/ledger.md`:

    # Superconductor ledger — design: <design doc path>
    Package worktree: <absolute path>
    Build graph: <build-graph path> @ <sha>
    SDD scripts: <absolute path>
    HTML scripts: <absolute path>   (only with superpowers-html)
    Project commands: <commands>

    ## Checkpoints
    - <checkpoint id> | model <model> | package @ <short sha> | <date> [| ruling <id>]

    ## Units
    - <unit-slug>: <session name> — status: launching | planning | admitted |
      complete | stopped | replaced (ruling <id>) | deferred (branch
      <branch>, worktree <absolute path>, start <sha>, model <model> —
      rationale: <signal>, needs: <rows>, produces: <rows>)

    ## Supervision
    - plan <unit-slug>: <plan path> at <sha>
    - notified <session name>: sibling <sibling name>
    - status asked <unit-slug>
    - stalled <unit-slug>
    - investigated <unit-slug>: <cause> — <remedy>
    - restarted <unit-slug>: <cause>, rung <n>, since <sha|start> gen <k>
    - restarted <unit-slug>: usage-limit, since <sha|start> gen <k>
    - waiting reset <unit-slug> until <epoch>
    - stopped <unit-slug>: rung 3
    - relaunched <unit-slug>
    - launch failed <unit-slug>
    - resent to <session name>

    ## Questions
    - <date> <id> from <unit-slug> [defect-class: <slug>]: <question> →
      rulings/<id>.md (commit <sha|none>, changes contract: yes|no)
    - routing <id>: rulings/<id>.md, commit <sha|none>
    - relayed <id> to <session name>
    - build graph for <id> @ <sha|none>
    - replacing <unit-slug> for <id>: step <n> done
    - routed <id>
    - unruled <sha> for <id>: no ruling file

    ## Forks
    - fork <fork name> started <date-time>
    - fork <fork name> exited [<status>]: output | no output | stopped at resume

    ## Frame-defect tally
    - <class-slug>: <count> — instances: <one line each, dated>

    ## Integration
    - merged <unit-slug> [row <id>] @ <sha> into superconductor/<design-slug>,
      tests <result>, band <band>
    - reverted <unit-slug> <cut-to sha>..<merged sha> for ruling <id>, tests
      <result>
    - cut <member> to <cut-to sha> for ruling <id>
    - unmerged row <row id>: cut by ruling <id>
    - fix round <unit-slug> @ <sha>: <one line>; output <path>

    ## Cost
    - <unit-slug>: admitted <ts> seven_day <pct> | finished <ts> seven_day
      <pct> | session <id>

A `merged` line's `@ <sha>` is the unit commit `## Integration` step 1
merged (the row report's commit or the `complete` branch's tip), never the
merge commit on the integration branch.
`session <id>` is the full `sessionId` from `claude agents --json`: that
listing has no usage field, so tokens come from the session's transcript.
Append a line after every state change: package accepted, band applied,
operator started / admitted / complete / died / restarted / relaunched /
stopped,
question filed, fork started / exited, routing begun, ruling relayed,
build graph rewritten, replacement step done, routing done, rule commit
with no ruling file undone, operator launching, launch failed, operator replaced,
branch cut, cut commits reverted, checkpoint built, merge done, merge
aborted or taken back, fix round sent, deferral recorded, sibling notice
sent, plan ledgered, status asked, operator stalled, operator
investigated, relays and notices resent. A beat that changed none of these
appends nothing. The heartbeat's `<ledger dir>/timer` and the `<ledger
dir>/assignments/<unit-slug>.beat`, `.asked` and `.session` files are
`beat.sh`'s working state, not ledger: losing a `.beat` or `.asked` file
costs one beat of detection, and `beat.sh` rewrites it from git; losing a
`.session` file leaves a rung-2 investigation the worktree fallback. `beat.sh` writes the
`restarted` and `waiting reset` lines itself (`restart`, `wait`): the
cause names one of `death`, `stall`, `denied-command`, `hung-process`,
`defect`, `unknown` or `usage-limit`; `<key>` is the `@ <sha>` of the
unit's newest `merged` line exactly as written there (`start` before its
first) and `gen <k>`, the number of times the unit has been replaced.
