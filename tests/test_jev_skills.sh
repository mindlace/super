#!/bin/sh
# Structural checks for the superpowers-jev skills and hook wiring.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
p="$root/plugins/superpowers-jev"
fail() { echo "FAIL: $1"; exit 1; }

check_frontmatter() { # check_frontmatter <file> <name>
  head -1 "$1" | grep -qx -- '---' || fail "$1: no frontmatter"
  fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$1")
  printf '%s\n' "$fm" | grep -qx "name: $2" || fail "$1: name must be $2"
  desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
  case "$desc" in "Use when"*|"Use alongside"*) ;; *) fail "$1: description must start with 'Use when' or 'Use alongside'";; esac
  [ "${#desc}" -le 500 ] || fail "$1: description over 500 chars"
}

jev="$p/skills/jev/SKILL.md"
gates="$p/skills/jev-gates/SKILL.md"
check_frontmatter "$jev" jev
check_frontmatter "$gates" jev-gates

grep -qF '../../bin/jev' "$jev" || fail "jev skill must give the path <base>/../../bin/jev"
for c in 'jev ask' 'jev record' 'jev report' 'jev mode' 'jev compat' 'jev state' 'jev rereview-state' \
         'jev findings-state' 'jev diff-state' 'jev diag-state' 'jev cite' 'jev defect-state' \
         'jev bounce-state' 'jev coverage' 'jev label' 'jev recover-states' 'SUPERPOWERS_JEV_ON' '"enabled": false'; do
  grep -qF -- "$c" "$jev" || fail "jev skill never mentions: $c"
done

# Every superpowers point, named by section heading + v7.0.0 anchor.
for a in '### tier: "## Model Selection" (SKILL.md:184-219)' \
         '### report-evidence: "### 2. Handle the report" (SKILL.md:286-306)' \
         'implementer-prompt.md:128-153' \
         '### severity: "### 3. Review the task"' 'task-reviewer-prompt.md:145-159' 'code-reviewer.md:95-120' \
         '### re-review: "### 4. The fix loop"' 're-review-prompt.md:80-85' 're-review-prompt.md:87-90' \
         '### verify-stop: "## The Iron Law"' '(SKILL.md:14-48)' \
         '### diag-confidence:' 'analyst-common.md:23-38' \
         '### prompt-route: "## The Rule"' '(SKILL.md:10-31)' \
         'jev compat' '"compatible": false' 'shadow' 'v7.0.0'; do
  grep -qF -- "$a" "$gates" || fail "jev-gates missing: $a"
done

# Hook wiring: every event routes through run-hook.cmd jev-hook <name>.
python3 - "$p/hooks/hooks.json" <<'PY' || exit 1
import json, sys
h = json.load(open(sys.argv[1]))["hooks"]
want = {"SessionStart": "session-start", "UserPromptSubmit": "prompt-route", "Stop": "stop-verify"}
for event, name in want.items():
    cmds = [x["command"] for g in h.get(event, []) for x in g["hooks"]]
    if cmds != ['"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" jev-hook %s' % name]:
        print("FAIL: %s hook wiring: %r" % (event, cmds)); sys.exit(1)
PY
# Per-item points save the builder state to a file and ask with --state <file>, so recorded
# items follow the state's order; none of them pipes builder output straight into ask.
for pt in severity re-review diag-confidence; do
  grep -qF "jev ask $pt --state <state file>" "$gates" || fail "jev-gates: $pt must ask with --state <state file>"
  grep -qF "jev ask $pt --state -" "$gates" && fail "jev-gates: $pt must not pipe builder state into ask"
done
grep -qF 'detail.labels' "$jev" || fail "jev skill must explain detail.labels"
for f in "$p/hooks/run-hook.cmd" "$p/hooks/jev-hook" "$p/bin/jev"; do
  mode=$(git -C "$root" ls-files -s "${f#$root/}" | cut -c1-6)
  [ "$mode" = "100755" ] || fail "${f#$root/} must be committed 0755, got '$mode'"
done
echo "PASS: superpowers-jev skills and hooks"
