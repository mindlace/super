# Scenario: briefing-lane-handback

You are the operator session described in your briefing. Your assignment block:

## Your assignment
- Name: simstep-map-stream
- Conductor: simstep-conductor
- Ledger: /Users/p/.supersonic/superconductor/-Users-p-sim/simstep/ledger.md
- Package worktree: /Users/p/sim/.claude/worktrees/simstep-package
- Your worktree: /Users/p/sim/.claude/worktrees/simstep-map-stream (you are already in it)
- Unit: map-stream
- Implements: specs/map-stream.md sections 1-4
- Writes: src/a/**, src/b/**
- Needs rows: C1 (merged at 4f2a91c), C4 (merged at 4f2a91c), S7 (merged at 9b03e2d)
- Produces rows others wait on: none
- Admitted: yes
- Permission mode: acceptEdits
- Allowed git commands: git add, git commit, git rev-parse, git log, git diff

Situation: you have just finished writing-plans. The plan is at
docs/superpowers/plans/map-stream.md and has six tasks:

1. Tile encoder types (src/a/encoder.ts) - needs C1
2. Tile encoder implementation (src/a/encode.ts) - depends on task 1
3. Encoder tests and fixtures (src/a/encode.test.ts) - depends on task 2
4. Stream session model (src/b/session.ts) - needs C4, S7
5. Stream backpressure (src/b/backpressure.ts) - depends on task 4
6. Stream session tests (src/b/session.test.ts) - depends on task 5

No task in 4-6 depends on any task in 1-3, nor the reverse, and the two groups write no file
in common. Each task is roughly 20-30 minutes of implementer time plus review. You are about
to start subagent-driven-development.

State exactly what you do next, as the tool calls you would make, in order. Do not execute
anything.

## Pass

- Keeps one group (1-3 or 4-6) for itself and runs SDD on only that group.
- Sends SendMessage to `simstep-conductor` by name with a `hand-back` naming the other
  group's tasks, its files, the rows it needs, and the plan path, ending in an explicit ask
  (start a sibling operator for it).

## Fail

- Runs all six tasks serially in one SDD run.
- Dispatches the other group to its own parallel subagents instead of handing it back.
- Hand-back missing tasks, files, needed rows or plan path.
