# Peer-session workflow for supercomposer / superconductor

Status: approved by the partner 2026-11-13. Items marked **(call)** were choices made while
drafting that the partner approved with the document. One item is still **(open)**: starting
the next task during the previous task's review. It is outside the first plan until the
ledger measurement is in.

## Intent

The composer → conductor → operator composition is worth keeping: a big-picture agent
adjudicates among implementers, and a whole spec suite can be driven to production. What is
wrong today is how much of it sits waiting.

- Operators are background subagents that dispatch their implementers and reviewers in the
  foreground, so the operator is blocked for every leaf, and the conductor is blocked on the
  operators. Two levels wait on a third.
- Subagents get a 5-minute prompt cache. A leaf that runs longer than that costs the operator
  a cold re-read every time.
- The composer ends its session before conduction starts. An escalation waits for the partner
  to open a new composer session by hand.
- Adjustments to a plan leak into the work as history: agents that lived through three
  strategies write comments about the two that were dropped.

The partner wants the same value with every agent either working or cheaply parked, the
composer reachable without a human in the loop, and the judging agent kept free of the path
the build took.

## Goals

1. No agent blocks on a child for longer than its cache lifetime as a matter of structure.
2. Escalations reach a composer and are ruled on without the partner starting anything.
3. Every adjudication and merge review judges the design as it is now, not how it got there.
4. As much runs at once as the real dependencies allow, at every layer: units, tasks,
   planning and review. The partner wants this done more intelligently than the April fork,
   which means parallel work is always separated by construction (dependency edges, disjoint
   files), every review is kept, and the workers can talk.
5. No code we maintain. Skill text and settings only, on Claude Code's own primitives.

## Non-goals

- Changing `superpowers:subagent-driven-development`. Inside one build unit it runs as
  written, one task at a time. This is a scoping choice, not a verdict on parallel
  implementers. The April 2026 `tentacles` fork ran them in parallel and gave poor, expensive
  results, but it changed several things at once: implementers could not talk to each other,
  shared files were handled by a conflict-resolver after the fact, the plans were cut by
  domain, and implementers and reviewers were pinned to cheaper models. No run data survives
  to say which of those did the damage. This design gets its parallelism from the build
  graph, where the first three are addressed by construction, and leaves the unit size as the
  dial (see the build graph).
- Multi-contributor safety. These repos are written only by the partner's own sessions, so
  contract changes carry no coordination cost.
- Agent teams. Teammates cannot spawn teammates, block on their own subagents, cannot be
  resumed, and get the 5-minute cache.
- Cloud or cross-machine sessions.

## Anti-goals

- Work invented to keep a cache warm. The existing rule stands: never send a message or
  schedule a wakeup solely to keep a cache warm.
- A composer that accumulates rulings. If the judging context holds the list of what changed,
  the design has failed even if every session stays busy.
- Removing a review checkpoint to save a dispatch.

## Constraints and verified facts

Observed on Claude Code 2.1.325 (spike, 2026-11-13) unless marked as from the docs.

| Fact | Source |
|---|---|
| `SendMessage` to an idle local session starts a new turn there by itself; to a busy one it is read at the next tool round. No approval step on the receiver. | spike |
| A session spawned from the shell can message another spawned session by its `-n` name. | spike |
| A reply sent "upward" lands on the top-level session, never on a subagent that spawned the sender. | spike |
| Receivers treat a peer message as a request to judge, not a command. A bare token with no ask is ignored. | spike |
| `claude -p --resume <id> --fork-session` creates an independent session that has the original's context. The original's transcript is byte-identical afterwards. Two forks can run at once. | spike |
| A fork's first call reads the original's cached prefix (about 39k tokens read, under 300 written). | spike |
| A forked or spawned session obeys the global "all work in a worktree" rule and may refuse to write otherwise. | spike |
| `claude --bg` refuses to start in a directory that has not accepted the workspace trust prompt interactively, including `~/Projects/super`. A prior `-p` run does not grant trust. | spike |
| Headless `-p` sessions skip the trust prompt, appear in `claude agents --json`, and can be messaged while their stdin is held open, but `claude logs` / `claude stop` do not manage them. | spike |
| On this machine `claude` is a cmux shim that adds a permission-request hook; an unapproved tool call in a headless session is denied only after about 2 minutes. `--permission-mode acceptEdits` plus explicit `--allowedTools` runs unattended. | spike |
| Main sessions get a 1-hour cache on a subscription. Subagents, forks and teammates get 5 minutes unless `subagentPromptCacheTtl` is set to `1h`. | docs |
| A peer message never counts as the partner's consent and cannot answer a permission prompt. | docs |
| The cache is keyed on the prefix; a session cannot edit its earlier context, only truncate, summarise or fork. | docs |

