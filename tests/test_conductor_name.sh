#!/bin/sh
# The supersonic UserPromptSubmit hook names a conductor session <slug>-conductor.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/plugins/supersonic/hooks/conductor-name"
fail() { echo "FAIL: $1"; exit 1; }

title() {
  python3 -c 'import json,sys; print(json.dumps({"prompt": sys.argv[1]}))' "$1" \
    | python3 "$hook" \
    | python3 -c 'import json,sys; s=sys.stdin.read(); print(json.loads(s)["hookSpecificOutput"]["sessionTitle"] if s else "")'
}

check() {
  got=$(title "$1")
  [ "$got" = "$2" ] || fail "prompt '$1': want '$2', got '$got'"
}

check '/superconductor work on superconductor/foo-project' 'foo-project-conductor'
check '/supersonic:superconductor work on superconductor/foo-project' 'foo-project-conductor'
check '/superconductor resume superconductor/foo.v2.' 'foo.v2-conductor'
check '  /superconductor superconductor/a_b' 'a_b-conductor'
check '/superconductor work on the foo package' ''
check 'please run /superconductor on superconductor/foo' ''
check '/supercomposer superconductor/foo' ''
check '/superconductorx superconductor/foo' ''
check '/superconductor work on mybranch-superconductor/foo' ''

out=$(printf 'not json' | python3 "$hook")
[ -z "$out" ] || fail "bad input must print nothing"

out=$(printf '{"prompt":"/superconductor superconductor/foo"}' | python3 "$hook" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["hookEventName"])')
[ "$out" = "UserPromptSubmit" ] || fail "hookEventName must be UserPromptSubmit"

echo "PASS: conductor-name hook"
