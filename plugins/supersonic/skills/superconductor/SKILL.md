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
ledger under `.superpowers/sdd/` in its worktree. For every unit whose
ledger status is planning, admitted or running:

- **Listed by its name in `claude agents --json`: live.** Keep it. Never
  start a second session under a live name. Send it the status ask
  (`## Supervision`) with `notify_when_idle` set; its reply may carry a
  `plan ready`, row report, question or `complete` the last conductor never
  saw.
- **Absent from the list: dead.** Restart it at once, without asking:
  refresh its assignment file (`Needs rows` merge shas, `Admitted`) and
  launch it with the same name in its existing worktree (Phase 2, Starting
  an operator). Its SDD ledger makes mid-plan resume cheap. Ledger the
  restart; a restart counts as a death for `## Supervision`, Operator
  death.

Then post your partner one summary of the true state (not a question) and
continue from whichever phase the ledger shows incomplete.

## Phase 1 — Package intake

The package comes from a supersonic:supercomposer session, committed in the
package worktree on the integration branch `superconductor/<design-slug>`.
Before the first admission, verify it is complete:

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
| `high` | `UPPER` (90%) or above | Start no operator and admit no planning operator. Running ones finish their unit. Run `budget.sh` again after the reset it names. |

- An operator counts as running from its start until its unit is
  `complete`; a planning-only operator counts too. A completed operator
  that stays warm for fix rounds does not count.
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

**Starting an operator.**

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
       - Allowed git commands: git add, git commit, git rev-parse, git log, git diff, git status, git show, git merge, git rm

3. **Launch**, as one Bash call:

       env -C "<unit worktree>" claude --bg -n <design-slug>-<unit-slug> --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Edit,Skill,Agent,SendMessage,TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(git show:*),Bash(git merge:*),Bash(git rm:*),Bash(<test command>:*)" --add-dir="<ledger dir>" "$(cat <ledger dir>/assignments/<unit-slug>.md)"

   - `env -C` sets the session's cwd for that one command. A `cd` in a
     separate call persists only inside this session's working
     directories, so it can silently not take effect.
   - `--allowedTools="..."` and `--add-dir="..."` keep their equals sign:
     both flags are variadic, and without `=` they swallow the prompt and
     the session starts empty.
   - `<test command>` is the project's test and build runner (for example
     `npm test`, `npx vitest`); add one `Bash(...:*)` entry per command the
     plan's tasks run. Add `Bash(jev:*)` when `superpowers-jev` is
     installed. A tool call outside the list stalls about two minutes and
     then fails: the operator asks you, and you relaunch with the list
     extended.
   - `--add-dir="<ledger dir>"` declares the one directory outside the
     worktree the operator writes: its question files.
4. **Ledger** the unit line (`## Units`) and its `## Cost` start: the
   timestamp and the `SEVEN_DAY` percentage from the `budget.sh` run.

## Supervision

**Learn of idle with `notify_when_idle`, never by polling.** Set it on every
message you send an operator. An idle notice with none of the five operator
messages behind it means the operator stopped without reporting: send it
the status ask.

**Messages operators send you** (`operator-briefing.md`, `## Progress`):

| Message | You do |
|---|---|
| `plan ready: <plan path> at <sha>` | Ledger the plan. Admit the unit when its rows have merged and the band allows. |
| `row <row id> passed review at <sha> on <branch>` | Merge the branch up to `<sha>` (`## Integration`). Once the merge passes its tests, start a merge-review fork, then re-derive admission (Phase 2) and admit every unit that was waiting only on rows now merged. The reporting operator keeps building. |
| `hand-back: tasks <numbers> of <plan path> at <sha>; files <paths>; needs rows <ids>` | Start a sibling operator for those tasks under the band (Hand-back siblings, below). |
| `question <id>: <path>` | Ledger it under `## Questions` and start an adjudication fork on it (`## Composer forks`). Send the operator nothing about the design until the ruling exists. |
| `complete: <branch>, ...` | Merge the branch (`## Integration`). Once the merge passes its tests, start a merge-review fork, ledger `complete` and the `## Cost` finish, then re-derive admission. |

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
3. In the ledger, add the sibling's `## Units` line with those rows under
   `produces:`, and remove them from `<unit-slug>`'s line.
