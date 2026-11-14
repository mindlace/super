#!/bin/sh
# tests/test_beat_sh.sh — fixture tests for the heartbeat script. A stub `claude` on PATH
# supplies the session list; no claude session is started.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/plugins/supersonic/skills/superconductor/beat.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/beat-test.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT
exec 2>/dev/null   # jobs stopped on purpose make the shell print "Killed"; failures go to stdout
fail() { echo "FAIL: beat.sh: $1"; exit 1; }

grep -qx 'BEAT=600' "$src" || fail "BEAT=600 must be set at the top"
grep -qx 'STALL_BEATS=1' "$src" || fail "STALL_BEATS=1 must be set at the top"
grep -qx 'FORK_LIMIT=2700' "$src" || fail "FORK_LIMIT=2700 must be set at the top"
# A copy with a two-second fork limit, for the limit test only.
sed 's/^FORK_LIMIT=2700$/FORK_LIMIT=2/' "$src" > "$tmp/beat-fast.sh"
b() { sh "$src" "$@"; }
ago() { perl -e '$t=time-shift; utime $t,$t,@ARGV' "$@"; }

# --- fixture project: ledger, three unit worktrees, a stub claude ---------------------------
proj="$tmp/proj"; d="$proj/.superpowers/superconductor/des"
mkdir -p "$d/assignments" "$d/prompts" "$tmp/bin"
git init -q "$proj"; git -C "$proj" commit -q --allow-empty -m init
git -C "$proj" worktree add -q "$proj/pkg" -b superconductor/des
for u in api web db ops; do git -C "$proj" worktree add -q "$proj/.claude/worktrees/des-$u" -b "des-$u"; done
api="$proj/.claude/worktrees/des-api"
mkdir -p "$api/.superpowers/sdd/plan"
printf '# Plan\n\n### Task 1: types\n\nx\n\n### Task 2: hook\n\nDelivers row r1\n' > "$api/plan.md"
git -C "$api" add plan.md; git -C "$api" commit -q -m plan
printf 'plan.md\n' > "$api/.superpowers/sdd/plan/plan-path"
printf '# SDD ledger — plan: plan.md\nTask 1: complete (commits aaaaaaa..bbbbbbb, review clean)\nTask 2: complete (commits bbbbbbb..ccccccc, review clean)\n' \
  > "$api/.superpowers/sdd/plan/progress.md"
cat > "$d/ledger.md" <<EOF
# Superconductor ledger — design: x
Package worktree: $proj/pkg

## Units
- api: des-api — status: admitted (branch des-api, worktree x, start 0000000,
  model m — rationale: r, needs: none, produces: r1, r2)
- web: des-web — status: planning (needs: r1, produces: none)
- db: des-db — status: admitted (needs: none, produces: none)
- ops: des-ops — status: complete (needs: none, produces: none)
- old: des-old — status: stopped (needs: none, produces: none)

## Supervision
- plan web: plan.md at 1234567

## Questions

## Forks
- fork rule-q1 started 2026-11-13T10:00
- fork review-api-abc1234 started 2026-11-13T10:00
- fork review-api-abc1234 exited 0: no output
- fork review-api-abc1234 started 2026-11-13T10:05

## Integration
- fix round ops @ abc1234: tests fail; output /x
EOF
agents='[{"name":"des-api","id":"a1","status":"idle"},{"name":"des-web","id":"w1","status":"idle"},{"name":"des-ops","id":"o1","status":"busy"}]'
printf '#!/bin/sh\n[ "$1 $2" = "agents --json" ] && cat "%s/agents.json"\n' "$tmp" > "$tmp/bin/claude"
chmod +x "$tmp/bin/claude"; printf '%s' "$agents" > "$tmp/agents.json"
PATH="$tmp/bin:$PATH"; export PATH

line() { printf '%s\n' "$out" | grep -E "^$1( |$)"; }
field() { printf '%s\n' "$(line "unit $1")" | sed -n "s/.* $2 \([^ ]*\).*/\1/p"; }

# 1. First beat: every watched unit gets a beat file; stopped/complete-without-fix units are not listed.
out=$(b "$d") || fail "report exited non-zero"
[ "$(printf '%s\n' "$out" | tail -n 1 | cut -c1-6)" = "beat: " ] || fail "summary must be the last line: $out"
for u in api web db ops; do line "unit $u" >/dev/null || fail "no unit line for $u: $out"; done
line "unit old" >/dev/null && fail "a stopped unit must not be listed"
[ "$(field api evidence)" = new ] || fail "first beat evidence should be new"
[ -f "$d/assignments/api.beat" ] || fail "beat file not written"
[ "$(cat "$d/assignments/api.beat")" = "$(git -C "$api" rev-parse HEAD)" ] || fail "beat file must hold HEAD"
[ "$(field db session)" = absent ] || fail "db should be absent"
[ "$(field api session)" = alive ] || fail "api should be alive"
[ "$(field ops fixround)" = open ] || fail "ops fix round should be open"
[ "$(field ops state)" = busy ] || fail "ops state should be busy"
printf '%s\n' "$out" | grep -qx 'row api r1 task 2 head ccccccc' || fail "unreported row r1 not found: $out"
printf '%s\n' "$out" | grep -q '^row api r2' && fail "r2 has no Delivers line, must not be listed"
printf '%s\n' "$out" | grep -qx 'fork rule-q1 gone failures 0' || fail "fork with no pid file should be gone: $out"
printf '%s\n' "$out" | grep -qx 'fork review-api-abc1234 gone failures 1' || fail "failure count wrong: $out"
printf '%s\n' "$out" | grep -q '^beat: watched 4 absent 1 evidence 4 due 0 overdue 0 rows 1 forks running 0 gone 2 fixrounds 1 deferred 0 questions 0 resends 0 timer none$' \
  || fail "summary wrong: $(printf '%s\n' "$out" | tail -n 1)"