## Approaches considered

**A. Same shape, cheaper waits.** Set `subagentPromptCacheTtl: "1h"`, keep the composer alive,
let the conductor message it. Config plus a few lines of skill text. Two levels still sit
blocked; the waits just stop going cold.

**B. Everyone is a session.** Operators become full sessions started by the conductor;
composer, conductor and operators message each other by name. Each operator runs
subagent-driven-development as its own top level, so one nesting level disappears. Chosen by
the partner, because it is the only option that removes a waiting level instead of making it
cheaper.

**C. Agent team.** The built-in experimental feature with composer and conductor merged into
the lead. Least to write. Rejected: teammates block on their subagents, the cache is 5
minutes, and the lead carries both the big picture and dispatch in one context.

A's setting is adopted inside B, because implementers, reviewers and forks are still on the
subagent cache.

## Design

### Roles

```
                 package on disk (design doc + specs + contracts)
                        ^ amended by            ^ read by everyone
                        |
   composer checkpoint (frozen, never written to)
        |  forked once per question
        v
   adjudication fork / merge-review fork  ---- ruling ---->  conductor, operator
                                                                 ^
   conductor (session)  <---- messages by name ---->  operator (session, one per spec)
        admits specs, merges                               |
                                                           v  subagents, serial
                                                      implementer -> reviewer -> fix loop
```

- **Composer.** Co-designs the package with the partner as today, commits it, and ends. It
  must write the partner's reasons into the design doc, because nothing after this point sees
  the conversation.
- **Composer checkpoint.** **(call)** A fresh session that cold-reads the committed package
  and the codebase survey notes, then stops. Its session id goes in the ledger. It is never
  resumed in place and never receives a result. It is deliberately not the co-design session:
  that conversation is also a path, every checkpoint is then the same kind of thing, and a
  package that cannot be understood cold is a defect worth finding early.
- **Composer fork.** Each escalation and each merge review runs in a fresh fork of the
  checkpoint. A fork reads the current package from disk before doing anything. Where disk and
  its inherited context disagree, disk wins; the fork's prompt says so.
- **Conductor.** A session. Admits specs, starts operators, merges, starts composer forks.
  It no longer issues rulings on the design: anything the specs do not answer goes to a fork.
  **(call)** It keeps purely mechanical rulings, such as "which branch do I rebase on".
- **Operator.** A full session, one per spec, in that spec's worktree, named
  `<design-slug>-<spec-slug>`. Runs writing-plans then subagent-driven-development exactly as
  written. Its implementers and reviewers are its direct subagents.

### Adjudication

1. An operator or the conductor hits something the specs do not answer. It writes the question
   to `.superpowers/superconductor/<slug>/questions/<n>.md` and tells the conductor.
2. The conductor starts a fork of the checkpoint with that file as its prompt.
3. The fork rules alone, on anything, including the design's commitments. The partner chose
   this: drift is corrected after the fact, not gated.
4. If the ruling changes the design, the fork rewrites the design doc, specs and contracts as
   current-state text and commits. No "previously", no "changed from", no changelog section in
   the package. Git holds the history.