4. Send `<unit-slug>`'s operator, and every earlier sibling, the sibling
   notice (below).

**Mechanical rulings stay with you**: which branch to merge from or rebase
on, which worktree to use, which test command to run. Answer them by
message. Everything about the design goes to a composer fork.

**Messages you send** — current state only, each ending in its ask:

| When | Message |
|---|---|
| Admitting a planning operator | `You are admitted: rows <ids> merged into superconductor/<design-slug> at <sha>. Merge superconductor/<design-slug> into your branch, then build from step 6 of your briefing.` |
| Sibling notice (after a hand-back) | `<sibling name> now runs tasks <numbers> of <plan path> and owns rows <ids, or none>; do not report those rows. Message <sibling name> by name when your lanes need to coordinate, and carry on with your own tasks.` |
| Status ask (resume, or idle without a report) | `Status check from <design-slug>-conductor. Reply to <design-slug>-conductor by name with the last task that passed review, the task in progress, and anything held on a question.` |
| Ruling relay (a unit listed as `clarification`, or the operator that asked) | `Ruling <id>: the spec now says <the ruling's ## Ruling sentences>. Re-read <file> § <section> in <package worktree>; the spec states the answer, so do not open the ruling file. Bring the tasks you have not started into line with it, release any task question <id> held, and carry on.` |
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
  in the ledger. **The third same-class instance is a tripwire**: build a
  new checkpoint (`## Composer forks`, Re-checkpointing) and post your
  partner one line, `Defect class <slug> has reached 3 (<ids>); rulings in
  rulings/; new checkpoint <id>; nothing waits on you.` It is not a
  stop: questions of that class keep going to forks. Seven independent
  rediscoveries of one missing declaration is a design defect wearing an
  implementation costume.
- **A ruling that changes a unit's approach replaces its operator.** When a
  ruling names a unit's first task that no longer holds, stop that operator
  and start a fresh one on the amended spec (`## Composer forks`,
  Replacing an operator). Never send the warm operator the change: an
  operator that lived through the old approach writes it into the code. A
  `clarification` goes to the warm operator as the ruling relay.
- **Operators stay warm through review.** A completed operator is not
  stopped: fix rounds, review findings, and integration breakage on its
  unit go to it by name first (a cold fix round costs ~3.7× per line).
  Start a fresh one from its assignment file only when its name is absent
  from `claude agents --json`, or when a ruling changes its approach.
- **Stopping an operator.** `claude stop <id>`, where `<id>` is the short
  `id` field of its entry in `claude agents --json`, found by name. Never
  pass the name or the full `sessionId`; neither works. Ledger it as
  `stopped`.
- **Surface to your partner** only a refused trust check and a second
  consecutive operator death on one unit: those wait on them. Post a
  one-line notice that asks nothing when a tripped tally re-checkpoints.
  Rulings need no notice: your partner reads `rulings/` afterwards.
- **Routine progress** reaches your partner as merge summaries
  (`## Integration`), not as questions.
- **Operator death.** An operator whose ledger status is planning, admitted
  or running and whose name is absent from `claude agents --json` is dead.
  Ledger it, then restart it with the same name, worktree and assignment
  file (refreshed), and ledger the restart — SDD's ledger makes mid-plan
  resume cheap. A restart keeps the running count, so it goes ahead in
  every band. A second consecutive death on one unit: do not restart;
  surface to your partner.

## Composer forks

You rule on nothing the specs do not answer. Each such question goes to a
one-shot fork of the composer checkpoint, which rules alone, rewrites the
package as current state, writes its ruling file and exits; you route the
outcome. The prompts and command lines are in this plugin's
`skills/supercomposer/composer-forks.md`, under `## Checkpoint`,
`## Adjudication fork`, `## Merge-review fork` and `## Build-graph fork`.