# 2. Quiet for one beat (STALL_BEATS=1): ask due; a planning unit with its plan ledgered is not asked.
for u in api web db ops; do ago 610 "$d/assignments/$u.beat"; done
for f in $(find "$proj/.claude/worktrees" -type f ! -path '*/.git/*'); do ago 5000 "$f"; done
out=$(b "$d")
[ "$(field api evidence)" = no ] || fail "quiet worktree shows evidence: $(line 'unit api')"
[ "$(field api ask)" = due ] || fail "api should be due after a quiet beat: $(line 'unit api')"
[ "$(field web ask)" = none ] || fail "planning unit with a ledgered plan must not be asked"
[ "$(field api quiet)" = 10 ] || fail "quiet minutes wrong: $(line 'unit api')"
ago 590 "$d/assignments/api.beat"
out=$(b "$d"); [ "$(field api ask)" = none ] || fail "under one beat must not be due"

# 3. An ask: open, then overdue a beat later; a busy session gets a second beat.
ago 1200 "$d/assignments/api.beat"; b "$d" asked api; ago 300 "$d/assignments/api.asked"
out=$(b "$d"); [ "$(field api ask)" = open ] || fail "fresh ask should be open: $(line 'unit api')"
ago 600 "$d/assignments/api.asked"
out=$(b "$d"); [ "$(field api ask)" = overdue ] || fail "ask a beat old should be overdue: $(line 'unit api')"
ago 3000 "$d/assignments/ops.beat"; b "$d" asked ops; ago 660 "$d/assignments/ops.asked"
out=$(b "$d"); [ "$(field ops ask)" = open ] || fail "busy session gets a second beat: $(line 'unit ops')"
ago 1200 "$d/assignments/ops.asked"
out=$(b "$d"); [ "$(field ops ask)" = overdue ] || fail "busy session overdue after two beats"

# 4. A message handled (seen) closes the ask; a file written in the worktree is evidence.
b "$d" seen api
out=$(b "$d"); [ "$(field api ask)" = none ] || fail "seen must close the ask: $(line 'unit api')"
ago 1200 "$d/assignments/api.beat"; sleep 1; echo x > "$api/src.txt"
out=$(b "$d"); [ "$(field api evidence)" = yes ] || fail "a written file is evidence"
[ "$(field api quiet)" = 0 ] || fail "evidence must rewrite the beat file"
ago 1200 "$d/assignments/api.beat"; mkdir -p "$api/node_modules/p"; echo y > "$api/node_modules/p/f"
ago 5000 "$api/src.txt"
out=$(b "$d"); [ "$(field api evidence)" = no ] || fail "node_modules must not count"
git -C "$api" commit -q --allow-empty -m empty
out=$(b "$d"); [ "$(field api evidence)" = yes ] || fail "a moved HEAD is evidence"

# 5. Merges: a merged row is not reported; unmerged again it is; the rung resets on a merge.
cp "$d/ledger.md" "$d/ledger.base"
printf -- '- merged api row r1 @ ddddddd into superconductor/des, tests pass, band low\n' >> "$d/ledger.md"
out=$(b "$d"); printf '%s\n' "$out" | grep -q '^row api r1' && fail "merged row still reported"
printf -- '- unmerged row r1: cut by ruling q1\n' >> "$d/ledger.md"
out=$(b "$d"); printf '%s\n' "$out" | grep -q '^row api r1' || fail "unmerged row not reported again"
cp "$d/ledger.base" "$d/ledger.md"
perl -0pi -e 's/(- plan web[^\n]*\n)/$1- restarted api: stall, rung 1, since start\n- restarted api: death, rung 2, since start\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 3 ] || fail "two restarts since start: next rung 3, got $(field api rung)"
printf -- '- merged api row r1 @ eeeeeee into superconductor/des, tests pass, band low\n' >> "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 1 ] || fail "a merge must reset the rung"
perl -0pi -e 's/(- restarted api: death, rung 2, since start\n)/$1- restarted api: stall, rung 1, since eeeeeee\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 2 ] || fail "a restart after the merge counts"
cp "$d/ledger.base" "$d/ledger.md"

