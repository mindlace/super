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

# A replacement operator deletes the superseded plan, keeps its kept commits, and replans the rest.
require '`Replaces:` line is not `none`'
require 'deletes the superseded plan file'
require 'Do not read it for guidance'
require 'The kept commits stand and are not redone'
require 'existing code'
require 'covering only what remains after the kept'
# ...and then splits lanes and stops at plan ready like any other plan.
require 'Then continue from step 4.'
# The replacement plan takes a new path, so SDD never adopts the superseded plan's workspace.
require 'at a new path, never the superseded plan'
require 'SDD keys its workspace to the plan'
forbid 'no longer has'
# Every merge of the integration branch into the operator's branch is --no-ff.
require 'git merge --no-ff --no-edit <that branch>'
require 'whether `<conductor name>` asks'
forbid 'and run SDD on that plan'
# Waited-on rows are planned early.
require 'as early as their own dependencies allow'
# The launch list includes SDD's scripts, called by absolute path; a relaunch resumes the plan.
require 'git commands, SDD scripts'
require '`bash <the absolute path your assignment names> <args>`'
require 'restart you with a longer list'

forbid 'with a pointer to'
forbid 'message `main`'
forbid 'to `main`'

for h in '## Identity and addressing' '## Your job, in order' '## Design fidelity' \
  '## Questions' '## Rulings' '## Progress'; do
  grep -qx -e "$h" "$briefing" || { echo "FAIL: operator briefing missing heading: $h"; status=1; }
done

[ "$status" -eq 0 ] && echo "PASS: operator briefing"
exit "$status"
