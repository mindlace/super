#!/bin/sh
# tests/test_beat_sh.sh — fixture tests for the heartbeat script. A stub `claude` on PATH
# supplies the session list; no claude session is started. The fixture project's path has a
# space in it, so every path the script builds is exercised with one.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/plugins/supersonic/skills/superconductor/beat.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/beat-test.XXXXXX") || exit 1
trap 'pkill -f "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
exec 2>/dev/null   # jobs stopped on purpose make the shell print "Killed"; failures go to stdout
fail() { echo "FAIL: beat.sh: $1"; exit 1; }

grep -qx 'BEAT=600' "$src" || fail "BEAT=600 must be set at the top"
grep -qx 'STALL_BEATS=1' "$src" || fail "STALL_BEATS=1 must be set at the top"
grep -qx 'FORK_LIMIT=2700' "$src" || fail "FORK_LIMIT=2700 must be set at the top"
sh -n "$src" || fail "sh -n"
# A copy with a two-second fork limit, for the limit tests only.
sed 's/^FORK_LIMIT=2700$/FORK_LIMIT=2/' "$src" > "$tmp/beat-fast.sh"
# A copy with no wait between launch tries.
sed 's/^LAUNCH_WAIT=10$/LAUNCH_WAIT=0/' "$src" > "$tmp/beat-launch.sh"
bl() { sh "$tmp/beat-launch.sh" "$@"; }
b() { sh "$src" "$@"; }
ago() { perl -e '$t=time-shift; utime $t,$t,@ARGV' "$@"; }