**Starting a fork.** Copy the section's prompt into
`<ledger dir>/prompts/`, fill every placeholder, and run its command line
exactly as written there, `env -C "<package worktree>"` and the equals
signs included: `claude -p --resume <checkpoint id> --fork-session ...`.
Run it as a background Bash command, so you are told when it exits; never
wait on it in the foreground. `<checkpoint id>` and `<model>` come from the
last line under `## Checkpoints`. Forks are exempt from the budget band.

**Questions.** A question is a file `<ledger dir>/questions/<id>.md` in the
form `composer-forks.md` gives. Operators write theirs. Write your own, id
`conductor-<k>`, for whatever you hit: a comprehension-gate finding, a
merge conflict outside the unit's `writes` cell, an unmodeled subsystem.
A merge review writes `merge-<unit-slug>-<short-sha>`. For each one, ledger
it under `## Questions` with its defect class, then run `## Adjudication
fork` on it. In that prompt's list of plans, name every live operator's
unit and plan path (planning, admitted or running).

**One writer.** Adjudication and build-graph forks amend the package, so at
most one of them runs at a time, and you merge nothing while one runs: the
package worktree has one writer at a time. Queue later questions in the
order filed and start the next when the running one exits. Merge-review
forks write nothing to the package: start each at once, beside any other
fork.

**Merge review.** After every merge that passes its tests (a row report's,
a sibling's or a `complete`'s), run `## Merge-review fork` with the unit,
the merged sha, and its needs and produces rows. When it exits: `No drift @
<sha>` is one ledger line under `## Integration`; a question file path is a
question like any other.

**When an adjudication fork exits**, read `rulings/<id>.md` once, to route
it: `Package commit`, `Changes design`, `Changes contract`, `## Ruling`,
`## Re-read` and `## Affected units`. Complete the question's ledger line
with the commit and `changes contract`. Then, in order:

1. Each `clarification` unit, and the operator that asked if it is not
   listed, gets the ruling relay (`## Supervision`) by name.
2. Each unit whose line reads `first task that no longer holds: <task>`:
   stop its operator, cut its branch and unmerge its cut rows now
   (Replacing an operator, steps 1-4).
3. If `Changes design: yes` and `## Affected units` lists any unit, run
   `## Build-graph fork` with "Units to write" set to those unit slugs. When
   it exits, update the ledger's `Build graph:` line.
4. Re-checkpoint if one is due (below).
5. Start the fresh operators from step 2 (Replacing an operator, steps
   5-6), re-derive admission (Phase 2), and start the next queued amending
   fork.

`rulings/` is the partner's record of what was decided and why. No agent
loads it as design context: operators, forks and the checkpoint never open
it, and you read each ruling file once, only to route it. The spec in the
package worktree is the authority, and the ruling relay says so.

**Replacing an operator.** A ruling that names a unit's first task that no
longer holds changes that unit's approach. The warm operator never hears
the change:

1. `claude stop <id>` (`## Supervision`, Stopping an operator). Ledger the
   unit `replaced`.
2. Run `claude agents --json` again; start nothing under that name while it
   is still listed.
3. Cut the branch back to the commit before that task: find the task's
   first commit in the unit's SDD ledger or `git -C <unit worktree> log
   --oneline superconductor/<design-slug>..HEAD`, then `git -C <unit
   worktree> reset --hard <the commit before it>`. Every later task goes,
   even one that might have survived, and no branch keeps a copy: no
   old-approach code or comment carries over. If the operator never reached
   that task, nothing is cut. The kept commits are `<base sha>..<kept sha>`,
   where `<base sha>` is `git -C <unit worktree> merge-base HEAD
   superconductor/<design-slug>` and `<kept sha>` is the commit you cut
   back to.
4. Cut rows. A row whose delivering task the cut removed, and which had
   already merged, is not merged any more: append `- unmerged row <row id>:
   cut by ruling <id>` under `## Integration`, so nothing new is admitted on
   it. It merges again only when the fresh operator's row report (or
   `complete`) for it passes. Do not revert the earlier merge on the
   integration branch: the fresh report's merge supersedes it. Units already
   running against the old row are in the ruling's `## Affected units` and
   are handled like any other affected unit.
