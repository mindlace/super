---
name: superconductor
description: Use when executing or resuming a multi-spec build whose composition package (design doc + specs) already exists — dispatching operators, supervising waves, integrating results — or when reconciling an earlier superconductor run after a session ended or a usage limit hit. For designing or reappraising the package itself, use supercomposer; for single-spec features, use superpowers:brainstorming.
---

# Superconductor

Conduct the score; supercomposer composes it. You (the main session) consume
a committed **composition package** — design doc, specs, traceability and
coverage tables — dispatch one operator subagent per spec to plan and
implement it via superpowers, handle escalations, and integrate the results.
You own execution coherence and design *fidelity* — never implementation,
and never composition: design work in this session bloats the spine that
every resume re-reads.

**Announce at start:** "Using superconductor to conduct <topic>."

## Hard rules

- **You never write or fix implementation code.** Not in fix rounds, not on
  integration breakage. Dispatch instead — controller fixes skip review and
  burn coordination context.
- **You never design in this session.** A missing, incomplete, or defective
  package goes back to supercomposer (a separate session); you may relay the
  defect record, never author the amendment.
- **Append to the ledger after every state change.** A usage limit can end
  this session at any moment; the ledger plus git is the only memory that
  survives. On resume, trust the ledger and git over recollection.
- **Keep the spine lean — cold resume is the normal path.** Full reports,
  survey output, and review evidence live in files; the ledger carries a
  ≤1-paragraph summary plus the path. Never paste a report body into this
  conversation. Checkpoint the ledger before any predictable long silence.
- **Bounce rule:** the only agents that should message you are your
  operators. Message envelopes name only the sender's agent type, so
  attribute a misrouted message by its content: if it clearly belongs to
  one plan, relay it verbatim to that operator's agentId (recorded in the
  ledger at dispatch), take no action on it yourself, and tell that
  operator its leaf misaddressed. If you cannot attribute it to a plan,
  record it in the ledger and take no further action.
- Operators run in the background with `operator-briefing.md` (in this
  skill's directory) pasted verbatim at the top of the dispatch prompt;
  each operator's model is a per-spec tier judgment (Phase 2, Operator
  tier).

## Phase 0 — Resume check

If `.superpowers/superconductor/<design-slug>/ledger.md` exists in the
target project for this design: read it, reconcile against reality —
`git branch --list`, `git worktree list`, SDD ledgers under
`.superpowers/sdd/`, and TaskList — then report the true state to your
partner and offer to redispatch fresh operators for incomplete plans.
Operators from prior sessions are dead; on-disk state is the only truth.
Continue from whichever phase the ledger shows incomplete.

## Phase 1 — Package intake

The package comes from a supercomposer session, committed. Before any
dispatch, verify it is complete:

- Design doc with every required section, including the **traceability
  table** (every model-doc claim → interface row / spec, or a
  dropped/narrowed/deferred entry bearing partner sign-off) and the
  **coverage table** (every system-inventory item surveyed or excluded).
- Specs committed, one per subsystem, interface rows and global constraints
  embedded verbatim; the fresh-eyes fidelity + delegation checks recorded
  as run.
- Interface-table rows marked *model commitment* vs *decomposition choice*.

Anything missing → back to supercomposer; do not patch it here. Operators
branch worktrees from the package's committed state.

## Phase 2 — Dispatch

**Waves.** From the interface table, group specs into waves: a spec with no
unmet interface dependency joins the current wave; a spec consuming another
spec's new interface waits for its producer's wave to complete and merge.

**Task spine.** `TaskCreate` one session task per spec; `TaskUpdate` with
`addBlockedBy` encoding the dependency edges. Operators claim and update
their own task — the task list, not message traffic, is the progress
surface.

**Scope gate — run before every wave.** Run this skill's `budget.sh` (reads
`~/.claude/rate-limits.json`, written by the statusline on every render, and
the partner's declared reserve ceilings from
`~/.claude/superconductor-reserves.json` when present). The gate is
**reserve-based and defer-only**: budget buys *when*, never *what* — when
budget is short, defer; never produce a worse artifact on schedule.

Present to your partner: the wave structure, the budget report (both
windows: used %, reserve, headroom, local reset time, staleness), and the
calibrated per-spec cost. Then:

- `VERDICT: STOP` (seven_day at/over reserve) → **stop admitting** — a long
  wait; may mean ending the session and resuming after the named reset.
- `VERDICT: HOLD` (five_hour at/over reserve) → **hold the wave** — a short
  pause until the named reset. The five-hour window is what protects the
  partner's ability to do a quick fix right now; the seven-day window
  protects the rest of the week.
- Data older than 30 minutes → say so and ask for a scope decision without
  the numbers.
- `VERDICT: OK` → dispatch as many ready specs as fit under both ceilings
  per the calibrated per-spec cost; defer the rest (`pending` in the task
  spine, deferral line in the ledger).

The gate recommends; the partner decides — ceilings are overridable per
wave. Resumability is the backstop: a mispredicted cutoff must never lose
work.

**Cost calibration.** Record `seven_day.used_percentage` at wave start and
wave end in the ledger's Waves section, plus whether the wave ran
exclusively (no concurrent interactive work). The delta ÷ **specs
completed** — not operators launched; redispatch ran 2.4× on the
calibration run — is the per-spec estimate the next gate uses. Non-exclusive
measurements are upper bounds, never grounds to revise an estimate
downward. With no history, the gate says it has no calibration data and
asks, rather than inventing a number.