# --- fixture project with a space in its path: ledger, unit worktrees, a stub claude ----
proj="$tmp/my proj"; d="$tmp/records home/superconductor/key/des"
mkdir -p "$d/assignments" "$d/prompts" "$tmp/bin"
git init -q "$proj"; git -C "$proj" commit -q --allow-empty -m init
git -C "$proj" worktree add -q "$proj/pkg" -b superconductor/des
for u in web db ops; do git -C "$proj" worktree add -q "$proj/.claude/worktrees/des-$u" -b "des-$u"; done
# api's worktree is not at the conventional path: the Units line names it.
api="$proj/wt custom/api"
git -C "$proj" worktree add -q "$api" -b des-api
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
- api: des-api — status: admitted (branch des-api, worktree $api, start 0000000,
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
- fork review-api-abc1234@2 started 2026-11-13T10:05

## Integration
- fix round ops @ abc1234: tests fail; output /x
EOF
cp "$d/ledger.md" "$tmp/ledger.base"
reset_ledger() { cp "$tmp/ledger.base" "$d/ledger.md"; }
agents='[{"name":"des-api","id":"a1","sessionId":"aaaa1111-2222-3333-4444-555566667777","status":"busy","state":"working"},{"name":"des-web","id":"w1","status":"busy"},{"name":"des-ops","id":"o1","status":"busy"}]'
HOME="$tmp/home"; export HOME
cat > "$tmp/bin/claude" <<STUB
#!/bin/sh
[ -e "$tmp/agents.fail" ] && exit 1
if [ "\$1" = stop ]; then
  echo "\$2" >> "$tmp/stopped"
  # With stop-removes, a stopped entry leaves the list; without it, it stays (as a failed one may).
  [ -e "$tmp/stop-removes" ] && ID="\$2" perl -MJSON::PP -i -0pe '\$j=JSON::PP->new; \$_=\$j->encode([grep { \$_->{id} ne \$ENV{ID} } @{\$j->decode(\$_)}])' "$tmp/agents.json"
  exit 0
fi
[ "\$1 \$2" = "agents --json" ] || exit 0
next=\$(ls "$tmp/agents.seq" 2>/dev/null | head -n 1)
if [ -n "\$next" ]; then cat "$tmp/agents.seq/\$next"; rm -f "$tmp/agents.seq/\$next"; else cat "$tmp/agents.json"; fi
STUB
chmod +x "$tmp/bin/claude"; printf '%s' "$agents" > "$tmp/agents.json"
PATH="$tmp/bin:$PATH"; export PATH

line() { printf '%s\n' "$out" | grep -E "^$1( |$)"; }
field() { printf '%s\n' "$(line "unit $1")" | sed -n "s/.* $2 \([^ ]*\).*/\1/p"; }
summary() { printf '%s\n' "$out" | tail -n 1; }

# 1. First beat.
out=$(b "$d") || fail "report exited non-zero"
[ "$(summary | cut -c1-6)" = "beat: " ] || fail "summary must be the last line: $out"
for u in api web db ops; do line "unit $u" >/dev/null || fail "no unit line for $u: $out"; done
line "unit old" >/dev/null && fail "a stopped unit must not be listed"
[ "$(field api evidence)" = new ] || fail "first beat evidence should be new"
[ "$(cat "$d/assignments/api.beat")" = "$(git -C "$api" rev-parse HEAD)" ] || fail "beat file must hold the HEAD of the worktree the Units line names"
[ "$(field db session)" = absent ] || fail "db should be absent"
[ "$(field api session)" = alive ] || fail "api should be alive"
[ "$(field ops fixround)" = open ] || fail "ops fix round should be open"
line "unit api" | grep -q ' state ' && fail "the report must not print the session list status: it does not tell working from idle"
[ "$(field api rung)" = 1 ] && [ "$(field api restart)" = none ] || fail "fresh unit: rung 1, no pending restart"
printf '%s\n' "$out" | grep -qx 'row api r1 task 2 head ccccccc' || fail "unreported row r1 not found: $out"
printf '%s\n' "$out" | grep -q '^row api r2' && fail "r2 has no Delivers line, must not be listed"
printf '%s\n' "$out" | grep -qx 'fork rule-q1 unstarted failures 0' || fail "fork with no pid file should be unstarted: $out"
printf '%s\n' "$out" | grep -qx 'fork review-api-abc1234@2 unstarted failures 1' || fail "attempt failures must count across attempts: $out"
printf '%s\n' "$out" | grep -q '^question my' && fail "a space in the path made a bogus question"
summary | grep -qx 'beat: sessions ok watched 4 absent 1 evidence 4 due 0 overdue 0 rows 1 forks running 0 gone 2 fixrounds 1 deferred 0 questions 0 waiting 0 next-reset - movable 4 timer none' \
  || fail "summary wrong: $(summary)"

# 2. An unreadable session list is never "everyone absent" (N1).
: > "$tmp/agents.fail"; out=$(b "$d")
[ "$(field api session)" = unknown ] && [ "$(field db session)" = unknown ] || fail "failed agents list must read unknown: $out"
summary | grep -q '^beat: sessions unknown watched 4 absent 0 ' || fail "failed agents list: $(summary)"
rm -f "$tmp/agents.fail"; printf 'not json' > "$tmp/agents.json"; out=$(b "$d")
summary | grep -q '^beat: sessions unknown ' || fail "non-JSON agents list must read unknown"
printf '[]' > "$tmp/agents.json"; out=$(b "$d")
summary | grep -q '^beat: sessions ok watched 4 absent 4 ' || fail "an empty list is a real answer: $(summary)"
printf '%s' "$agents" > "$tmp/agents.json"

# 3. Quiet for one beat (STALL_BEATS=1): ask due; a planning unit with its plan ledgered is not asked.
for u in api web db ops; do ago 610 "$d/assignments/$u.beat"; done
find "$proj" -type f ! -path '*/.git/*' -exec perl -e '$t=time-5000; utime $t,$t,@ARGV' {} +
out=$(b "$d")
[ "$(field api evidence)" = no ] || fail "quiet worktree shows evidence: $(line 'unit api')"
[ "$(field api ask)" = due ] || fail "api should be due after a quiet beat: $(line 'unit api')"
[ "$(field web ask)" = none ] || fail "planning unit with a ledgered plan must not be asked"
[ "$(field api quiet)" = 10 ] || fail "quiet minutes wrong: $(line 'unit api')"
ago 590 "$d/assignments/api.beat"
out=$(b "$d"); [ "$(field api ask)" = none ] || fail "under one beat must not be due"

# 4. An ask: open, then overdue one beat later, whatever the session list says.
ago 1200 "$d/assignments/api.beat"; b "$d" asked api; ago 300 "$d/assignments/api.asked"
out=$(b "$d"); [ "$(field api ask)" = open ] || fail "fresh ask should be open: $(line 'unit api')"
ago 600 "$d/assignments/api.asked"
out=$(b "$d"); [ "$(field api ask)" = overdue ] || fail "ask a beat old should be overdue: $(line 'unit api')"
ago 3000 "$d/assignments/ops.beat"; b "$d" asked ops; ago 610 "$d/assignments/ops.asked"
out=$(b "$d"); [ "$(field ops ask)" = overdue ] || fail "a session listed busy gets no extra beat: $(line 'unit ops')"

# 5. A message handled (seen) closes the ask; a file written in the worktree is evidence.
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

# 6. Rows: a merged row is not reported; unmerged again, it is.
printf -- '- merged api row r1 @ ddddddd into superconductor/des, tests pass, band low\n' >> "$d/ledger.md"
out=$(b "$d"); printf '%s\n' "$out" | grep -q '^row api r1' && fail "merged row still reported"
printf -- '- unmerged row r1: cut by ruling q1\n' >> "$d/ledger.md"
out=$(b "$d"); printf '%s\n' "$out" | grep -q '^row api r1' || fail "unmerged row not reported again"
reset_ledger

# 7. The ladder (C1, N2, P3): the script writes each restart line with its rung and key.
r=$(b "$d" restart api death); [ "$r" = "- restarted api: death, rung 1, since start gen 0" ] || fail "rung-1 line: $r"
grep -qx -- "$r" "$d/ledger.md" || fail "restart line not in the ledger"
awk '/^## Supervision$/{s=1;next} /^## /{s=0} s' "$d/ledger.md" | grep -qx -- "$r" || fail "restart line not under ## Supervision"
out=$(b "$d"); [ "$(field api restart)" = pending ] || fail "a restart with no resent line is pending"
[ "$(field api rung)" = 2 ] || fail "after one restart the next rung is 2"
perl -0pi -e 's/(- restarted api: death[^\n]*\n)/$1- resent to des-api\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api restart)" = none ] || fail "resent to closes the pending restart"
[ "$(field api rung)" = 2 ] || fail "a completed restart, then a death: rung 2"
r=$(b "$d" restart api unknown); [ "$r" = "- restarted api: unknown, rung 2, since start gen 0" ] || fail "rung-2 line: $r"
perl -0pi -e 's/(- restarted api: unknown[^\n]*\n)/$1- resent to des-api\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 3 ] || fail "a third death must be rung 3, got $(field api rung)"
# Whole words: another unit's restarts and merges change nothing for api.
perl -0pi -e 's/(- plan web[^\n]*\n)/$1- restarted api-2: death, rung 1, since start gen 0\n/' "$d/ledger.md"
printf -- '- merged api-2 @ 1111111111111111111111111111111111111111 into superconductor/des, tests pass, band low\n' >> "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 3 ] || fail "api-2's lines must not count for api (rung $(field api rung))"
# A merge of api's own resets the ladder; the key is the merged line's sha, full length.
full=2222222222222222222222222222222222222222
printf -- '- merged api row r9 @ %s into superconductor/des, tests pass, band low\n' "$full" >> "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 1 ] || fail "a merge must reset the ladder"
r=$(b "$d" restart api stall); [ "$r" = "- restarted api: stall, rung 1, since $full gen 0" ] || fail "key must be the full merged sha: $r"
perl -0pi -e 's/(- restarted api: stall[^\n]*\n)/$1- resent to des-api\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 2 ] || fail "a restart after the merge counts"
# A replacement starts the ladder again (m1).
API=$api; export API
perl -0pi -e 's/(- old: [^\n]*\n)/$1- api: des-api — status: replaced (ruling q2) (needs: none, produces: r1, r2)\n- api: des-api — status: admitted (worktree $ENV{API}, start 0000000, needs: none, produces: r1, r2)\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api rung)" = 1 ] || fail "a replacement must start the ladder again, got $(field api rung)"
reset_ledger
# A relaunch never seen through is pending, so its death is no new rung (OS-2).
perl -0pi -e 's/(- plan web[^\n]*\n)/$1- relaunched db\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field db restart)" = pending ] && [ "$(field db rung)" = 1 ] || fail "relaunch pending: $(line 'unit db')"
reset_ledger

# 7b. launched records the session id; a session that never appears is a failed start that
#     climbs the ladder (R3-1); every launch forgets the last session's id (R3-2).
r=$(bl "$d" launched api); [ "$r" = "des-api aaaa1111-2222-3333-4444-555566667777" ] || fail "launched said: $r"
[ "$(cat "$d/assignments/api.session")" = aaaa1111-2222-3333-4444-555566667777 ] || fail "session id not recorded"
: > "$tmp/agents.fail"; bl "$d" launched api && fail "launched must fail when the session list is unreadable"; rm -f "$tmp/agents.fail"
grep -q '^- launch failed api' "$d/ledger.md" && fail "an unreadable list is no failed start"
grep -qx 'LAUNCH_TRIES=3' "$src" && grep -qx 'LAUNCH_WAIT=10' "$src" || fail "the launch bound must be LAUNCH_TRIES=3, LAUNCH_WAIT=10"
echo stale > "$d/assignments/db.session"
r=$(b "$d" restart db death); [ "$r" = "- restarted db: death, rung 1, since start gen 0" ] || fail "db rung-1: $r"
[ -e "$d/assignments/db.session" ] && fail "a restart must forget the last session's id"
out=$(b "$d"); [ "$(field db restart)" = pending ] || fail "db restart should be pending"
bl "$d" launched db >/dev/null && fail "launched must fail for a session that is never listed"
grep -qx -- '- launch failed db' "$d/ledger.md" || fail "a session that never appears must ledger launch failed"
out=$(b "$d"); [ "$(field db restart)" = none ] && [ "$(field db rung)" = 2 ] || fail "a failed start climbs: $(line 'unit db')"
b "$d" restart db unknown >/dev/null; bl "$d" launched db >/dev/null
out=$(b "$d"); [ "$(field db rung)" = 3 ] || fail "two failed starts reach rung 3: $(line 'unit db')"
echo stale > "$d/assignments/web.session"; b "$d" launching web; [ -e "$d/assignments/web.session" ] && fail "launching must forget the id"
r=$(b "$d" relaunched db); [ "$r" = "- relaunched db" ] || fail "relaunched said: $r"
out=$(b "$d"); [ "$(field db restart)" = pending ] || fail "a relaunch is pending until seen through"
reset_ledger
# A session that cannot start is listed, then failed: launched must not record it (round-4 drill).
dbup='{"name":"des-db","id":"d1","sessionId":"dddd1111-2222-3333-4444-555566667777","status":"busy","state":"working"}'
dbfail='{"name":"des-db","id":"d1","sessionId":"dddd1111-2222-3333-4444-555566667777","status":"idle","state":"failed"}'
mkdir -p "$tmp/agents.seq"; printf '[%s]' "$dbup" > "$tmp/agents.seq/1"; printf '[%s]' "$dbfail" > "$tmp/agents.seq/2"
b "$d" restart db death >/dev/null
bl "$d" launched db >/dev/null && fail "a session that fails after it is listed is no launch"
grep -qx -- '- launch failed db' "$d/ledger.md" || fail "listed-then-failed must ledger launch failed"
[ -e "$d/assignments/db.session" ] && fail "a failed session's id must not be recorded"
mkdir -p "$tmp/agents.seq"; printf '[%s]' "$dbup" > "$tmp/agents.seq/1"; printf '[%s]' "$dbup" > "$tmp/agents.seq/2"; printf '[%s]' "$dbfail" > "$tmp/agents.seq/3"
bl "$d" launched db >/dev/null && fail "launched must confirm the session over the whole wait"
rm -rf "$tmp/agents.seq"
# A failed entry on a beat is a death, not a live session, and the unit climbs.
printf '%s' "$agents" | sed "s/]\$/,$dbfail]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = failed ] && [ "$(field db rung)" = 2 ] || fail "a failed session is dead and climbs: $(line 'unit db')"
summary | grep -q ' absent 1 ' || fail "a failed session counts with the absent: $(summary)"
# A session first listed after launch failed is owed its resends (R4-2).
printf '%s' "$agents" | sed "s/]\$/,$dbup]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = alive ] && [ "$(field db restart)" = pending ] || fail "late session owed resends: $(line 'unit db')"
printf '%s' "$agents" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db restart)" = none ] || fail "absent after launch failed: not pending"
reset_ledger
# The transcript tail: copied, bounded by lines and bytes, only from rung 2 (R3-6).
out=$(b "$d"); printf '%s\n' "$out" | grep -q '^transcript api' && fail "no transcript line below rung 2"
tdir="$HOME/.claude/projects/-my proj-x"; mkdir -p "$tdir"; tf="$tdir/aaaa1111-2222-3333-4444-555566667777.jsonl"
perl -e 'print qq({"n":$_}\n) for 1..300' > "$tf"
b "$d" restart api death >/dev/null; perl -0pi -e 's/(- restarted api: death[^\n]*\n)/$1- resent to des-api\n/' "$d/ledger.md"
rm -f "$d/assignments/api.session"
out=$(b "$d"); printf '%s\n' "$out" | grep -qx "transcript api $(cd "$d" && pwd -P)/assignments/api.tail" || fail "transcript line wrong: $out"
[ "$(wc -l < "$d/assignments/api.tail" | tr -d ' ')" = 200 ] && [ "$(tail -n 1 "$d/assignments/api.tail")" = '{"n":300}' ] || fail "tail must be the last 200 lines"
[ "$(field api investigated)" = no ] || fail "no investigation yet"
perl -0pi -e 's/(- resent to des-api\n)/$1- investigated api: unknown — restart\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api investigated)" = yes ] || fail "a ledgered investigation for this rung (R3-9)"
b "$d" restart api unknown >/dev/null
out=$(b "$d"); [ "$(field api investigated)" = no ] || fail "a restart uses the investigation up"
# Whole lines only (R4-1): the line the byte window cuts is dropped; a tail with no whole line is none.
perl -e 'printf qq({"n":%d,"pad":"%s"}\n), $_, "y" x 1000 for 1..100' > "$tf"
out=$(b "$d"); python3 -c '
import json,sys
for l in open(sys.argv[1]): json.loads(l)' "$d/assignments/api.tail" || fail "every tail line must be a whole JSON line"
[ "$(wc -c < "$d/assignments/api.tail" | tr -d ' ')" -le 65536 ] || fail "tail must be bounded by bytes"
# A window that starts exactly on a line start keeps that line (N5-4).
perl -e 'print q({"head":"), "h" x 100, qq("}\n); print q({"w":"), "w" x 65527, qq("}\n)' > "$tf"
[ "$(tail -n 1 "$tf" | wc -c | tr -d ' ')" = 65536 ] || fail "fixture: the last line must be exactly TAIL_BYTES"
out=$(b "$d"); [ "$(wc -l < "$d/assignments/api.tail" | tr -d ' ')" = 1 ] || fail "a line starting exactly at the window start must be kept"
perl -e 'print qq({"n":1}\n), q({"big":"), "x" x 200000, qq("}\n)' > "$tf"
out=$(b "$d"); printf '%s\n' "$out" | grep -qx 'transcript api none' || fail "a tail with no whole line must read none: $(printf '%s\n' "$out" | grep '^transcript')"
rm -f "$tf"; out=$(b "$d"); printf '%s\n' "$out" | grep -qx 'transcript api none' || fail "a missing transcript must read none"
reset_ledger
# Whole words in the pending check (R3-5).
perl -0pi -e 's/(- plan web[^\n]*\n)/$1- restarted api-2: death, rung 1, since start gen 0\n/' "$d/ledger.md"
out=$(b "$d"); [ "$(field api restart)" = none ] || fail "api-2's restart must not make api pending"
reset_ledger

