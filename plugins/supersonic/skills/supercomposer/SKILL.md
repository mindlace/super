---
name: supercomposer
description: Use when co-designing a build large enough to decompose into multiple specs, when a design requires systemic understanding of existing code before it can be written, when cutting such a package into contracts and build units for peer-session conduction, or when started as a composer fork to rule on a supersonic:superconductor question or merge review. Produces the composition package a superconductor run executes. Not for single-spec features — use superpowers:brainstorming for those.
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
  costs rework during execution later.
- **Ground truth outranks documentation.** CLAUDE.md, architecture docs, and
  code comments are testimony; config and code are evidence. Every
  doc↔code contradiction found is a finding to surface, never silently
  resolved toward the doc.
- **Append to the shared ledger after every state change**
  (`.superpowers/superconductor/<design-slug>/ledger.md` — one ledger serves
  composition and conduction; composition entries are the package's birth
  record).

## Phase C0 — Mode

If you were started from one of the prompts in `composer-forks.md` (it names
a question to rule on, a merge to review, or the build graph to write), you
are a **composer fork**: follow that prompt and `## Composer forks` below,
and skip C1–C5. Otherwise this is **fresh composition**: C1 through C5.

Once a package is committed, nobody comes back to this session. Every later
design question, merge review and graph rewrite runs in a fork of the
checkpoint made in C5.

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
   *Optional Jev citation check:* if the `superpowers-jev` plugin is
   installed, load `superpowers-jev:jev` and run `jev cite <report>
   --root <project> > <state file>`, then `jev ask citation --state
   <state file>`, on each returned survey report.
   - In shadow mode, read the report as you do today, then `jev record`
     your verdict for each claim, in the order of the state file's
     `claims` (`detail.labels` repeats each claim; unreadable claims are
     not in it).
   - On: mark every claim in `detail.flagged` or `detail.also_flagged`
     as *unverified* in the report, and re-check it at primary source
     before it enters the design.
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

Write the partner's reasons into the design doc beside each ruling and
choice they explain. Nothing downstream sees this conversation: operators,
the conductor and every composer fork read only the package.

## Phase C3 — The design doc

Path: `docs/superpowers/design/YYYY-MM-DD-HHMM-<topic>.md`. Required
sections: **Goal**; **Subsystems** (one-paragraph scope each, with a
`<slug>` and the interface rows it needs); **Interface table**;
**Global constraints**; **Out of scope**; and four this skill adds below.
Every edge names interface rows, never a spec or a position in an order;
build order is derived from those edges, so the doc has no separate order
section.

- **Contracts.** The interface table as code: real types, schemas and
  stubs that throw "not implemented", written as a `contracts` spec. One
  operator builds it with the normal review loop and it lands before
  anything else; every other unit builds against it, testing with its own
  fakes.
- **Write sets.** The files each subsystem writes. No two units that can
  run together write the same file. A shared hotspot (`schema.ts`,
  migrations, route indexes) goes into contracts or to one owner, and the
  others need that owner's row.
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
agent — do not attempt to score it lexically. The same agent takes the
longest chain of row edges in the specs (the chain the build graph's
`Longest chain:` line will report) and challenges every edge on it: does the
consumer need that row, and does the row need everything before it? Fix
findings inline.

**The build graph.** The specs stay organised the way the system is
understood; the build graph lists the units operators are assigned, at
`docs/superpowers/design/<design-file-stem>-build-graph.md`. A unit is one
serial lane: a chain of work where each step builds on the one before. It
cites the spec sections it implements, and one spec may become several
units or one unit draw on several specs.

- Cut units as fine as the dependencies allow: anything that could run
  beside a lane is a different unit, so a consumer waits only for the unit
  that produces its rows. When a split needs a seam the interface table
  lacks (a call point, an emit side), add that row as a decomposition
  choice and split.
- Anything two units would both need to build is its own unit or part of
  contracts, so running together never means building it twice.

The graph is one table followed by its longest chain:

| unit | implements (spec §) | writes | needs rows | produces rows others wait on |
|---|---|---|---|---|
| `contracts` | `contracts` §… | `src/contracts/**` | — | every contract row |
| `<unit>` | `<slug>` §… | its write set | the rows it consumes | rows other units need |

`Longest chain: contracts -> <unit> -> <unit>`

`contracts` is always a unit and needs no rows. Writing the graph from the
committed package is the translation step in Phase C5.

**Optional Jev coverage pre-pass.** If the `superpowers-jev` plugin is
installed (load `superpowers-jev:jev`), run `jev coverage --design <design
doc> --spec <spec> [--spec <spec> ...]` before you dispatch the fresh-eyes
agent.

- On, and only when the result is `confident`: its `targets` become a
  mandatory target list in that agent's brief. The targets are the
  traceability requirements carried by zero specs, or by two or more. The
  agent still runs every leg, including the contradiction check and the
  delegation check.
