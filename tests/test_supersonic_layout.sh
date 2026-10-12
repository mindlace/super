#!/bin/sh
# Layout checks for the supersonic plugin after the move out of dotfiles.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
d="$root/plugins/supersonic/skills"
fail() { echo "FAIL: $1"; exit 1; }
for f in superconductor/SKILL.md superconductor/operator-briefing.md superconductor/budget.sh supercomposer/SKILL.md; do
  test -f "$d/$f" || fail "missing $f"
done
test ! -e "$d/superconductor/executable_budget.sh" || fail "chezmoi executable_ prefix must be gone"
mode=$(git -C "$root" ls-files -s plugins/supersonic/skills/superconductor/budget.sh | cut -c1-6)
[ "$mode" = "100755" ] || fail "budget.sh must be committed 0755, got $mode"
desc=$(sed -n 's/^description: //p' "$d/superconductor/SKILL.md")
[ "${#desc}" -le 500 ] || fail "superconductor description over 500 chars"
desc=$(sed -n 's/^description: //p' "$d/supercomposer/SKILL.md")
[ "${#desc}" -le 500 ] || fail "supercomposer description over 500 chars"
echo "PASS: supersonic layout"