# 7c. Same-named entries (N5-1): a failed one stays listed beside its relaunch.
live2='{"name":"des-db","id":"d2","sessionId":"eeee1111-2222-3333-4444-555566667777","status":"busy","state":"working"}'
failed2='{"name":"des-db","id":"d1","sessionId":"dddd1111-2222-3333-4444-555566667777","status":"idle","state":"failed"}'
failed3='{"name":"des-db","id":"d0","sessionId":"cccc1111-2222-3333-4444-555566667777","status":"idle","state":"failed"}'
printf '%s' "$agents" | sed "s/]\$/,$failed2,$live2]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = alive ] || fail "failed + live under one name is alive: $(line 'unit db')"
r=$(bl "$d" launched db); [ "$r" = "des-db eeee1111-2222-3333-4444-555566667777" ] || fail "launched must record the live entry: $r"
printf '%s' "$agents" | sed "s/]\$/,$live2,$failed2]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = alive ] || fail "the order of same-named entries must not matter"
printf '%s' "$agents" | sed "s/]\$/,$failed3,$failed2]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = failed ] || fail "failed + failed is not alive: $(line 'unit db')"
# stop targets each entry's own short id and waits a bounded time, whatever the list does.
rm -f "$tmp/stopped"
r=$(bl "$d" stop db failed); [ "$r" = "stop db: stopped d0,d1; still listed: d0:failed,d1:failed" ] || fail "stop with entries that stay: $r"
[ "$(tr '\n' ' ' < "$tmp/stopped")" = "d0 d1 " ] || fail "stop must target short ids: $(cat "$tmp/stopped")"
grep -q des-db "$tmp/stopped" && fail "stop must never pass the name"
sl=$(sed 's/^LAUNCH_WAIT=10$/LAUNCH_WAIT=1/' "$src" > "$tmp/beat-1s.sh"; echo "$tmp/beat-1s.sh")
t0=$(date +%s); sh "$sl" "$d" stop db failed >/dev/null; el=$(( $(date +%s) - t0 ))
[ "$el" -ge 2 ] && [ "$el" -le 5 ] || fail "stop must look LAUNCH_TRIES times LAUNCH_WAIT apart and no longer (took ${el}s)"
printf '%s' "$agents" | sed "s/]\$/,$failed2,$live2]/" > "$tmp/agents.json"; rm -f "$tmp/stopped"
r=$(bl "$d" stop db failed); [ "$(cat "$tmp/stopped")" = d1 ] || fail "stop failed must leave the live entry alone: $(cat "$tmp/stopped")"
[ "$r" = "stop db: stopped d1; still listed: d1:failed,d2:live" ] || fail "stop must report each entry still listed with its state (m6-1): $r"
: > "$tmp/stop-removes"; printf '%s' "$agents" | sed "s/]\$/,$failed2]/" > "$tmp/agents.json"
r=$(bl "$d" stop db failed); [ "$r" = "stop db: stopped d1; still listed: none" ] || fail "stop with an entry that leaves: $r"
r=$(bl "$d" stop db failed); [ "$r" = "stop db: stopped none; still listed: none" ] || fail "stop run again after it is done: $r"
rm -f "$tmp/stop-removes" "$tmp/stopped"; printf '%s' "$agents" > "$tmp/agents.json"
# An unreadable list: stop exits non-zero and claims nothing (m6-2).
: > "$tmp/agents.fail"; r=$(bl "$d" stop db); rc=$?; rm -f "$tmp/agents.fail"
[ "$rc" -eq 3 ] && [ "$r" = "stop db: the session list is unreadable; still listed: unknown" ] || fail "unreadable list: rc $rc, $r"
# A launching unit is judged by the same definition of alive, and is never asked or counted absent (I6-1).
perl -0pi -e 's/- db: des-db — status: admitted/- db: des-db — status: launching/' "$d/ledger.md"
ago 3000 "$d/assignments/db.beat" 2>/dev/null
out=$(b "$d"); [ "$(field db status)" = launching ] && [ "$(field db session)" = absent ] && [ "$(field db ask)" = none ] || fail "launching, absent: $(line 'unit db')"
summary | grep -q ' absent 0 ' || fail "a launching unit is not counted dead: $(summary)"
printf '%s' "$agents" | sed "s/]\$/,$failed2,$live2]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = alive ] || fail "launching with a live entry: $(line 'unit db')"
printf '%s' "$agents" | sed "s/]\$/,$failed2]/" > "$tmp/agents.json"
out=$(b "$d"); [ "$(field db session)" = failed ] || fail "launching with only a failed entry: $(line 'unit db')"
# A launching unit is never asked, so a stale ask from an earlier operator never reads overdue (N7-1).
ago 3000 "$d/assignments/db.beat"; b "$d" asked db; ago 1200 "$d/assignments/db.asked"
out=$(b "$d"); [ "$(field db ask)" = none ] || fail "a launching unit must read ask none: $(line 'unit db')"
printf '%s' "$agents" > "$tmp/agents.json"
# A probe that sees failed stops at once, even if the session is up again later (N5-4).
mkdir -p "$tmp/agents.seq"; printf '[%s]' "$dbup" > "$tmp/agents.seq/1"; printf '[%s]' "$dbfail" > "$tmp/agents.seq/2"; printf '[%s]' "$dbup" > "$tmp/agents.seq/3"
bl "$d" launched db >/dev/null && fail "up, failed, up is a failed start"
rm -rf "$tmp/agents.seq"
reset_ledger

