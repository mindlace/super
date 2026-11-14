#!/bin/sh
# Live drill of the peer-session mechanisms. Gated on SUPERSONIC_LIVE=1.
# Prints PASS:/FAIL: <step>; exits non-zero on any FAIL.
if [ "${SUPERSONIC_LIVE:-}" != "1" ]; then
  echo "SKIP: set SUPERSONIC_LIVE=1 to run the live peer-session drill"
  exit 0
fi
set -u
fails=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; fails=$((fails + 1)); }

pid=$$
op="drill-$pid-op"
cond="drill-$pid-cond"
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
wt="$main/.claude/worktrees/drill-peer-$pid"
branch="drill/peer-$pid"
scratch=$(mktemp -d)

# ids of every active session whose name starts with this drill's prefix
drill_ids() {
  claude agents --json 2>/dev/null | python3 -c '
import json,sys
p=sys.argv[1]
for a in json.load(sys.stdin):
    if (a.get("name") or "").startswith(p): print(a["id"])' "drill-$pid-"
}
cleanup() {
  for id in $(drill_ids); do claude stop "$id" >/dev/null 2>&1; done
  cd "$main" 2>/dev/null || cd /
  git -C "$main" worktree remove --force "$wt" >/dev/null 2>&1
  git -C "$main" branch -D "$branch" >/dev/null 2>&1
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

git -C "$main" worktree add -q -b "$branch" "$wt" HEAD || { echo "FAIL: worktree"; exit 1; }
cd "$wt" || exit 1
wtp=$(pwd -P)

tools="Read,Write,SendMessage"
# the operator is launched with the superconductor skill's launch template
# (test command replaced by the harmless Bash(true:*)); the ledger dir is outside the worktree
op_tools="Read,Grep,Glob,Write,Edit,Skill,Agent,SendMessage,TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(git show:*),Bash(git merge:*),Bash(git rm:*),Bash(true:*)"
ledger="$scratch/ledger"
mkdir -p "$ledger"
ledger=$(cd "$ledger" && pwd -P)

# --- spawn ---
cat > "$scratch/op.txt" <<PROMPT
You are the session named $op. Your peer is named $cond. You are already in worktree $wtp; that satisfies the worktree rule; do not create another. Marker: \`op\`. Do nothing now; end your turn and wait to be messaged. When a message from $cond asks you to, do exactly what it says.
PROMPT
cat > "$scratch/cond.txt" <<PROMPT
You are the session named $cond. Your peer is named $op. You are already in worktree $wtp; that satisfies the worktree rule; do not create another. Marker: \`cond\`.
Do this now: call SendMessage to $op (by name) with notify_when_idle enabled, message text exactly: "Please write the file op-done.txt in $wtp containing the single word PONG, then write the file $ledger/ledger-done.txt containing the single word LEDGER, then reply to $cond by name with the single word DONE." Then end your turn.
When the reply from $op arrives, write $wtp/cond-done.txt containing the reply text, and also the token IDLE-NOTIFIED if an idle notification from $op arrived. Then end your turn.
PROMPT
env -C "$wtp" claude --bg -n "$op" --model haiku --permission-mode acceptEdits --allowedTools="$op_tools" --add-dir="$ledger" "$(cat "$scratch/op.txt")" >"$scratch/launch-$op.log" 2>&1 </dev/null
echo "INFO operator launch: env -C \"$wtp\" claude --bg -n $op --model haiku --permission-mode acceptEdits --allowedTools=\"$op_tools\" --add-dir=\"$ledger\" \"<prompt>\""
sleep 2
env -C "$wtp" claude --bg -n "$cond" --model haiku --permission-mode acceptEdits --allowedTools="$tools" "$(cat "$scratch/cond.txt")" >"$scratch/launch-$cond.log" 2>&1 </dev/null
sleep 2
agents=$(claude agents --json 2>/dev/null)
if echo "$agents" | grep -q "\"$op\"" && echo "$agents" | grep -q "\"$cond\""; then pass spawn; else fail spawn; fi

# --- message ---
t0=$(date +%s); opt=""; deadline=$((t0 + 300))
while [ "$(date +%s)" -lt "$deadline" ]; do
  [ -z "$opt" ] && [ -f op-done.txt ] && opt=$(( $(date +%s) - t0 ))
  [ -f op-done.txt ] && [ -f cond-done.txt ] && [ -f "$ledger/ledger-done.txt" ] && break
  sleep 5
done
if [ -f op-done.txt ] && grep -q PONG op-done.txt && [ -f cond-done.txt ] && grep -q DONE cond-done.txt \
   && grep -q LEDGER "$ledger/ledger-done.txt" 2>/dev/null \
   && [ -n "$opt" ] && [ "$opt" -le 120 ]; then
  pass "message (op-done after ${opt}s)"
else
  fail "message (op-done after ${opt:-never}s; cond-done: $(cat cond-done.txt 2>/dev/null); ledger-done: $(cat "$ledger/ledger-done.txt" 2>/dev/null))"
fi
if [ -f cond-done.txt ] && grep -q IDLE-NOTIFIED cond-done.txt; then echo "INFO: idle notice arrived"; else echo "INFO: no idle notice recorded"; fi

# --- checkpoint ---
mkdir -p pkg/questions pkg/rulings
printf '# Design\n\n- Unit A writes a.txt containing 1\n' > pkg/design.md
printf '# Q1\n\nChange the value to 2.\n' > pkg/questions/q1.md
git add pkg && git -c user.name=drill -c user.email=drill@example.invalid commit -q -m "drill: package" 
cp_json=$(claude -p --model haiku --output-format json --allowedTools="Read" "Read pkg/design.md in the current directory and remember its rule. Reply with the single word READY." </dev/null 2>"$scratch/cp.err")
cpid=$(printf '%s' "$cp_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)
if [ -n "$cpid" ]; then pass "checkpoint ($cpid)"; else fail "checkpoint"; fi

# --- fork ---
proj="$HOME/.claude/projects/$(printf '%s' "$wtp" | sed 's|[/.]|-|g')"
tr_cp="$proj/$cpid.jsonl"
h0=$(shasum "$tr_cp" 2>/dev/null)
claude -p --resume "$cpid" --fork-session --model haiku --output-format json \
  --permission-mode acceptEdits \
  --allowedTools="Read,Write,Edit,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*)" \
  "Read pkg/questions/q1.md in the current directory. Disk wins over your memory of the package. Apply the change: rewrite pkg/design.md as the current state of the design (no history, no mention of the old value), then git add and git commit it, then write pkg/rulings/q1.md naming the commit sha (from git rev-parse HEAD), then stop." \
  </dev/null >"$scratch/f1.json" 2>"$scratch/f1.err" &
p1=$!
claude -p --resume "$cpid" --fork-session --model haiku --output-format json --allowedTools="Read" \
  "Reply with one line only: the rule in the design you remember, with no preamble." \
  </dev/null >"$scratch/f2.json" 2>"$scratch/f2.err" &
p2=$!
wait $p1; wait $p2
f2=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("result",""))' "$scratch/f2.json" 2>/dev/null)
f1id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("session_id",""))' "$scratch/f1.json" 2>/dev/null)
h1=$(shasum "$tr_cp" 2>/dev/null)
sha=$(grep -oE '[0-9a-f]{7,40}' pkg/rulings/q1.md 2>/dev/null | head -1)
ok=1
[ -n "$sha" ] && git log --format=%H | grep -q "^$sha" || { ok=0; echo "  ruling sha missing or not in git log: '$sha'"; }
grep -q '2' pkg/design.md || { ok=0; echo "  design.md lacks 2"; }
grep -qi 'previous\|changed from' pkg/design.md && { ok=0; echo "  design.md has history language"; }
[ -n "$f2" ] && [ "$(printf '%s\n' "$f2" | wc -l)" -eq 1 ] || { ok=0; echo "  fork 2 not one line: '$f2'"; }
[ -n "$h0" ] && [ "$h0" = "$h1" ] || { ok=0; echo "  checkpoint transcript hash changed or missing ($tr_cp)"; }
if [ "$ok" = 1 ]; then pass fork; else fail fork; fi

# --- ttl-report (information only) ---
python3 - "$proj/$f1id.jsonl" <<'PY'
import json,sys
a=b=0
try:
    for line in open(sys.argv[1]):
        try: d=json.loads(line)
        except ValueError: continue
        u=(d.get("message") or {}).get("usage") or {}
        cc=u.get("cache_creation") or {}
        a+=cc.get("ephemeral_5m_input_tokens",0); b+=cc.get("ephemeral_1h_input_tokens",0)
    print(f"INFO ttl-report: ephemeral_5m_input_tokens={a} ephemeral_1h_input_tokens={b}")
except OSError as e:
    print("INFO ttl-report: no fork transcript", e)
PY
claude agents --json 2>/dev/null | python3 -c '
import json,sys
keys=set()
for a in json.load(sys.stdin): keys|=set(a)
print("INFO agents --json keys:", sorted(keys))
print("INFO agents --json usage field:", any("usage" in k or "token" in k for k in keys))'

# --- stop ---
claude stop "$op" >"$scratch/stop-op.log" 2>&1; echo "INFO stop by name ($op): exit $? $(head -c 120 "$scratch/stop-op.log")"
for id in $(drill_ids); do claude stop "$id" >/dev/null 2>&1; done
sleep 2
if [ -z "$(drill_ids)" ]; then pass stop; else fail "stop (still listed: $(drill_ids))"; fi

[ "$fails" -eq 0 ]
