#!/bin/sh
# Structural checks for SKILL.md frontmatter and required sections
set -e
skill="$(cd "$(dirname "$0")/.." && pwd)/plugins/supersonic/skills/superconductor/SKILL.md"

test -f "$skill" || { echo "FAIL: SKILL.md missing"; exit 1; }
head -1 "$skill" | grep -qx -- '---' || { echo "FAIL: no opening frontmatter delimiter"; exit 1; }
fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
printf '%s\n' "$fm" | grep -qx 'name: superconductor' || { echo "FAIL: bad or missing name"; exit 1; }
keys=$(printf '%s\n' "$fm" | grep -c '^[a-z][a-z-]*:')
[ "$keys" -eq 2 ] || { echo "FAIL: frontmatter must have exactly name and description, found $keys keys"; exit 1; }
desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
case "$desc" in "Use when"*) ;; *) echo "FAIL: description must start with 'Use when'"; exit 1;; esac
[ "${#desc}" -le 500 ] || { echo "FAIL: description over 500 chars (${#desc})"; exit 1; }

# Section headings, exactly, in this order.
expected='## Hard rules
## Phase 0 — Resume check
## Phase 1 — Package intake
## Phase 2 — Admission
## Supervision
## Composer forks
## Optional Jev judgments
## Context economics
## Integration
## Ledger format'
printf '%s\n' "$expected" | while IFS= read -r h; do
  grep -qxF -- "$h" "$skill" || { echo "FAIL: SKILL.md missing section heading: $h"; exit 1; }
done
got=$(grep -xF -f /dev/stdin "$skill" <<EOF
$expected
EOF
)
[ "$got" = "$expected" ] || { echo "FAIL: SKILL.md section headings out of order"; exit 1; }

# The text with line breaks folded, so phrases that wrap still match.
flat=$(tr '\n' ' ' < "$skill" | tr -s ' ')
need() { printf '%s\n' "$flat" | grep -qF -- "$1" || { echo "FAIL: SKILL.md missing: $1"; exit 1; }; }
forbid() { printf '%s\n' "$flat" | grep -qF -- "$1" && { echo "FAIL: SKILL.md must not contain: $1"; exit 1; }; return 0; }

need 'operator-briefing.md'
need 'supercomposer'
need 'supersonic:supercomposer'
forbid 'back to supercomposer'
grep -q -e 'frame-defect' -e 'Frame-defect' "$skill" || { echo "FAIL: SKILL.md missing the frame-defect tally"; exit 1; }
need "this skill's \`budget.sh\`"
need 'budget state MUST NOT be an input to tier selection'
grep -qi 'opus' "$skill" \
  && { echo "FAIL: operator tier must not be hardcoded to a specific model (Opus found)"; exit 1; }
need 'rationale'

# Sessions, admission, bands, resume.
for s in 'claude --bg -n' '--allowedTools="' 'notify_when_idle' 'claude agents --json' 'claude stop' \
         'BAND:' 'LOWER' 'seven_day' 'assignments/<unit-slug>.md' '<design-slug>-<unit-slug>' \
         'build graph' 'Never send a message or schedule a wakeup solely to keep a cache warm'; do
  need "$s"
done
# The launch line sets its cwd with env -C, never with a separate cd.
need 'env -C "<unit worktree>" claude --bg -n <design-slug>-<unit-slug>'
for s in 'VERDICT: STOP' 'VERDICT: HOLD' 'scope gate' 'agentId' 'Operators from prior sessions are dead' \
         'rate-limits.json' 'defer-only' 'specs completed'; do
  forbid "$s"
done
grep -qiw -e 'wave' -e 'waves' "$skill" && { echo "FAIL: SKILL.md still speaks of waves"; exit 1; }

# Ledger sections, in order.
ledger=$(awk '/^## Ledger format/{f=1} f' "$skill")
lexp='Package worktree:
Build graph:
## Checkpoints
## Units
## Questions
## Frame-defect tally
## Integration
## Cost'
lgot=$(printf '%s\n' "$ledger" | sed -n -e 's/^    \(Package worktree:\).*/\1/p' -e 's/^    \(Build graph:\).*/\1/p' \
  -e 's/^    \(## Checkpoints\)$/\1/p' -e 's/^    \(## Units\)$/\1/p' -e 's/^    \(## Questions\)$/\1/p' \
  -e 's/^    \(## Frame-defect tally\)$/\1/p' -e 's/^    \(## Integration\)$/\1/p' -e 's/^    \(## Cost\)$/\1/p')
[ "$lgot" = "$lexp" ] || { echo "FAIL: ledger format sections missing or out of order"; printf '%s\n' "$lgot"; exit 1; }
for s in 'status: planning | admitted | running | complete | stopped | replaced | deferred' \
         '[defect-class: <slug>]' 'changes contract: yes|no' 'seven_day <pct>' 'session <id>'; do
  printf '%s\n' "$ledger" | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$s" \
    || { echo "FAIL: ledger format missing: $s"; exit 1; }
done

# Hand-back siblings keep their rows and their plan, and know each other.
need '- Plan: none | <plan path> at <sha>, tasks <numbers> (already written)'
need '- Siblings: <session names, or none>'
need "only that sibling's merge counts"
need 'remove them from'
need 'Sibling notice'
need '`Produces rows others wait on:` the rows from step 1'

# Every conductor->operator message template ends in an imperative, never a bare pointer.
need 'Re-read'
forbid 'ruling ready'

# Composer forks: questions, rulings, merge review, re-checkpoint, replacement.
for s in 'composer-forks.md' '--fork-session' 'questions/<id>.md' 'rulings/<id>.md' \
         'first task that no longer holds' 'five' 'Changes contract' 'one writer' 'No agent loads'; do
  need "$s"
done
# Replacement: the assignment names kept commits and the superseded plan; cut rows are unmerged.
need '- Replaces: none | an earlier operator; kept commits <base sha>..<kept sha> stand and are not redone; superseded plan <plan path>'
need 'Bash(git rm:*)'
need 'Write nothing else about the old approach in the assignment'
need '- unmerged row <row id>: cut by ruling <id>'
need 'so nothing new is admitted on it'
need 'Do not revert the earlier merge on the integration branch'
need "the fresh report's merge supersedes it"
need 'only for the merge commit you just made in step 1'
for s in 'Bounce rule' 'jev ask bounce' '**bounce**' 'Adjudicate yourself' 'exact delta'; do
  forbid "$s"
done

# Jev section: bounce is retired; citation runs inside the adjudication fork.
grep -q '^## Optional Jev judgments' "$skill" \
  || { echo "FAIL: SKILL.md missing the Optional Jev judgments section"; exit 1; }
for pt in defect-class surface-route; do
  grep -qF "**$pt**" "$skill" || { echo "FAIL: SKILL.md never names Jev point $pt"; exit 1; }
done
for s in 'superpowers-jev:jev' 'jev record' 'jev ask defect-class' \
         'jev ask surface-route' \
         '"enabled": false'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: SKILL.md Jev section missing: $s"; exit 1; }
done
need 'Surface to your partner'
echo "PASS: SKILL.md structure"
