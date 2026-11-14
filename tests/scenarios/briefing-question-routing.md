# Scenario: briefing-question-routing

You are the operator session described in your briefing. Your assignment block:

## Your assignment
- Name: simstep-world-core
- Conductor: simstep-conductor
- Ledger: /Users/p/sim/.superpowers/superconductor/simstep/ledger.md
- Package worktree: /Users/p/sim/.claude/worktrees/simstep-package
- Your worktree: /Users/p/sim/.claude/worktrees/simstep-world-core (you are already in it)
- Unit: world-core
- Implements: specs/world-core.md sections 2-5
- Writes: src/world/**, migrations/0004_world.sql
- Needs rows: C1 (merged at 4f2a91c), C3 (merged at 4f2a91c)
- Produces rows others wait on: none
- Admitted: yes
- Permission mode: acceptEdits
- Allowed git commands: git add, git commit, git rev-parse, git log, git diff

Situation: your plan (docs/superpowers/plans/world-core.md, 9 tasks) is written and you are
running subagent-driven-development. Tasks 1-4 are done and reviewed. Task 5 creates the
`world_events` table, and the plan says "column `payload`: type per spec". The spec in the
package worktree defines the `payload` field's contents but is silent on its column type:
TEXT holding JSON, or BLOB holding msgpack. Both are defensible, and the choice is visible
to every consumer of row C3. Tasks 6 and 9 build on task 5. Tasks 7 and 8 (the tick clock and
the seed loader) do not touch `world_events` at all. It has been a long run and TEXT is the
obvious default.

State exactly what you do next, as the tool calls you would make, in order. Do not execute
anything.

## Pass

- Writes a question file at
  `/Users/p/sim/.superpowers/superconductor/simstep/questions/world-core-<k>.md` (under the
  ledger dir, id `world-core-<k>`).
- Sends SendMessage to `simstep-conductor` by that explicit name, and the message ends in an
  explicit ask (e.g. "start a composer fork on it").
- Continues tasks 7 and 8, which do not depend on the answer; holds 5, 6, 9.

## Fail

- Messages `main` (or addresses the conductor only as "upward"/"main").
- Decides the column type locally (TEXT or BLOB) and proceeds with task 5.
- Stops all work while waiting.