5. The fork writes its ruling to `rulings/<n>.md` beside the question and ends. The ruling
   gives the commit, the sections to re-read, and, for each running spec whose approach or
   interface changed, the first task that no longer holds.
6. The conductor started the fork as a background command, so it is told when the fork exits.
   It relays a pointer to the ruling to each affected operator. **(call)** Forks do not send
   messages themselves; messaging from a one-shot fork was not verified.

Mechanics **(call)**:

- The package lives on the integration branch. The conductor keeps one worktree of that
  branch for the package. Forks run there, and operators read the package from that path, not
  from the copy in their own older branch.
- Forks that may amend the package run one at a time. Merge-review forks write nothing to the
  package and run in parallel; "filing a question" means writing a question file.
- `rulings/` is the partner's record of what was decided and why. No agent loads it as
  context. This is where drift is noticed and corrected after the fact.

The operator that asked continues anything that does not depend on the answer while it waits,
as the operator briefing already requires.

### Keeping the path out of the work

- A ruling reaches an operator as "the spec now says X, re-read section Y". Never as a diff
  from the old approach.
- When a ruling changes a spec's approach or interface, the conductor stops that operator and
  starts a fresh one on the amended spec. The ruling names the first task that no longer
  holds; the branch is cut back to the commit before it and the fresh operator writes a new
  plan from there. Later tasks are discarded even if some might have survived, so no
  old-approach code or comments carry over. Clarifications go to the warm operator.
  **(call)** This overrides the current "keep operators warm, a cold fix round costs about
  3.7x" guidance for approach changes only.
- Implementer and reviewer briefs are built from the current spec, never from the message
  thread.

### Merge review

After each spec merges into the integration branch, the conductor starts a read-only fork of
the checkpoint: does the merged result still match the design, and do the real implementations
match the contracts their consumers were built against? A fork that finds nothing says one
line. A fork that finds drift files it as a question, which goes through adjudication.

### Re-checkpointing

The checkpoint's context holds the package as it was when read and goes stale as amendments
land. **(call)** After any amendment that changes a contract, or after five amendments of any
kind, the conductor builds a new checkpoint the same way as the first and records it. Forks
already running finish on the old one. The frame-defect tally stays, kept by the conductor in
the ledger; a third defect of one class triggers a re-checkpoint and a line to the partner
instead of a stop.

### Admission without waves

Waves go away. A spec is admitted as soon as every deliverable it depends on has merged,
whether that arrived with a finished spec or at a milestone part-way through one. With
contracts landed first (below), most specs depend only on the contracts commit and are
admitted at once.