# 8. Waiting for a usage reset (N4): not absent, not asked, not movable; then over; restart has no rung.
r=$(b "$d" wait db 30); printf '%s\n' "$r" | grep -q '^- waiting reset db until [0-9]*$' || fail "wait line: $r"
out=$(b "$d"); field db wait | grep -q '^until-' || fail "db should be waiting: $(line 'unit db')"
[ "$(field db movable)" = no ] || fail "a waiting unit cannot move"
summary | grep -q ' absent 0 ' || fail "a waiting unit is not absent: $(summary)"
summary | grep -q ' waiting 1 next-reset [0-9]' || fail "next-reset missing: $(summary)"
perl -pi -e 's/(waiting reset db until )\d+/${1}1000/' "$d/ledger.md"
out=$(b "$d"); [ "$(field db wait)" = over ] || fail "a past reset is over"
r=$(b "$d" restart db usage-limit); [ "$r" = "- restarted db: usage-limit, since start gen 0" ] || fail "usage-limit restart line: $r"
out=$(b "$d"); [ "$(field db wait)" = none ] && [ "$(field db rung)" = 1 ] || fail "usage-limit restart climbs no rung: $(line 'unit db')"
reset_ledger

# 9. Question files, with a space in the path and whole-word ids.
mkdir -p "$d/questions"; : > "$d/questions/api-1.md"; : > "$d/questions/api-10.md"
perl -0pi -e 's/(## Questions\n)/$1- 2026-11-13 api-10 from api [defect-class: x]: q\n/' "$d/ledger.md"
out=$(b "$d")
printf '%s\n' "$out" | grep -qx 'question api-1' || fail "unledgered question api-1 not reported: $out"
printf '%s\n' "$out" | grep -q '^question api-10' && fail "api-10 is ledgered (whole-word match)"
reset_ledger; rm -rf "$d/questions"

