#!/bin/sh
# Structural checks for operator-briefing.md
set -u
briefing="$(cd "$(dirname "$0")/.." && pwd)/plugins/supersonic/skills/superconductor/operator-briefing.md"

test -f "$briefing" || { echo "FAIL: operator-briefing.md missing"; exit 1; }
status=0

require() {
  grep -qF -e "$1" "$briefing" || { echo "FAIL: operator briefing missing: $1"; status=1; }
}
forbid() {
  if grep -qF -e "$1" "$briefing"; then
    echo "FAIL: operator briefing must not contain: $1"
    status=1
  fi
}

require 'superpowers:writing-plans'
require 'superpowers:subagent-driven-development'
require 'superpowers-jev:jev-gates'
require 'SendMessage'
require 'by name'
require 'questions/<unit-slug>-<k>.md'
require 'already in'
require 'row <row id> passed review at <sha>'
require 'hand-back'
require 'plan ready'
require 'Admitted'
require 're-read'
# An assignment that carries an existing plan (a hand-back sibling) skips planning.
require '`Plan:` line names a plan'
require 'Do not invoke `superpowers:writing-plans`'
require '`Plan: none`'
require '`Siblings:`'

forbid 'message `main`'
forbid 'to `main`'

for h in '## Identity and addressing' '## Your job, in order' '## Design fidelity' \
  '## Questions' '## Rulings' '## Progress'; do
  grep -qx -e "$h" "$briefing" || { echo "FAIL: operator briefing missing heading: $h"; status=1; }
done

[ "$status" -eq 0 ] && echo "PASS: operator briefing"
exit "$status"
