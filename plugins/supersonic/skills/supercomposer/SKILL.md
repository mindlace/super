---
name: supercomposer
description: Use when co-designing a build large enough to decompose into multiple specs, when a design requires systemic understanding of existing code before it can be written, or when a superconductor run has surfaced a frame defect, missing subsystem, or reappraisal need in its design. Produces the composition package a superconductor run executes. Not for single-spec features — use superpowers:brainstorming for those.
---

# Supercomposer

Compose the score; the superconductor conducts it. This skill owns the
design-side work: grounding in the real system, co-designing with your human
partner, and producing the **composition package** — design doc, specs,
fidelity and coverage tables — that a separate superconductor session
executes. Composition is deliberately a rich, warm, partner-interactive
context; the conducting spine stays lean because none of this session's
deliberation rides in it.

**Announce at start:** "Using supercomposer to compose <topic>."

## Hard rules

- **Interpretation stays at this tier.** Subagents perform *mechanical*
  extraction — inventories, greps with stated predicates, line counts,
  censuses. Anything requiring judgment about what code *means* for the
  design, you read at primary source yourself. A summary cannot represent
  what its author didn't read, and a misreading that enters the design here
  costs an execution wave later.
- **Ground truth outranks documentation.** CLAUDE.md, architecture docs, and
  code comments are testimony; config and code are evidence. Every
  doc↔code contradiction found is a finding to surface, never silently
  resolved toward the doc.
- **Append to the shared ledger after every state change**
  (`.superpowers/superconductor/<design-slug>/ledger.md` — one ledger serves
  composition and conduction; composition entries are the package's birth
  record).

## Phase C0 — Mode

If the design slug's ledger exists, this is a **reappraisal**: read the
ledger, the existing package, and whatever defect record or review reports
prompted the bounce; the deliverable is an *amended* package plus a delta
section stating what changed and why. Otherwise this is fresh composition.

## Phase C1 — Ground truth (before any scoped survey)

1. **Closed-world inventory first, mechanically.** Before choosing survey
   scopes, enumerate the system from sources that cannot summarize-away:
   every binding in every wrangler config (DOs, KV, queues, D1, R2), every
   schema table across every migration track, every `src/lib/server/*` and
   `src/lib/client/*` domain dir, every worker, every route group. This is
   `ls` and `grep`, not intelligence — do it yourself or via one mechanical
   agent.
2. **Coverage table — cover or exclude every row.** The survey plan is a
   table: inventory item → surveyed-by-agent-X | excluded-with-reason.
   An item with neither is a plan defect. The scopes come from the
   inventory, never from your prior map of the system.
3. **Provenance in every survey report.** Each agent's brief requires: a
   "files read / dirs listed / NOT examined" appendix; claims marked
   verified-at-`file:line` vs inferred. Treat *unexamined* as unknown —
   never as absent.
4. **Negative-space diff.** After surveys return, diff the inventory against
   the union of report mentions; every unmentioned item gets a disposition.
5. **Primary reading for load-bearing subsystems.** Anything the design will
   restructure, you read directly — surveys give breadth, your own reading
   gives the depth the design binds against.

## Phase C2 — Co-design

Follow superpowers:brainstorming's dialogue discipline and your partner's
preferences (write the doc early; the doc is the discussion surface). Before
decomposing, run a **tension audit** of the approved model documents: list
internal contradictions and ambiguities (e.g. a mechanism assigned to
declarations in one section and to hand-written code in another) and get
each resolved as an explicit partner ruling. An ambiguity you resolve
silently while decomposing is where drift is born.

## Phase C3 — The design doc

Path: `docs/superpowers/design/YYYY-MM-DD-HHMM-<topic>.md`. Required
sections: **Goal**; **Subsystems** (one-paragraph scope each, with a
`<slug>`); **Interface table**; **Dependency order**; **Global
constraints**; **Out of scope**; and two this skill adds:

- **Traceability table.** Every load-bearing claim or mechanism in the
  source model documents → the interface row or spec section that carries
  it, or an explicit **dropped / narrowed / deferred** entry with partner
  sign-off. A model mechanism stated in prose that constrains code must
  appear as a type/signature in the interface table — if it cannot be typed
  yet, it becomes a named open decision, never silence.
- **Commitment layering.** Interface-table rows are marked *model
  commitment* (from the source design; changes need the partner) or
  *decomposition choice* (orchestrator-owned). Execution-time interface
  changes are adjudicated against this marking.

Subsystem charters that port existing rule inventories must be chartered as
**residue after declarations**: the charter states which rules the
declarative layer expresses, and the hand-written subsystem gets what
remains — never "port the old inventory" wholesale.

**Partner approval of this document is the only human gate before spec
derivation.**

## Phase C4 — Specs + fidelity check

Derive one spec per subsystem (`docs/superpowers/specs/…-<slug>-design.md`),
each embedding its interface rows and the global constraints verbatim. Then
one fresh-eyes agent checks: every design requirement covered by exactly one
spec; no contradictions; signatures identical everywhere; no placeholders;
**the fidelity leg — specs and design diffed against the source model
documents clause-by-clause, with the traceability table as the checklist**;
and **the delegation check** (rework-reduction spec, intervention 1): for
each spec, is there a behavioural decision the spec *names* but delegates to
the implementer whose consequences are visible outside the module? If so,
the spec must decide it, not name it. This is a reading task for a judging
agent — do not attempt to score it lexically. Fix findings inline.

## Phase C5 — Handoff

Commit the package (design doc, specs, tables, survey reports worth keeping).
Ledger records: package contents and commit, settled decisions, open
decisions, coverage and traceability pointers. Then **end the session** —
conduction starts fresh with superconductor, which consumes the package via
its intake phase. Do not begin dispatching operators from this session.

## Red flags — stop and re-ground

- Survey scopes written from memory of the system rather than the inventory.
- A report's claim entering the design without verified-at or a primary read.
- "The docs say the system works like X" as load-bearing evidence.
- A model-doc mechanism you're about to carry as prose because typing it is
  hard — that's an open decision, surface it.
- Resolving a source-doc contradiction yourself because the answer "seems
  obvious."