# 10. Movable: a planned unit whose needed row has no live producer cannot move.
perl -0pi -e 's/status: admitted \(branch des-api/status: stopped (branch des-api/' "$d/ledger.md"
out=$(b "$d"); [ "$(field web movable)" = no ] || fail "web waits on r1 from a stopped unit: $(line 'unit web')"
reset_ledger

# 11. The timer: pid and deadline, found while it sleeps, stopped by stop-timer and resume.
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

# 12. Forks: the limit stops the whole group (124); own status kept; signal death 128+n;
#     a normal exit leaves nothing in the group (N3).
sh "$tmp/beat-fast.sh" "$d" fork rule-q1 sh -c 'echo started; sleep 60 & sleep 60; wait' > "$d/prompts/rule-q1.out"
rc=$?; [ "$rc" -eq 124 ] || fail "limit exit $rc, want 124"
pg=$(cat "$d/prompts/rule-q1.pid"); sleep 1
pgrep -g "$pg" >/dev/null && fail "group $pg survived the limit"
grep -qx started "$d/prompts/rule-q1.out" || fail "fork output lost"
b "$d" fork review-x sh -c 'echo "No drift @ abc1234"; exit 3' > "$d/prompts/review-x.out"; rc=$?
[ "$rc" -eq 3 ] || fail "own exit status lost ($rc)"
b "$d" fork review-y sh -c 'kill -9 $$'; rc=$?
[ "$rc" -eq 137 ] || fail "signal death must exit 137, got $rc"
b "$d" fork review-z sh -c 'sleep 60 & exit 0'; rc=$?
[ "$rc" -eq 0 ] || fail "normal exit with a straggler: rc $rc"
pgrep -g "$(cat "$d/prompts/review-z.pid")" >/dev/null && fail "a straggler survived the fork's exit"
# The limit KILLing an amending fork clears the package lock (m5); a read-only fork's does not.
lock=$(git -C "$proj/pkg" rev-parse --path-format=absolute --git-path index.lock)
: > "$lock"; sh "$tmp/beat-fast.sh" "$d" fork review-k sh -c 'trap "" TERM; sleep 60'
[ -e "$lock" ] || fail "a read-only fork's KILL must not touch the lock"
sh "$tmp/beat-fast.sh" "$d" fork rule-k sh -c 'trap "" TERM; sleep 60'
[ -e "$lock" ] && fail "an amending fork KILLed by the limit must clear the lock"

