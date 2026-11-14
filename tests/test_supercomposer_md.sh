#!/bin/sh
# Structural checks for the supercomposer SKILL.md
set -e
skill="$(cd "$(dirname "$0")/.." && pwd)/plugins/supersonic/skills/supercomposer/SKILL.md"

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
grep -qF 'supersonic:superconductor' "$skill" \
  || { echo "FAIL: supercomposer must hand off to supersonic:superconductor"; exit 1; }
for s in 'superpowers-jev:jev' 'jev ask citation' 'jev coverage' 'still runs every leg' 'jev record' 'only when the result is `confident`'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: supercomposer SKILL.md Jev points missing: $s"; exit 1; }
done
tr '\n' ' ' < "$skill" | tr -s ' ' | grep -qF 'jev ask citation --state <state file>' \
  || { echo "FAIL: supercomposer citation must ask with --state <state file>"; exit 1; }
# Package cutting: contracts first, write sets, row edges, the build graph, the partner's reasons.
flat=$(tr '\n' ' ' < "$skill" | tr -s ' ')
for s in 'Contracts' 'Write sets' 'build graph' 'Longest chain' 'names interface rows' "partner's reasons" 'never a spec' 'its own unit' 'as fine as the dependencies allow'; do
  printf '%s\n' "$flat" | grep -qF -- "$s" || { echo "FAIL: supercomposer SKILL.md missing: $s"; exit 1; }
done
if grep -qF 'Dependency order' "$skill"; then
  echo "FAIL: supercomposer SKILL.md still has a Dependency order section; order derives from edges"; exit 1
fi
printf '%s\n' "$flat" | grep -qF -- '-build-graph.md' \
  || { echo "FAIL: supercomposer SKILL.md must name the <design-file-stem>-build-graph.md path"; exit 1; }
for c in 'unit' 'implements (spec §)' 'writes' 'needs rows' 'produces rows others wait on'; do
  printf '%s\n' "$flat" | grep -qF -- "| $c |" || printf '%s\n' "$flat" | grep -qF -- "| \`$c\` |" \
    || { echo "FAIL: build graph table missing column: $c"; exit 1; }
done
desc_len=$(printf '%s' "$desc" | wc -c | tr -d ' ')
[ "$desc_len" -le 500 ] || { echo "FAIL: description is $desc_len chars (max 500)"; exit 1; }
echo "PASS: supercomposer SKILL.md structure"
