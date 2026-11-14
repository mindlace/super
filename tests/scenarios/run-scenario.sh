#!/bin/sh
# Usage: sh tests/scenarios/run-scenario.sh <scenario.md> <reps> <context-file>...
# Sends the scenario text above its "## Pass" heading as the user prompt, with the
# context files joined into --append-system-prompt, in a fresh empty cwd, no tools.
# SCENARIO_MODEL defaults to sonnet.
set -u
if [ "$#" -lt 3 ]; then
  echo "usage: $0 <scenario.md> <reps> <context-file>..." >&2
  exit 2
fi
scenario=$1; reps=$2; shift 2
model=${SCENARIO_MODEL:-sonnet}
prompt=$(awk '/^## Pass[[:space:]]*$/ {exit} {print}' "$scenario")
ctx=""
for f in "$@"; do
  ctx="$ctx
$(cat "$f")
"
done
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work" || exit 1
k=1
while [ "$k" -le "$reps" ]; do
  echo "=== rep $k ==="
  claude -p --model "$model" --tools "" --append-system-prompt "$ctx" "$prompt" </dev/null
  echo
  k=$((k + 1))
done
