# Peer-session workflow for supercomposer / superconductor

Status: draft for discussion. Items marked **(call)** are choices made while drafting, not
decisions the partner made. Items marked **(open)** are unresolved.

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
4. More of a package can run at once, by how the composer cuts it.
5. No code we maintain. Skill text and settings only, on Claude Code's own primitives.

## Non-goals

- Parallel implementers inside a spec. The April 2026 `tentacles` fork did this and gave poor,
  expensive results. Task order inside a spec stays serial, and
  `superpowers:subagent-driven-development` runs unchanged.
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

- **Composer checkpoint.** The composer co-designs the package with the partner as today. When
  the package is committed it stops and records its session id in the ledger. From then on it
  is never resumed in place and never receives a result.
- **Composer fork.** Each escalation and each merge review runs in a fresh fork of the
  checkpoint. A fork reads the current package from disk before doing anything, because the
  checkpoint's in-context copy may be stale.
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
5. The fork messages the asker and the conductor: the commit, which sections to re-read, and
   whether any running spec's approach or interface changed. Then it ends.

The operator that asked continues anything that does not depend on the answer while it waits,
as the operator briefing already requires.

### Keeping the path out of the work

- A ruling reaches an operator as "the spec now says X, re-read section Y". Never as a diff
  from the old approach.
- When a ruling changes a spec's approach or interface, the conductor stops that operator and
  starts a fresh one on the amended spec; completed tasks that still hold are kept on the
  branch. Clarifications go to the warm operator. **(call)** This overrides the current
  "keep operators warm, a cold fix round costs about 3.7x" guidance for approach changes only.
- Implementer and reviewer briefs are built from the current spec, never from the message
  thread.

### Merge review

After each spec merges into the integration branch, the conductor starts a read-only fork of
the checkpoint: does the merged result still match the design, and do the real implementations
match the contracts their consumers were built against? A fork that finds nothing says one
line. A fork that finds drift files it as a question, which goes through adjudication.

### Re-checkpointing

The checkpoint's context holds the original design and goes stale as amendments land.
**(call)** After any amendment that changes a contract, or after five amendments of any kind,
the conductor starts a fresh composer session that cold-reads the current package and the
codebase survey notes, and records it as the new checkpoint. The old one is abandoned.

### Admission without waves

Waves go away. A spec is admitted as soon as every deliverable it depends on has merged,
whether that arrived with a finished spec or at a milestone part-way through one. With
contracts landed first (below), most specs depend only on the contracts commit and are
admitted at once. The budget gate stays and is applied per admission.

### What the composer does differently when cutting a package

The motivating case, from the partner: in the sim-step-engine build, two specs depended on
something that was roughly the eleventh task of the `world-core` spec. Neither could start
until all of `world-core` had finished and merged. The dependency was on one deliverable, but
it was expressed as a dependency on a whole spec, and the deliverable sat late in that spec.

Proposed **(call)**:

- **Dependencies name a deliverable, never a spec.** Each edge in the package says exactly
  what the consumer needs: a type, a function, a table, a behaviour.
- **Anything another spec consumes is pulled forward.** If it is an interface, it goes in the
  contracts commit. If consumers need the real behaviour, it becomes its own small spec that
  the others depend on, instead of a late task inside a large one.
- **A spec that still must produce something mid-way marks it as a milestone.** The operator
  reports the milestone, the conductor merges the branch up to that commit, and the consumers
  are admitted then. The producing operator carries on.
- **Contracts first.** The interface table becomes a commit of real types, schemas and stubs
  that lands before any operator starts. Consumers build against the stub.
- **Cut by what gets written.** Each spec lists the files it writes. No two specs that could
  run together write the same file. Shared hotspots (`schema.ts`, migrations, route indexes)
  go into the contracts commit or to one owner spec.
- **The dependency chain is a design target.** The package reports the longest chain of specs
  that must run in order. The fresh-eyes check challenges every remaining edge.

### Why sessions stay warm

- The conductor is woken by operator messages and merge events; with several operators those
  arrive well inside an hour.
- An operator is a main session with the 1-hour cache, so a long implementer no longer costs
  it a cold read.
- The checkpoint is read by every fork, and each read resets its timer.
- Implementers, reviewers and forks get the 1-hour cache from the one setting.

Nothing here is a keep-warm ping. A session with nothing to do is allowed to go cold.

### How sessions are started

**(open.)** Two mechanisms work; neither is clean yet.

- `claude --bg -n <name>` gives managed sessions (`claude agents`, `logs`, `attach`, `stop`)
  but needs the directory to be trusted interactively first. Whether trusting a repo covers
  its `.claude/worktrees/*` children is untested.
- Headless `claude -p` with a held-open input stream needs no trust but is not managed by
  `claude logs` / `claude stop`, and holding the stream open is plumbing we would own.

Composer forks are one-shot (`-p --resume <checkpoint> --fork-session`), have no such problem,
and are settled.

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