**Operator tier.** Choose each operator's model per spec at dispatch:
default to the top operator tier; lower it only when the spec is genuinely
mechanical (few interface rows, no greenfield judgment, no cross-subsystem
consumption). The partner may set or override tiers at the scope gate.
Record every choice in the ledger:
`dispatched at <model> — rationale: <complexity signal>` — the rationale is
what lets the heuristic be audited against the result.

> **INVARIANT: budget state MUST NOT be an input to tier selection.** Tier
> is a function of task demand alone. Budget buys *when*, never *what* —
> when budget is short, defer; never run the same work at a lower tier.
> Degraded output is paid for in cleanup and refactor work, which costs
> more than the tokens saved.

**Dispatch.** For each spec in the approved wave, dispatch via the Agent
tool: background, at the spec's chosen tier, named `<slug>-operator`,
prompt = the full verbatim contents of `operator-briefing.md`, then:

    ## Your assignment
    - Project: <absolute path to the target project repo>
    - Spec: <absolute path to the spec file>
    - Your slug: <slug>
    - Interfaces you produce: <that spec's producer rows from the table>
    - Interfaces you consume: <consumer rows, with the branch/commit where
      each already landed>
    - Session task id: <task id> — claim it and keep it current.
    - Worktree base: <integration branch if it exists, else the spec commit>

Tell each operator its worktree base explicitly: the integration branch
`superconductor/<design-slug>` if it exists, else the commit where the specs
landed.

Record each dispatch in the ledger, including the operator's agentId from
the spawn result — labels are not addresses, and every message you send an
operator uses its agentId.

## Supervision

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
  supercomposer bounce. Seven independent rediscoveries of one missing
  declaration is a design defect wearing an implementation costume.
- **A discovered unmodeled subsystem is a frame event, never extra scope.**
  If any agent surfaces a binding, store, table family, or consumer the
  design doc does not model: pause the affected specs, record it, surface
  to the partner, and route to supercomposer for an amended package. Do not
  absorb it as additional tasks on a running wave.
- **Operators stay warm through review.** A completed operator is not dead:
  fix rounds, review findings, and integration breakage on its spec go to
  its recorded agentId first (resume is cheap; a cold fix round costs ~3.7×
  per line). Dispatch a fresh operator only when the agentId no longer
  resolves (prior session) or after an operator death.
- **Comprehension gate.** After the first wave that makes the model
  load-bearing (and again before any cutover-class step), dispatch a fresh
  agent to write or refresh an "explain the system as built" doc and diff
  it against the source model documents. Findings enter the frame-defect
  tally. Per-task review compares work against briefs; only a whole-system
  reading catches the drift briefs inherit.
- **Surface to your partner only:** requirement contradictions, scope
  changes (cut/add), frame events and tripped tallies, a BLOCKED task whose
  resolution implies a design change, or two consecutive operator deaths on
  the same spec.
- **Routine progress** reaches your partner as summaries at wave
  boundaries (from TaskList + ledger), not as questions.
- **Operator death** (Agent call errors or returns null): record in the
  ledger, redispatch fresh with the same prompt and the same
  `<slug>-operator` label, recording the new agentId in the ledger — SDD's
  ledger makes mid-plan resume cheap. Second consecutive death on one spec:
  stop and surface to your partner.

## Context economics

The spine and its operators outlive any cache window; engineer for cheap
cold resume rather than warm waiting.

- Fill waits with real work at a cadence under the cache TTL — review the
  previous wave's artifacts, prep the next wave's assignments, tend the
  ledger. Never send a message or schedule a wakeup solely to keep a cache
  warm.
- Size operator work so leaf round-trips tend to come back inside the TTL;
  a task that will run silent for hours belongs split, or checkpointed.
- For mechanical phases (rename sweeps, ordinal conversions, vocabulary
  swaps) where an operator would add no judgment between leaves, flatten to
  two tiers: dispatch the leaves yourself against the spec, with the SDD
  ledger as the spine.

## Integration

After each wave completes: merge operator branches in dependency order into
the integration branch `superconductor/<design-slug>` (create it from the
dispatch base if absent), running the project's full test suite after each
merge. On breakage, dispatch a fix round to the owning operator — via its
recorded agentId if still live, else a fresh operator given the briefing,
its original assignment, the integration failure output, and its SDD ledger
path. Never fix it yourself. When every spec has landed, present the
integration branch to your partner and follow
superpowers:finishing-a-development-branch.

## Ledger format

`<project>/.superpowers/superconductor/<design-slug>/ledger.md`:

    # Superconductor ledger — design: <design doc path>

    ## Specs
    - <slug>: <spec path> — status: pending | dispatched | complete |
      blocked | deferred (+ task id, agentId, branch, wave, tier: dispatched
      at <model> — rationale: <complexity signal>)

    ## Adjudications
    - <date> <slug> [defect-class: <slug>]: <question> → <ruling>
      (<design section cited>)

    ## Waves
    - wave <n>: start seven_day <pct>% @ <date> | end <pct>% | exclusive:
      yes|no | specs completed: <k> | per-spec: <pct-points>

    ## Frame-defect tally
    - <class-slug>: <count> — instances: <one line each, dated>

    ## Integration
    - merged <slug> into superconductor/<design-slug> @ <sha>, tests <result>

Append a line after every state change: package accepted, wave gated,
operator dispatched / completed / died, ruling issued, interface changed,
frame event recorded, merge done, deferral recorded.
