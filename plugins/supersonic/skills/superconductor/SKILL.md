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
- **You never design in this session.** A missing, incomplete, or defective
  package goes back to supersonic:supercomposer; you may relay the defect
  record, never author the amendment.
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
documents. Findings enter the frame-defect tally. Per-task review compares
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
  everything it produces. The ledger's `## Integration` lines are the
  record.
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
       - Admitted: yes|no
       - Permission mode: acceptEdits
       - Allowed git commands: git add, git commit, git rev-parse, git log, git diff, git status, git show, git merge

3. **Launch**, as one Bash call:

       env -C "<unit worktree>" claude --bg -n <design-slug>-<unit-slug> --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Edit,Skill,Agent,SendMessage,TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(git show:*),Bash(git merge:*),Bash(<test command>:*)" --add-dir="<ledger dir>" "$(cat <ledger dir>/assignments/<unit-slug>.md)"

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
| `row <row id> passed review at <sha> on <branch>` | Merge the branch up to `<sha>` (`## Integration`), start a merge-review fork, then re-derive admission (Phase 2) and admit every unit that was waiting only on rows now merged. The reporting operator keeps building. |
| `hand-back: tasks <numbers> of <plan path> at <sha>; files <paths>; needs rows <ids>` | Start a sibling operator for those tasks under the band: unit slug `<unit-slug>-<k>`, worktree branched from `<sha>`, `Implements: tasks <numbers> of <plan path> at <sha> (already planned)`, `Writes: <paths>`, `Needs rows: <ids>`. Ledger it as a unit. |
| `question <id>: <path>` | Ledger it under `## Questions`, then handle it per the items below. |
| `complete: <branch>, ...` | Merge the branch (`## Integration`), start a merge-review fork, ledger `complete` and the `## Cost` finish, then re-derive admission. |

**Mechanical rulings stay with you**: which branch to merge from or rebase
on, which worktree to use, which test command to run. Answer them by
message; everything about the design follows the items below.

**Messages you send** — current state only, each ending in its ask:

| When | Message |
|---|---|
| Admitting a planning operator | `You are admitted: rows <ids> merged into superconductor/<design-slug> at <sha>. Merge superconductor/<design-slug> into your branch, then build from step 6 of your briefing.` |
| Status ask (resume, or idle without a report) | `Status check from <design-slug>-conductor. Reply to <design-slug>-conductor by name with the last task that passed review, the task in progress, and anything held on a question.` |
| A ruling that clarifies a running unit | `The spec now says: <the ruling's sentences>. Re-read <file> § <section> in <package worktree>, bring the tasks you have not started into line with it, and carry on.` |
| A mechanical ruling | `<the answer>. Go on with <task>.` |
| A fix round | `Merging <branch> into superconductor/<design-slug> fails: <one line>; output at <path>. Fix it on your branch with the usual review, then send complete again.` |

A ruling reaches an operator as what the spec says now and where to re-read
it. Never write a diff from the old approach ("no longer", "instead of",
"was"), never quote the old text, and never point the operator at the
ruling file as its instruction: the spec in the package worktree is the
authority.

- **Adjudicate yourself** anything answerable from the design doc and
  specs: reply to the operator by SendMessage, record the ruling in the
  ledger. When a ruling touches an interface row, honor its marking: a
  *decomposition choice* is yours; a *model commitment* changes only with
  the partner.
- **Interface change requests:** update the design doc and every affected
  spec, commit, message each affected operator with the exact delta, record
  in the ledger.
- **Frame-defect tally.** Tag every escalation, workaround, and adjudication
  with a short defect-class slug in the ledger. **The third same-class
  instance is a tripwire**: stop issuing in-frame rulings for that class,
  record the aggregate, and surface it to the partner as a candidate
  supersonic:supercomposer bounce. Seven independent rediscoveries of one
  missing declaration is a design defect wearing an implementation costume.
- **A discovered unmodeled subsystem is a frame event, never extra scope.**
  If any agent surfaces a binding, store, table family, or consumer the
  design doc does not model: pause the affected units, record it, surface
  to the partner, and route to supersonic:supercomposer for an amended
  package. Do not absorb it as additional tasks on a running unit.
- **Operators stay warm through review.** A completed operator is not
  stopped: fix rounds, review findings, and integration breakage on its
  unit go to it by name first (a cold fix round costs ~3.7× per line).
  Start a fresh one from its assignment file only when its name is absent
  from `claude agents --json`.