5. Refresh its assignment file: `Plan: none`, the `Implements`, `Writes` and
   `Produces rows` cells from the build graph as it now reads, `Needs rows`
   with current merge shas, `Admitted` unchanged, and the replacement line
   `- Replaces: an earlier operator; kept commits <base sha>..<kept sha>
   stand and are not redone; superseded plan <plan path>`. Write nothing
   else about the old approach in the assignment: the fresh operator learns
   the unit from the spec and the kept code, never from a summary of what
   was dropped.
6. Launch it with the same name, worktree and model (Phase 2, Starting an
   operator, step 3), and ledger the start. It keeps the running count, so
   it goes ahead in every band, `high` included.

**Re-checkpointing.** The checkpoint holds the package as it was when read,
and goes stale as amendments land. Build a new checkpoint, the same way as
the first (`## Checkpoint`), when any of these holds after a fork exits:

- the ruling says `Changes contract: yes`;
- five rulings have committed to the package since the current
  checkpoint: count `git -C <package worktree> log --first-parent --oneline
  --grep='): rule ' <checkpoint package sha>..HEAD`;
- the frame-defect tally reached three of one class (`## Supervision`).

Build it after any build-graph fork that is due, and before the next
amending fork starts. Append its id under `## Checkpoints`; every fork
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

- **Why sessions stay warm.** You are woken by operator messages, idle
  notices and fork exits; with several operators those arrive well inside
  an hour. Each operator is a main session with the 1-hour cache, so a long
  implementer run does not cost it a cold re-read. Its implementers and
  reviewers, and the composer forks, get the 1-hour cache from the
  `subagentPromptCacheTtl: "1h"` setting. The checkpoint is read by every
  fork, and each read resets its timer.
- Never send a message or schedule a wakeup solely to keep a cache warm. A
  session with nothing to do is allowed to go cold.
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
   anything else writes to the package worktree; never reset any other
   commit there. Then send the owning operator the fix-round message by name. If
   its name is absent from `claude agents --json`, start a fresh operator
   from its assignment file with the failure output path added. Never fix
   it yourself. A merge that fails its tests has not merged: its rows do
   not count, its consumers are not admitted, and no merge review runs.
5. Once the tests pass, ledger the merge under `## Integration`, start the
   merge-review fork (`## Composer forks`), and re-derive admission
   (Phase 2).
6. Post your partner a merge summary: `Merged <unit-slug> [row <id>] @ <sha>,
   tests <result>. BAND: <band>. Running: <names>. Planning: <names>.
   Admitted now: <names>. Waiting: <unit: rows>.`

When every unit has merged: present the integration branch to your partner,
follow superpowers:finishing-a-development-branch, and stop every operator
still listed (`claude stop <id>`).

## Ledger format

`<project>/.superpowers/superconductor/<design-slug>/ledger.md`:

    # Superconductor ledger — design: <design doc path>
    Package worktree: <absolute path>
    Build graph: <build-graph path> @ <sha>

    ## Checkpoints
    - <checkpoint id> | model <model> | package @ <short sha> | <date>

    ## Units
    - <unit-slug>: <session name> — status: planning | admitted | running |
      complete | stopped | replaced | deferred (+ branch, worktree, model
      — rationale: <signal>, needs: <rows>, produces: <rows>)

    ## Questions
    - <date> <id> from <unit-slug> [defect-class: <slug>]: <question> →
      rulings/<id>.md (commit <sha|none>, changes contract: yes|no)

    ## Frame-defect tally
    - <class-slug>: <count> — instances: <one line each, dated>

    ## Integration
    - merged <unit-slug> [row <id>] @ <sha> into superconductor/<design-slug>,
      tests <result>, band <band>
    - unmerged row <row id>: cut by ruling <id>

    ## Cost
    - <unit-slug>: admitted <ts> seven_day <pct> | finished <ts> seven_day
      <pct> | session <id>

`session <id>` is the full `sessionId` from `claude agents --json`: that
listing has no usage field, so tokens come from the session's transcript.
Append a line after every state change: package accepted, band applied,
operator started / admitted / complete / died / restarted / stopped,
question filed, fork started / exited, ruling relayed, operator replaced,
checkpoint built, merge done, merge aborted or taken back, deferral
recorded.