# 13. A running fork is reported running; stop-fork stops it, escalating to KILL and clearing the lock.
b "$d" fork rule-q1 sh -c 'trap "" TERM; sleep 60' & sleep 1
out=$(b "$d"); printf '%s\n' "$out" | grep -qx 'fork rule-q1 running failures 0' || fail "running fork not reported: $out"
: > "$lock"
pkill -KILL -f "$d/prompts/rule-q1.pid"; sleep 1    # the watchdog dies hard, as with its conductor
r=$(b "$d" stop-fork rule-q1); [ "$r" = "killed rule-q1" ] || fail "stop-fork said: $r"
pgrep -g "$(cat "$d/prompts/rule-q1.pid")" >/dev/null && fail "stop-fork left the group"
[ -e "$lock" ] && fail "stop-fork after KILL must remove the package worktree's index lock"
r=$(b "$d" stop-fork rule-q1); [ "$r" = "not running rule-q1" ] || fail "second stop-fork said: $r"

# 14. Strays: terminal-less, inside the worktree (not a sibling sharing its prefix), and for
#     kill-strays, matching the named command (R3-3, R3-5).
mkdir -p "$api-x"
perl -MPOSIX -e 'fork and exit; POSIX::setsid(); chdir $ARGV[0]; exec "sleep", "61"' "$api"
perl -MPOSIX -e 'fork and exit; POSIX::setsid(); chdir $ARGV[0]; exec "sleep", "65"' "$api"
perl -MPOSIX -e 'fork and exit; POSIX::setsid(); chdir $ARGV[0]; exec "sleep", "62"' "$proj/pkg"
perl -MPOSIX -e 'fork and exit; POSIX::setsid(); chdir $ARGV[0]; exec "sleep", "63"' "$api-x"
( cd "$api" && script -q /dev/null sleep 64 >/dev/null 2>&1 & )
sleep 2
pgrep -x sleep -f >/dev/null; ps -o tty= -p "$(pgrep -f '^sleep 64$' | head -n 1)" | grep -q '?' && fail "fixture: sleep 64 should have a terminal"
out=$(b "$d" strays api)
printf '%s\n' "$out" | grep -q '^stray [0-9]* sleep 61$' || fail "stray in api's worktree not listed: $out"
printf '%s\n' "$out" | grep -q 'sleep 62' && fail "a process outside the worktree was listed"
printf '%s\n' "$out" | grep -q 'sleep 63' && fail "a process in a sibling sharing the worktree's prefix was listed"
printf '%s\n' "$out" | grep -q '^stray [0-9]* sleep 64$' && fail "a process with a terminal was listed"
b "$d" kill-strays api >/dev/null 2>&1 && fail "kill-strays needs the named command"
pgrep -f '^sleep 61$' >/dev/null || fail "kill-strays with no command must kill nothing"
# The command comes from the investigation's answer in a file, never through a shell (R4-4).
printf '%s\n' 'cause: hung process "$(touch '"$tmp"'/pwned)"' > "$d/assignments/api.cause"
b "$d" kill-strays api >/dev/null; [ -e "$tmp/pwned" ] && fail "the named command must never reach a shell"
pgrep -f '^sleep 61$' >/dev/null || fail "an unmatched command must kill nothing"
printf '%s\n' 'cause: hung process sleep 61' > "$d/assignments/api.cause"
b "$d" kill-strays api >/dev/null; sleep 1
pgrep -f '^sleep 61$' >/dev/null && fail "kill-strays left the named stray"
pgrep -f '^sleep 65$' >/dev/null || fail "kill-strays stopped a stray it was not named"
pgrep -f '^sleep 62$' >/dev/null || fail "kill-strays stopped a process outside the worktree"
pkill -f '^sleep 6[2-5]$'; pkill -f 'script -q /dev/null sleep 64'

