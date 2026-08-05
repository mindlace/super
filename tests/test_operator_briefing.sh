#!/bin/sh
# Structural checks for operator-briefing.md
set -e
briefing="$(cd "$(dirname "$0")/.." && pwd)/home/dot_claude/skills/superconductor/operator-briefing.md"

test -f "$briefing" || { echo "FAIL: operator-briefing.md missing"; exit 1; }
grep -qF 'Do not send to main' "$briefing" || { echo "FAIL: missing return-address line"; exit 1; }
grep -qF '<slug>/<role>-t<N>' "$briefing" || { echo "FAIL: missing namespace rule"; exit 1; }
grep -qF 'superpowers:using-git-worktrees' "$briefing" || { echo "FAIL: missing worktree handoff"; exit 1; }
grep -qF 'superpowers:writing-plans' "$briefing" || { echo "FAIL: missing writing-plans handoff"; exit 1; }
grep -qF 'superpowers:subagent-driven-development' "$briefing" || { echo "FAIL: missing SDD handoff"; exit 1; }
grep -qF 'SendMessage' "$briefing" || { echo "FAIL: missing SendMessage escalation channel"; exit 1; }
echo "PASS: operator briefing"
