#!/bin/sh
# Runs the stall-detection command lines exactly as the skills write them, on harmless
# commands: the fork time limit (composer-forks.md), the heartbeat timer (superconductor
# SKILL.md), and the progress-evidence finds. No claude session is started.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
forks="$root/plugins/supersonic/skills/supercomposer/composer-forks.md"
skill="$root/plugins/supersonic/skills/superconductor/SKILL.md"
fail() { echo "FAIL: stall mechanisms: $1"; exit 1; }
command -v perl >/dev/null 2>&1 || fail "perl not found"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/stall-mech.XXXXXX") || fail "mktemp"
trap 'rm -rf "$tmp"' EXIT
# Stopping jobs on purpose makes the shell print "Killed"/"Terminated"; failures go to stdout.
exec 2>/dev/null

# The command lines, verbatim, with their trailing placeholders cut off.
limit=$(grep -E "^ +perl -e '\(\\\$t,\\\$f\)" "$forks" | sed -e 's/^ *//' \
  -e 's| <fork limit> <ledger dir>/prompts/<fork name>\.pid$||')
timer=$(grep -E "^ +perl -e '\(\\\$f,\\\$s\)" "$skill" | sed -e 's/^ *//' \
  -e 's| <ledger dir>/timer <seconds>$||')
[ -n "$limit" ] || fail "time-limit line not found in composer-forks.md"
[ -n "$timer" ] || fail "timer line not found in SKILL.md"
printf '#!/bin/sh\n%s "$@"\n' "$limit" > "$tmp/limit.sh"
printf '#!/bin/sh\n%s "$@"\n' "$timer" > "$tmp/timer.sh"

# 1. The limit stops the whole process group (a child and a grandchild) and exits 124.
sh "$tmp/limit.sh" 2 "$tmp/f1.pid" env -C "$tmp" sh -c 'echo started; sleep 60 & sleep 60; wait' \
  > "$tmp/f1.out" 2>&1
rc=$?
[ "$rc" -eq 124 ] || fail "time limit exited $rc, want 124"
pg=$(cat "$tmp/f1.pid") || fail "no pid file"
[ -n "$pg" ] || fail "empty pid file"
sleep 1
pgrep -g "$pg" >/dev/null && fail "process group $pg still running after the limit"
grep -qx started "$tmp/f1.out" || fail "fork output not written to its .out file"

# 2. A fork that finishes inside the limit keeps its own exit status and output.
sh "$tmp/limit.sh" 30 "$tmp/f2.pid" env -C "$tmp" sh -c 'echo "No drift @ abc1234"; exit 3' \
  > "$tmp/f2.out" 2>&1
rc=$?
[ "$rc" -eq 3 ] || fail "finished fork exited $rc, want 3"
grep -qx 'No drift @ abc1234' "$tmp/f2.out" || fail "finished fork output missing"

# 3. A fork left running by a dead conductor: its group is found and stopped by number.
sh "$tmp/limit.sh" 600 "$tmp/f3.pid" sh -c 'sleep 60 & sleep 60; wait' >/dev/null 2>&1 &
i=0; while [ ! -s "$tmp/f3.pid" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
pg=$(cat "$tmp/f3.pid")
pkill -KILL -f "$tmp/f3.pid"   # the watchdog dies hard, as with its conductor
sleep 1
pgrep -g "$pg" >/dev/null || fail "orphaned fork group $pg not found by pgrep -g"
pkill -TERM -g "$pg"
sleep 1
pgrep -g "$pg" >/dev/null && fail "pkill -TERM -g did not stop group $pg"

# 4. The timer writes its pid and deadline; pgrep -F finds it while it sleeps, not after.
sh "$tmp/timer.sh" "$tmp/timer" 2 &
bg=$!
i=0; while [ ! -s "$tmp/timer" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
set -- $(cat "$tmp/timer")
[ "$#" -eq 2 ] || fail "timer file must hold pid and deadline"
now=$(perl -e 'print time')
[ "$2" -ge "$now" ] || fail "timer deadline $2 is in the past"
pgrep -F "$tmp/timer" -x sleep >/dev/null || fail "pgrep -F does not find the running timer"
wait "$bg"
pgrep -F "$tmp/timer" -x sleep >/dev/null && fail "pgrep -F still finds a timer that exited"
# A timer left by a dead conductor is stopped with pkill -F.
sh "$tmp/timer.sh" "$tmp/timer" 60 &
i=0; while ! pgrep -F "$tmp/timer" -x sleep >/dev/null && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
pkill -F "$tmp/timer" -x sleep || fail "pkill -F found no timer"
wait 2>/dev/null

# 5. Progress evidence: the worktree find, and the age checks with their rounding margin.
mkdir -p "$tmp/wt/.superpowers/sdd/plan" "$tmp/wt/node_modules/x"
: > "$tmp/beat"
old=$(( $(perl -e 'print time') - 5 ))
for f in "$tmp/wt/.superpowers/sdd/plan/progress.md" "$tmp/wt/node_modules/x/f"; do
  : > "$f"; perl -e '$t=shift; utime $t,$t,@ARGV' "$old" "$f"
done
perl -e '$t=shift; utime $t,$t,@ARGV' "$((old+1))" "$tmp/beat"
evidence() { find "$tmp/wt" \( -name .git -o -name node_modules \) -prune -o -type f -newer "$tmp/beat" -print -quit; }
[ -z "$(evidence)" ] || fail "evidence found in a quiet worktree: $(evidence)"
sleep 1; echo x > "$tmp/wt/node_modules/x/f"
[ -z "$(evidence)" ] || fail "node_modules counted as evidence"
echo 'Task 1: complete (commits abc1234..def5678, review clean)' >> "$tmp/wt/.superpowers/sdd/plan/progress.md"
[ -n "$(evidence)" ] || fail "an SDD ledger line is not evidence"
age() { perl -e '$t=time-shift; utime $t,$t,@ARGV' "$1" "$tmp/age"; }
: > "$tmp/age"
age 1200; [ -n "$(find "$tmp/age" -mmin +19 -print)" ] || fail "-mmin +19 misses a 20-minute-old beat file"
age 600;  [ -n "$(find "$tmp/age" -mmin +9 -print)" ]  || fail "-mmin +9 misses an ask one beat old"
age 500;  [ -z "$(find "$tmp/age" -mmin +9 -print)" ]  || fail "-mmin +9 matches an ask under nine minutes old"

echo "PASS: stall mechanisms"