# 15. changed: the operator's evidence between wait stretches.
cd "$api" || fail "cd"
m="$d/assignments/api.stretch"
[ -z "$(sh "$src" changed "$m")" ] || fail "first changed call must only set the marker"
sleep 1; [ -z "$(sh "$src" changed "$m")" ] || fail "no change must print nothing"
sleep 1; echo z >> src.txt
[ -n "$(sh "$src" changed "$m")" ] || fail "an edit to an already-modified file must show"
[ -z "$(sh "$src" changed "$m")" ] || fail "changed must reset its marker"
cd "$root" || exit 1

# 16. The bounds the prose quotes follow from the constants here (R3-7).
skill_md="$root/plugins/supersonic/skills/superconductor/SKILL.md"
briefing="$root/plugins/supersonic/skills/superconductor/operator-briefing.md"
flat=$(tr '\n' ' ' < "$skill_md" | tr -s ' ')
k() { sed -n "s/^$1=\([0-9]*\)$/\1/p" "$src"; }
beat_m=$(( $(k BEAT) / 60 )); stall_m=$(( $(k STALL_BEATS) * beat_m ))
for p in "(${stall_m} minutes)" "asked ${stall_m} to $((stall_m + beat_m)) minutes after its last evidence" \
         "stalled one beat later: $((stall_m + beat_m)) to $((stall_m + 2 * beat_m)) minutes" \
         "every \`BEAT\` (${beat_m} minutes)" \
         "$(k LAUNCH_TRIES) tries over $(( ($(k LAUNCH_TRIES) - 1) * $(k LAUNCH_WAIT) )) seconds"; do
  printf '%s\n' "$flat" | grep -qF -- "$p" || fail "SKILL.md must quote the bound the constants give: $p"
done
stretch=$(sed -n 's/.*background `sleep \([0-9]*\)`.*/\1/p' "$briefing" | head -n 1)
[ -n "$stretch" ] && [ "$stretch" -lt "$(k BEAT)" ] || fail "the operator's stretch ($stretch s) must be shorter than BEAT"

# The project comes from the ledger's `Package worktree:` line: a conventional unit (no
# `worktree` field) is found at <main checkout>/.claude/worktrees/<design>-<unit>, though the
# ledger dir lies outside the project. `seen` records that worktree's head.
b "$d" seen db >/dev/null 2>&1
want=$(git -C "$proj/.claude/worktrees/des-db" rev-parse HEAD)
[ "$(cat "$d/assignments/db.beat")" = "$want" ] || fail "a conventional unit's worktree must be found from Package worktree: $(cat "$d/assignments/db.beat")"

echo "PASS: beat.sh"
