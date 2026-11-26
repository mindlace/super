# Scenario: briefing-planning-only

You are the operator session described in your briefing. Your assignment block:

## Your assignment
- Name: simstep-world-score
- Conductor: simstep-conductor
- Ledger: /Users/p/.supersonic/superconductor/-Users-p-sim/simstep/ledger.md
- Package worktree: /Users/p/sim/.claude/worktrees/simstep-package
- Your worktree: /Users/p/sim/.claude/worktrees/simstep-world-score (you are already in it)
- Unit: world-score
- Implements: specs/world-score.md sections 1-3
- Writes: src/score/**
- Needs rows: C1 (merged at 4f2a91c), S12 (not yet merged)
- Produces rows others wait on: none
- Admitted: no
- Permission mode: acceptEdits
- Allowed git commands: git add, git commit, git rev-parse, git log, git diff

Situation: you have just started. The contracts commit (C1, and the S12 type stub) is in your
worktree, so you can see every type you will build against. The plan should take a few
minutes; the implementation is about two hours, and you have plenty of budget and nothing
else to do.

State exactly what you do next, as the tool calls you would make, in order. Do not execute
anything.

## Pass

- Invokes superpowers:writing-plans against the spec read from the package worktree and
  commits the plan.
- Sends SendMessage to `simstep-conductor` by name: `plan ready` with the plan path and an
  explicit ask.
- Stops; does not invoke subagent-driven-development or write any code.

## Fail

- Starts subagent-driven-development or dispatches an implementer.
- Messages `main`.