- In shadow mode, or when the result is not `confident`, brief the agent
  as you do today.

Either way, record the agent's coverage result with `jev record <call_id>
'{"uncovered": [...], "multiply_covered": [...]}'`, using requirement
indices in traceability-table order.

## Phase C5 — Handoff

1. **Commit the package** (design doc, specs, tables, survey reports worth
   keeping). Ledger records: package contents and commit, settled
   decisions, open decisions, coverage and traceability pointers.
2. **Integration branch and package worktree.** Create the branch
   `superconductor/<design-slug>` at that commit and one worktree of it, per
   the project's worktree convention. This is the package worktree: the
   checkpoint and every fork run there, and operators read the package from
   it. Record its path as the ledger's header line
   `Package worktree: <absolute path>`.
3. **Checkpoint.** From the package worktree, start a fresh session with
   the `## Checkpoint` prompt and command in `composer-forks.md`; it
   cold-reads the package and stops. Run it on the most capable model
   available to this session: every ruling is made on it, and budget is not
   an input. Record its session id and model under the ledger's
   `## Checkpoints`, so every fork reuses that model. It is deliberately not this session: a
   package that cannot be understood cold is a defect to find now.
4. **Build graph.** Run the `## Build-graph fork` from `composer-forks.md`
   (fork name `graph-all`) and wait for it to exit; its `.out` file holds
   `Build graph @ <sha>` and its `Longest chain:` line. If it hit its time
   limit or printed neither, run it once more as `graph-all@2`. Record it as the ledger's header line
   `Build graph: <build-graph path> @ <sha>`, below `Package worktree:`;
   when a later fix reruns the fork, update the sha.
5. **Fresh-eyes check of the chain.** One fresh-eyes agent challenges every
   edge on the chain the graph's `Longest chain:` line reports: does the
   consumer need that row, and does the row need everything before it? A
   chain that differs from the one C4 challenged is itself a finding: the
   translation added or dropped an edge. Fix findings in the package as
   current state, editing the files in the package worktree by absolute
   path and committing there (`git -C <package worktree> add` / `commit`):
   from step 2 on, the integration branch is the package, and a commit on
   this session's own branch never reaches a fork. If a fix touches a spec,
   rerun the build-graph fork for the units that spec feeds. If a fix
   changes a contract row, make a new checkpoint the same way and record it.
6. **Commit in the package worktree and end the session.** Conduction
   starts fresh with supersonic:superconductor, which consumes the package via its intake
   phase. Do not begin dispatching operators from this session.

## Composer forks

A composer fork is a one-shot session: `claude -p --resume <checkpoint id>
--fork-session`, run from the package worktree. The checkpoint itself is
frozen: it is never resumed in place and never written to, so every fork
starts from the same cold read of the package. The prompts and command lines
are in `composer-forks.md`: `## Checkpoint`, `## Adjudication fork`,
`## Merge-review fork`, `## Build-graph fork`. As a fork:

- **Disk wins.** Read the package files the job touches as they are on disk
  before doing anything. Your checkpoint read and the question's quotes may
  be older; where they disagree with the disk, the disk is the package.
- **Rule alone, on anything**, including the design's model commitments.
  Nobody approves a ruling first; drift is corrected after the fact, from
  `rulings/`.
- **Write the package as current state.** An amended passage of the design
  doc, a spec, the contracts or the build graph reads as if it had always
  said this: no "previously", no "changed from", no changelog section, and
  no mention of the approach it replaces, of plan tasks or of code already
  written. Git holds the history. Commit the amendment.
- **Write the ruling file and end.** The ruling says what the package now
  says, the sections to re-read, and for each affected running unit either
  `clarification` or the first task that no longer holds. `rulings/` is the
  partner's record; no agent loads it as context.
- **Send no messages.** Whoever started the fork runs it as a background
  command and reads its output when it exits.
- **One amending fork at a time.** Adjudication and build-graph forks may
  amend the package and run one at a time. Merge-review forks are read-only:
  they write nothing to the package, only a question file when something
  departs, so they run in parallel.

## Red flags — stop and re-ground

- Survey scopes written from memory of the system rather than the inventory.
- A report's claim entering the design without verified-at or a primary read.
- "The docs say the system works like X" as load-bearing evidence.
- A model-doc mechanism you're about to carry as prose because typing it is
  hard — that's an open decision, surface it.
- Resolving a source-doc contradiction yourself because the answer "seems
  obvious."
- A partner ruling in the design doc without the partner's reasons beside
  it.
- Two units that can run together with overlapping write sets.
- "Previously", "changed from", "instead of" or a list of changes in
  package text. Rewrite the passage as the current state.
- Resuming the checkpoint without `--fork-session`, or sending it anything.
  It is never resumed in place.
