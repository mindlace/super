#!/bin/sh
# Structural checks for the supercomposer SKILL.md
set -e
skill="$(cd "$(dirname "$0")/.." && pwd)/home/dot_claude/skills/supercomposer/SKILL.md"

test -f "$skill" || { echo "FAIL: supercomposer SKILL.md missing"; exit 1; }
head -1 "$skill" | grep -qx -- '---' || { echo "FAIL: no opening frontmatter delimiter"; exit 1; }
fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
printf '%s\n' "$fm" | grep -qx 'name: supercomposer' || { echo "FAIL: bad or missing name"; exit 1; }
keys=$(printf '%s\n' "$fm" | grep -c '^[a-z][a-z-]*:')
[ "$keys" -eq 2 ] || { echo "FAIL: frontmatter must have exactly name and description, found $keys keys"; exit 1; }
desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
case "$desc" in "Use when"*) ;; *) echo "FAIL: description must start with 'Use when'"; exit 1;; esac

for s in 'Hard rules' 'Phase C0' 'Phase C1' 'Phase C2' 'Phase C3' 'Phase C4' 'Phase C5' 'Red flags'; do
  grep -q "## .*$s" "$skill" || { echo "FAIL: supercomposer SKILL.md missing section: $s"; exit 1; }
done
# The load-bearing artifacts of the composition package must be named.
for t in 'Traceability table' 'Coverage table' 'delegation check' 'ledger'; do
  grep -qi "$t" "$skill" || { echo "FAIL: supercomposer SKILL.md never mentions: $t"; exit 1; }
done
# Composition ends at handoff; conduction must not start here.
grep -qF 'superconductor' "$skill" || { echo "FAIL: supercomposer SKILL.md never references superconductor"; exit 1; }
echo "PASS: supercomposer SKILL.md structure"