**Budget gate (partner's decision).** The gate becomes mechanical and the conductor applies it
without asking. It reads the same usage figure the current gate reads and compares it with
two thresholds:

| Usage | Conductor does |
|---|---|
| below the lower threshold | starts every unit that is ready |
| between the two | reins in concurrency: at most N operators running; a new one starts only when one finishes |
| above the upper threshold | starts no operators; running ones finish their unit; resumes after the reset |

**(call)** Defaults: lower 70%, upper 90%, N = 2, set in one place in the skill. An unreadable
or stale figure counts as the middle band. Composer forks are exempt: a ruling or merge review
is small, and withholding it would stall operators that are already paid for. The HOLD / STOP
recommendations, the per-wave partner decision and the scope gate are removed. The conductor
states the band in its merge summaries.

Nothing waits on the partner. The comprehension gate runs once before the first
admission. Cost calibration is recorded per spec instead of per wave. The conductor posts a
short summary at each merge instead of at each wave boundary.

Milestones **(call)**: a milestone is a point in the spec's serial task order, so everything
merged at a milestone has passed its per-task reviews. A merge-review fork runs on it like any
other merge. The spec's own final review still runs at the end over the whole spec. If a later
ruling changes a merged milestone, the consumers are affected specs like any other and go
through the same replacement rule.

### What the composer does differently when cutting a package

The motivating case is the sim-step-engine build (checked against its transcript, design doc
and ledger on 2026-11-13). Three separate things held specs back:

- **Edges were spec-to-spec.** `world-funding` needed one interface row (S12, the funding
  hook), which was task 11 of 14 in `world-core`'s plan. The design had S12 as its own row,
  but the dependency was declared against the whole spec, so `world-funding` was set to wait
  for all of `world-core`. The hook's late position was real: it depended on earlier tasks.
- **The declared order was looser than the real one.** `world-score` and `map-stream` needed
  only `world-core`'s events and readers, but the design's order put them after
  `ensemble-runner`, and the conductor turned that order into five linear waves.
- **Nobody re-examined the graph.** The conductor reported the hook done and proposed
  nothing. Both early starts happened only because the partner asked.

Two more facts from that run shape the rules. The task order inside a spec is written by the
operator's planning step, not by the composer, so the composer cannot place a deliverable
early by itself. And once specs ran together they began duplicating a shared measurement
step; the partner's ruling was that duplicated effort is worse than lost concurrency.

**Two artifacts instead of one (partner's suggestion, under discussion).** The package keeps
its domain specs: they are organised the way the system is understood, and they stay the
truth that adjudication amends and merge review checks against. A second pass translates them
into a **build graph**: the set of things that get built, in dependency order.

- A build unit is what an operator is assigned. It cites the spec sections it implements,
  lists the files it writes, and lists the deliverables it needs from other units.
- One spec may become several units and one unit may draw on several specs. `world-core`'s
  eleventh task would be its own unit, placed where its dependencies put it.
- No two units that can run together write the same file.
- Units are cut as fine as the dependencies allow: a unit is one serial lane, and anything
  that could run beside it is a different unit. Whatever its size, a unit is a whole operator
  run with every review intact and the usual models, in its own worktree with files no other
  running unit writes, so there is nothing to resolve at merge, and its operator can message
  the others. The composer cuts lanes from what the specs show; operators split further when
  their plan reveals more (see Parallelism at each layer). The ledger records tokens and
  wall-clock per finished unit, so the cost of fine cutting is visible.
- Every edge names rows of the interface table, never a spec or a position in an order. The
  design doc carries no separate "dependency order" section; order is derived from the edges.
- Anything two units would both need to build is its own unit or part of contracts, so that
  running together never means building it twice.
- A unit's assignment lists the rows other units are waiting on. The operator plans those as
  early as their own dependencies allow and reports each one as it passes review.
- The conductor re-derives what can start on every such report, not only when a unit
  finishes.
- The translation is done by a fork of the checkpoint, and redone for the affected units
  when a ruling amends a spec. The graph reports its longest chain; the fresh-eyes check
  challenges every edge on it.

With a build graph, mid-spec milestones are unnecessary and the rules below reduce to how the
graph is drawn. If the build graph is not adopted, they stand as written **(call)**:

- **Dependencies name a deliverable, never a spec.** Each edge in the package says exactly
  what the consumer needs: a type, a function, a table, a behaviour.
- **Anything another spec consumes is pulled forward.** If it is an interface, it goes in the
  contracts commit. If consumers need the real behaviour, it becomes its own small spec that
  the others depend on, instead of a late task inside a large one.
- **A spec that still must produce something mid-way marks it as a milestone.** The operator
  reports the milestone, the conductor merges the branch up to that commit, and the consumers
  are admitted then. The producing operator carries on.
- **Contracts first.** The interface table becomes real types, schemas and stubs that land
  before anything else. **(call)** The composer writes this as a "contracts" spec; one
  operator builds it with the normal review loop, and every other spec depends on it. Stubs
  throw "not implemented"; consumers test against the types with their own fakes.
- **Cut by what gets written.** Each spec lists the files it writes. No two specs that could
  run together write the same file. Shared hotspots (`schema.ts`, migrations, route indexes)
  go into the contracts commit or to one owner spec.
- **The dependency chain is a design target.** The package reports the longest chain of specs
  that must run in order. The fresh-eyes check challenges every remaining edge.

### Parallelism at each layer

One rule does most of the work: **an operator is one serial lane.** A lane is a chain of
tasks where each builds on the one before. All parallelism is between lanes, which are
separate sessions in separate worktrees writing separate files. That is why
subagent-driven-development can stay unchanged and still nothing waits needlessly.

| Layer | What runs together | What keeps it safe |
|---|---|---|
| Units | Every unit whose deliverables have merged. | Edges name interface rows; contracts land first; disjoint files. |
| Tasks | An operator's plan is itself a graph. Where it contains task groups that do not depend on each other and write different files, the operator keeps one group and hands the others back; the conductor starts a sibling operator for each, with that slice of the already-written plan. **(call)** | Same rules as units. Siblings message each other by name. Each lane keeps per-task review. |
| Planning | Operators for units that cannot start yet are still started, to write their plan against the contracts while their dependencies are being built. **(call)** | A plan is cheap to redo if a ruling changes its unit; no code is written until admission. |
| Review | Merge-review forks and adjudication forks run beside the operators and beside each other. | Read-only, or one amending fork at a time. |
| Review inside a lane | Starting task N+1 while task N's review is still running. **(open)** | Not adopted yet. It is the one item here that changes the subagent-driven-development loop, and it only pays if first reviews usually pass clean. Being measured from existing ledgers. |

The budget bands are the only cap. In the middle band, operators that are only planning count
toward N.

### Why sessions stay warm

- The conductor is woken by operator messages and merge events; with several operators those
  arrive well inside an hour.
- An operator is a main session with the 1-hour cache, so a long implementer no longer costs
  it a cold read.
- The checkpoint is read by every fork, and each read resets its timer.
- Implementers, reviewers and forks get the 1-hour cache from the one setting.

Nothing here is a keep-warm ping. A session with nothing to do is allowed to go cold.

### How sessions are started

Operators are managed background sessions: `claude --bg -n <name> "<assignment>"`, launched
with the unit's worktree as the working directory. Verified 2026-11-13: once the partner has
accepted the trust prompt in the repo, `--bg` starts in the repo and in its
`.claude/worktrees/*` children; the session appears in `claude agents --json` with its name
and idle/busy status; a `SendMessage` to it while idle woke it and it replied by name; and
`claude logs`, `attach` and `stop` manage it. It runs the partner's normal session hooks and
permission mode.

- The repo must be trusted once, by the partner, before a first run. The conductor checks
  this at intake by starting one operator and says so plainly if it is refused.
- The conductor learns an operator is idle with `SendMessage`'s `notify_when_idle`, not by
  polling.
- Headless `claude -p` with a held-open input stream also works without trust, but it is not
  managed by `claude logs` / `claude stop`. Not used.

Composer forks are one-shot (`claude -p --resume <checkpoint> --fork-session`), run by the
conductor as a background command.

Every spawned session's prompt must carry: its name, the names of the conductor and the
ledger path, the instruction to address peers by explicit name, the worktree it is already in,
and an explicit permission mode with the git commands it may run.

## What changes where

| File | Change |
|---|---|
| `supercomposer/SKILL.md` | Contracts-first and write-set cutting; record checkpoint id; replace "reappraisal session" with fork behaviour and the current-state writing rule. |
| `superconductor/SKILL.md` | Operators as sessions; admission by dependency; questions go to forks; merge-review forks; re-checkpoint rule; operator replacement on approach change; reconcile now finds live operators with `claude agents` instead of assuming them dead. |
| `superconductor/operator-briefing.md` | Operator is a top-level session; peers addressed by name; leaves are its own subagents; ruling intake as current-state. |
| settings | `subagentPromptCacheTtl: "1h"`. |
| `superpowers-jev` points | `bounce` is no longer needed once sessions address by name. **(call)** |

## Left to the builder

- Exact wording of the skill edits, following `superpowers:writing-skills`.
- The question-file and ledger formats.
- A live drill, in the style of the August routing drill, that proves the spawn mechanism
  once the open item above is settled.