- **Stopping an operator.** `claude stop <id>`, where `<id>` is the short
  `id` field of its entry in `claude agents --json`, found by name. Never
  pass the name or the full `sessionId`; neither works. Ledger it as
  `stopped`.
- **Surface to your partner only:** requirement contradictions, scope
  changes (cut/add), frame events and tripped tallies, a BLOCKED task whose
  resolution implies a design change, a refused trust check, or two
  consecutive operator deaths on the same unit.
- **Routine progress** reaches your partner as merge summaries
  (`## Integration`), not as questions.
- **Operator death.** An operator whose ledger status is planning, admitted
  or running and whose name is absent from `claude agents --json` is dead.
  Ledger it, then restart it with the same name, worktree and assignment
  file (refreshed), and ledger the restart — SDD's ledger makes mid-plan
  resume cheap. A second consecutive death on one unit: do not restart;
  surface to your partner.

## Composer forks

Composer fork prompts and command lines are in this plugin's
`skills/supercomposer/composer-forks.md`. After every merge, run its
`## Merge-review fork` as a background command. Composer forks are exempt
from the budget band.

## Optional Jev judgments

If the `superpowers-jev` plugin is installed, load `superpowers-jev:jev`
once per session. It gives the `jev` helper and its protocol. If the plugin
is not installed, skip this section: every rule above stands unchanged.

- `{"enabled": false}` always means: proceed as if Jev did not exist.
- In `shadow` mode, which is the default, run the existing path exactly as
  written, then `jev record` your own verdict.
- Act on Jev only for a point that `jev mode --point <point>` reports as
  `on`, and only on a `confident` answer.

- **defect-class** (Frame-defect tally). Before tagging an escalation,
  workaround, or adjudication, run `jev defect-state --ledger <ledger>
  --escalation <file> | jev ask defect-class --state -`.
  - On: a confident existing class is the tag, which keeps the tripwire
    counts consistent. Otherwise, name the class yourself.
  - Record: `{"picks": {"class": "<class you tagged, or new_class>"}}`.
- **bounce** (Bounce rule). For a message you cannot attribute at a glance,
  run `jev bounce-state --ledger <ledger> --message <file> |
  jev ask bounce --state -`.
  - On: a confident operator pick means you relay the message verbatim to
    that operator's session name. Otherwise, ledger the message and
    take no action.
  - Record: `{"picks": {"operator": "<slug or unattributable>"}}`.
- **surface-route** (Supervision, "Surface to your partner only"). For each
  escalation or event, run `jev state event=@<file>
  consecutive_deaths:=<n> | jev ask surface-route --state -`.
  - On: a confident route other than `routine` means you surface the event
    to your partner. `routine` goes into the next merge summary.
  - Record: `{"picks": {"route": "<route you took>"}}`.
- **citation** (Supervision, "Adjudicate yourself"). Before ruling from an
  operator report's verified-at claims, run `jev cite <report> --root
  <operator worktree> > <state file>`, then `jev ask citation --state
  <state file>`.
  - On: ledger every claim in `detail.flagged` or `detail.also_flagged` as
    *unverified*, and re-check it before it enters a ruling.
  - Record: `{"items": ["<supports | contradicts | says_nothing>", ...]}`,
    in the order of the state file's `claims` (`detail.labels` repeats
    each claim). `jev cite` moves unreadable claims out of `claims`.

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
3. On breakage, send the owning operator the fix-round message by name. If
   its name is absent from `claude agents --json`, start a fresh operator
   from its assignment file with the failure output path added. Never fix
   it yourself. A merge conflict means two units wrote the same file:
   record it as a frame event.
4. Ledger the merge under `## Integration`, start the merge-review fork
   (`## Composer forks`), and re-derive admission (Phase 2).
5. Post your partner a merge summary: `Merged <unit-slug> [row <id>] @ <sha>,
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

    ## Cost
    - <unit-slug>: admitted <ts> seven_day <pct> | finished <ts> seven_day
      <pct> | session <id>

`session <id>` is the full `sessionId` from `claude agents --json`: that
listing has no usage field, so tokens come from the session's transcript.
Append a line after every state change: package accepted, band applied,
operator started / admitted / complete / died / restarted / stopped,
question filed, ruling relayed, merge done, deferral recorded.