# 5b. Question files never ledgered, and resends owed after a restart or relaunch.
mkdir -p "$d/questions"; : > "$d/questions/api-1.md"; : > "$d/questions/api-10.md"
perl -0pi -e 's/(## Questions\n)/$1- 2026-11-13 api-10 from api [defect-class: x]: q\n/' "$d/ledger.md"
perl -0pi -e 's/(- plan web[^\n]*\n)/$1- restarted api: stall, rung 1, since start\n- relaunched db\n- resent to des-db\n/' "$d/ledger.md"
out=$(b "$d")
printf '%s\n' "$out" | grep -qx 'question api-1' || fail "unledgered question api-1 not reported: $out"
printf '%s\n' "$out" | grep -q '^question api-10' && fail "api-10 is ledgered (whole-word match)"
printf '%s\n' "$out" | grep -qx 'resend des-api' || fail "resends owed to des-api not reported"
printf '%s\n' "$out" | grep -q '^resend des-db' && fail "des-db was already resent"
cp "$d/ledger.base" "$d/ledger.md"; rm -rf "$d/questions"

# 6. The timer: pid and deadline, found while it sleeps, stopped by stop-timer and resume.
b "$d" timer 2 & bg=$!
i=0; while [ ! -s "$d/timer" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
set -- $(cat "$d/timer"); [ "$#" -eq 2 ] || fail "timer file must hold pid and deadline"
out=$(b "$d"); printf '%s\n' "$out" | grep -q "^timer running deadline $2\$" || fail "running timer not reported"
wait "$bg"; out=$(b "$d"); printf '%s\n' "$out" | grep -qx 'timer none deadline -' || fail "finished timer still reported"
b "$d" timer 60 & sleep 1
b "$d" stop-timer; sleep 1; pgrep -F "$d/timer" -x sleep >/dev/null && fail "stop-timer left the timer"
b "$d" timer 60 & sleep 1
ago 1200 "$d/assignments/db.beat"; b "$d" asked db
b "$d" resume; sleep 1
pgrep -F "$d/timer" -x sleep >/dev/null && fail "resume left the old timer"
[ -e "$d/assignments/db.asked" ] && fail "resume must drop old asks"
out=$(b "$d"); [ "$(field db quiet)" = 0 ] || fail "resume must restart the beat files"

# 7. Forks: the limit stops the whole group (exit 124); own status kept; a signal death is 128+n.
sh "$tmp/beat-fast.sh" "$d" fork rule-q1 sh -c 'echo started; sleep 60 & sleep 60; wait' > "$d/prompts/rule-q1.out"
rc=$?; [ "$rc" -eq 124 ] || fail "limit exit $rc, want 124"
pg=$(cat "$d/prompts/rule-q1.pid"); sleep 1
pgrep -g "$pg" >/dev/null && fail "group $pg survived the limit"
grep -qx started "$d/prompts/rule-q1.out" || fail "fork output lost"
b "$d" fork review-x sh -c 'echo "No drift @ abc1234"; exit 3' > "$d/prompts/review-x.out"; rc=$?
[ "$rc" -eq 3 ] || fail "own exit status lost ($rc)"
b "$d" fork review-y sh -c 'kill -9 $$'; rc=$?
[ "$rc" -eq 137 ] || fail "signal death must exit 137, got $rc"

# 8. A running fork is reported running; stop-fork stops it, escalating to KILL and clearing the lock.
b "$d" fork rule-q1 sh -c 'trap "" TERM; sleep 60' & sleep 1
out=$(b "$d"); printf '%s\n' "$out" | grep -qx 'fork rule-q1 running failures 0' || fail "running fork not reported: $out"
lock=$(git -C "$proj/pkg" rev-parse --path-format=absolute --git-path index.lock); : > "$lock"
pkill -KILL -f "$d/prompts/rule-q1.pid"; sleep 1    # the watchdog dies hard, as with its conductor
r=$(b "$d" stop-fork rule-q1); [ "$r" = "killed rule-q1" ] || fail "stop-fork said: $r"
pgrep -g "$(cat "$d/prompts/rule-q1.pid")" >/dev/null && fail "stop-fork left the group"
[ -e "$lock" ] && fail "stop-fork after KILL must remove the package worktree's index lock"
r=$(b "$d" stop-fork rule-q1); [ "$r" = "not running rule-q1" ] || fail "second stop-fork said: $r"

# 9. changed: the operator's evidence between wait stretches.
cd "$api" || fail "cd"
m=.superpowers/sdd/stretch
[ -z "$(sh "$src" changed "$m")" ] || fail "first changed call must only set the marker"
sleep 1; [ -z "$(sh "$src" changed "$m")" ] || fail "no change must print nothing"
sleep 1; echo z >> src.txt
[ -n "$(sh "$src" changed "$m")" ] || fail "an edit to an already-modified file must show"
[ -z "$(sh "$src" changed "$m")" ] || fail "changed must reset its marker"
cd "$root" || exit 1

echo "PASS: beat.sh"
