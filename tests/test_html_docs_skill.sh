#!/bin/sh
# Structural checks for the superpowers-html html-docs overlay skill.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
skill="$root/plugins/superpowers-html/skills/html-docs/SKILL.md"
fail() { echo "FAIL: $1"; exit 1; }

test -f "$skill" || fail "html-docs skill missing: $skill"
head -1 "$skill" | grep -qx -- '---' || fail "$skill: no frontmatter"
fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
printf '%s\n' "$fm" | grep -qx "name: html-docs" || fail "$skill: name must be html-docs"
desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
case "$desc" in "Use when"*|"Use alongside"*) ;; *) fail "$skill: description must start with 'Use when' or 'Use alongside'";; esac
[ "${#desc}" -le 500 ] || fail "$skill: description over 500 chars"

for s in '## The Written Design' '## Overview' '## Plan Document Header' '## Task Structure' '## Execution Handoff' \
         '### 1. Dispatch the implementer' '### 1. Take the task' \
         'docs/superpowers/specs/YYYY-MM-DD-<topic>-design.html' 'docs/superpowers/plans/YYYY-MM-DD-<feature>.html' \
         'sec-global-constraints' 'sec-task-N' 'tN-sK' 'Task N:' \
         '../../bin/task-brief' '../../bin/task-start' '../../bin/superpowers-html compat' \
         'spec-format.md' '7.0.2' 'checkbox' \
         'progress is kept in the workspace ledger' 'Write every step unchecked (no `checked` attribute)' \
         'nobody ticks steps during execution' \
         "bash <absolute path of this skill's base directory>/../../bin/task-brief\` (same" \
         "bash <absolute path of this skill's base directory>/../../bin/task-start\` (same" \
         "python3 <absolute path of this skill's base directory>/../../bin/superpowers-html compat"; do
  grep -qF -- "$s" "$skill" || fail "html-docs skill missing: $s"
done
# The helper is Python: it must never be run with bash.
if grep -qF -- 'bash <absolute path of this skill'"'"'s base directory>/../../bin/superpowers-html' "$skill"; then
  fail "html-docs skill runs the python helper superpowers-html with bash"
fi
if grep -qF -- '- [ ]' "$skill"; then fail "html-docs skill still mentions '- [ ]'"; fi
echo "PASS: html-docs skill"
