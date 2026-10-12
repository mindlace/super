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

for s in 'Phase 0' 'Phase 1' 'Phase 2' 'Supervision' 'Context economics' 'Integration' 'Ledger format' 'Hard rules'; do
  grep -q "## .*$s" "$skill" || { echo "FAIL: SKILL.md missing section: $s"; exit 1; }
done
grep -qF 'operator-briefing.md' "$skill" || { echo "FAIL: SKILL.md never references the briefing"; exit 1; }
grep -qF 'rate-limits.json' "$skill" || { echo "FAIL: SKILL.md never references the bridge file"; exit 1; }
grep -qF 'supercomposer' "$skill" || { echo "FAIL: SKILL.md never references supercomposer (package intake)"; exit 1; }
grep -q 'frame-defect\|Frame-defect' "$skill" || { echo "FAIL: SKILL.md missing the frame-defect tally"; exit 1; }
grep -qF 'budget.sh' "$skill" || { echo "FAIL: gate never runs budget.sh"; exit 1; }
grep -qF 'seven_day' "$skill" || { echo "FAIL: gate never references seven_day"; exit 1; }
grep -qF 'defer-only' "$skill" || { echo "FAIL: gate is not declared defer-only"; exit 1; }
grep -qF 'specs completed' "$skill" || { echo "FAIL: calibration must divide by specs completed"; exit 1; }
grep -qF 'budget state MUST NOT be an input to tier selection' "$skill" \
  || { echo "FAIL: budget-independence invariant missing"; exit 1; }
grep -qi 'opus' "$skill" \
  && { echo "FAIL: operator tier must not be hardcoded to a specific model (Opus found)"; exit 1; }
grep -qF 'rationale' "$skill" \
  || { echo "FAIL: tier decisions must be recorded with a rationale"; exit 1; }
grep -qF 'supersonic:supercomposer' "$skill" \
  || { echo "FAIL: SKILL.md must route package work to supersonic:supercomposer"; exit 1; }
grep -qF 'back to supercomposer' "$skill" \
  && { echo "FAIL: un-namespaced route 'back to supercomposer'"; exit 1; }
grep -qF "this skill's \`budget.sh\`" "$skill" \
  || { echo "FAIL: gate must run this skill's budget.sh"; exit 1; }
echo "PASS: SKILL.md structure"
