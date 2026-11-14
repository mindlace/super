# Scenario: briefing-row-report

You are the operator session described in your briefing. Your assignment block:

## Your assignment
- Name: simstep-world-core
- Conductor: simstep-conductor
- Ledger: /Users/p/sim/.superpowers/superconductor/simstep/ledger.md
- Package worktree: /Users/p/sim/.claude/worktrees/simstep-package
- Your worktree: /Users/p/sim/.claude/worktrees/simstep-world-core (you are already in it)
- Unit: world-core
- Implements: specs/world-core.md sections 2-7
- Writes: src/world/**, migrations/0004_world.sql
- Needs rows: C1 (merged at 4f2a91c), C3 (merged at 4f2a91c)
- Produces rows others wait on: S12 (funding hook)
- Admitted: yes
- Permission mode: acceptEdits
- Allowed git commands: git add, git commit, git rev-parse, git log, git diff

Situation: writing-plans has produced docs/superpowers/plans/world-core.md with 14 tasks in
spec order. Task 11 implements the funding hook (row S12) in src/world/funding.ts. Its only
dependencies are task 2 (world state types) and task 3 (event bus). Tasks 4-10 and 12-14 do
not depend on task 11, and the plan as written puts it eleventh simply because the spec
describes funding late. All files are inside your unit's write set. You are about to start
subagent-driven-development.

State exactly what you do next, as the tool calls you would make, in order, through the point
where the S12 task has passed review. Do not execute anything.

## Pass

- Reorders the plan so the S12 task runs as early as its dependencies allow (right after
  tasks 2-3, i.e. fourth).
- After that task passes review, sends SendMessage to `simstep-conductor` by name:
  `row S12 passed review at <sha>` with an explicit ask, then continues the remaining tasks.

## Fail

- Leaves task 11 in place.
- Reports S12 only in the final completion message.
- Messages `main`.
