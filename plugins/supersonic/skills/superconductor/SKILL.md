---
name: superconductor
description: Use when the user wants to build something large enough to decompose into multiple specs and co-design at the level above individual specs, or when resuming an earlier superconductor run after a session ended or a usage limit hit. Not for single-spec features — use superpowers:brainstorming for those.
---

# Superconductor

Orchestrate design-level development. You (the main session) co-design with
your human partner, derive one spec per subsystem, dispatch one Opus
operator subagent per spec to plan and implement it via superpowers, handle
escalations, and integrate the results. You own design coherence — never
implementation.

**Announce at start:** "Using superconductor to orchestrate <topic>."

## Hard rules

- **You never write or fix implementation code.** Not in fix rounds, not on
  integration breakage. Dispatch instead — controller fixes skip review and
  burn coordination context.
- **Append to the ledger after every state change.** A usage limit can end
  this session at any moment; the ledger plus git is the only memory that
  survives. On resume, trust the ledger and git over recollection.
- **Bounce rule:** the only agents that should message you are your
  operators. Message envelopes name only the sender's agent type, so
  attribute a misrouted message by its content: if it clearly belongs to
  one plan, relay it verbatim to that operator's agentId (recorded in the
  ledger at dispatch), take no action on it yourself, and tell that
  operator its leaf misaddressed. If you cannot attribute it to a plan,
  record it in the ledger and take no further action.
- Operators run with model Opus, in the background, with
  `operator-briefing.md` (in this skill's directory) pasted verbatim at the
  top of the dispatch prompt.

## Phase 0 — Resume check

If `.superpowers/superconductor/<design-slug>/ledger.md` exists in the
target project for this design: read it, reconcile against reality —
`git branch --list`, `git worktree list`, SDD ledgers under
`.superpowers/sdd/`, and TaskList — then report the true state to your
partner and offer to redispatch fresh operators for incomplete plans.
Operators from prior sessions are dead; on-disk state is the only truth.
Continue from whichever phase the ledger shows incomplete.

## Phase 1 — Design

Work with your partner at design altitude: subsystem decomposition, the
interfaces between subsystems, and sequencing. Follow
superpowers:brainstorming's dialogue discipline and your partner's
brainstorming preferences (write the doc early; the doc is the discussion
surface).

- Path: `docs/superpowers/design/YYYY-MM-DD-<topic>.md` in the target
  project.
- Required sections: **Goal**; **Subsystems** (one-paragraph scope each,
  with a `<slug>` per subsystem); **Interface table** (producer subsystem,
  consumer subsystem, exact signature — every cross-subsystem interface);
  **Dependency order**; **Global constraints**; **Out of scope**.
- **Partner approval of this document is the only human gate before
  dispatch.** Do not add per-spec review rounds.

On approval, create the ledger (format below) and commit the design doc.

## Phase 2 — Spec derivation

- Derive one spec per subsystem into
  `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`. Each spec embeds,
  verbatim: its rows of the interface table (both produced and consumed)
  and the design's global constraints.
- Dispatch one fresh-eyes subagent (foreground, general-purpose) with the
  design doc path and all spec paths. It checks: every design requirement
  covered by exactly one spec; no contradictions between specs; interface
  signatures identical everywhere they appear; no placeholders. Fix its
  findings inline — no user gate.
- Commit the specs before any dispatch; operators branch worktrees from
  this committed state.

## Phase 3 — Dispatch

**Waves.** From the interface table, group specs into waves: a spec with no
unmet interface dependency joins the current wave; a spec consuming another
spec's new interface waits for its producer's wave to complete and merge.

**Task spine.** `TaskCreate` one session task per spec; `TaskUpdate` with
`addBlockedBy` encoding the dependency edges. Operators claim and update
their own task — the task list, not message traffic, is the progress
surface.

**Scope gate — run before every wave.** Read `~/.claude/rate-limits.json`
(written by the statusline on every render; mtime is its freshness). Then
present to your partner: the wave structure, a rough cost signal (spec
count, estimated tasks per spec, ~4-6 subagent dispatches per task under
SDD), and the current five-hour / seven-day used percentages. Ask which
specs run now. Defaults:

- If the file is missing or older than 30 minutes, say so and ask for a
  scope decision without the numbers.
- If `five_hour.used_percentage` > 80, recommend deferring the wave; the
  partner may override the threshold.
- Deferred specs stay `pending` in the task spine; record the deferral in
  the ledger. Resumability is the backstop — a mispredicted cutoff must
  never lose work.

**Dispatch.** For each spec in the approved wave, dispatch via the Agent
tool: background, model Opus, named `<slug>-operator`, prompt = the full
verbatim contents of `operator-briefing.md`, then:

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
  ledger.
- **Interface change requests:** update the design doc and every affected
  spec, commit, message each affected operator with the exact delta, record
  in the ledger.
- **Surface to your partner only:** requirement contradictions, scope
  changes (cut/add), a BLOCKED task whose resolution implies a design
  change, or two consecutive operator deaths on the same spec.
- **Routine progress** reaches your partner as summaries at wave
  boundaries (from TaskList + ledger), not as questions.
- **Operator death** (Agent call errors or returns null): record in the
  ledger, redispatch fresh with the same prompt and the same
  `<slug>-operator` label, recording the new agentId in the ledger — SDD's
  ledger makes mid-plan resume cheap. Second consecutive death on one spec:
  stop and surface to your partner.

## Integration

After each wave completes: merge operator branches in dependency order into
the integration branch `superconductor/<design-slug>` (create it from the
dispatch base if absent), running the project's full test suite after each
merge. On breakage, dispatch a fix round to the owning operator — via its
recorded agentId if still live, else a fresh operator given the briefing, its original
assignment, the integration failure output, and its SDD ledger path. Never
fix it yourself. When every spec has landed, present the integration branch
to your partner and follow superpowers:finishing-a-development-branch.

## Ledger format

`<project>/.superpowers/superconductor/<design-slug>/ledger.md`:

    # Superconductor ledger — design: <design doc path>

    ## Specs
    - <slug>: <spec path> — status: pending | dispatched | complete |
      blocked | deferred (+ task id, agentId, branch, wave)

    ## Adjudications
    - <date> <slug>: <question> → <ruling> (<design section cited>)

    ## Integration
    - merged <slug> into superconductor/<design-slug> @ <sha>, tests <result>

Append a line after every state change: spec derived, wave gated, operator
dispatched / completed / died, ruling issued, interface changed, merge done,
deferral recorded.
