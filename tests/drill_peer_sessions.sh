#!/bin/sh
# Live drill of the peer-session mechanisms. Gated on SUPERSONIC_LIVE=1.
# Prints PASS:/FAIL:/OBSERVED: <step>; exits non-zero on any FAIL. The whole run is appended,
# dated, to tests/peer-session-drill-result.txt.
# Cost and time: four `claude --bg` sessions and five `claude -p` runs, all on haiku with
# trivial prompts (plus two haiku subagents inside one session). Every wait has its own
# deadline; a run takes about 10 minutes and never more than 25 (DRILL_DEADLINE). Every
# session, worktree and process group it starts is stopped or removed on exit.
if [ "${SUPERSONIC_LIVE:-}" != "1" ]; then
  echo "SKIP: set SUPERSONIC_LIVE=1 to run the live peer-session drill"
  exit 0
fi
if [ -z "${DRILL_TEED:-}" ]; then
  here=$(cd "$(dirname "$0")" && pwd -P)
  out=$(mktemp)
  DRILL_TEED=1 sh "$here/$(basename "$0")" "$@" 2>&1 | tee "$out"
  rc=$(sed -n 's/^DRILL-EXIT: //p' "$out" | tail -n 1)
  { printf '\nDrill run %s\n' "$(date '+%Y-%m-%d %H:%M')"; grep -v '^DRILL-EXIT: ' "$out"; } >> "$here/peer-session-drill-result.txt"
  rm -f "$out"
  exit "${rc:-1}"
fi
set -u
DRILL_DEADLINE=$(( $(date +%s) + 1500 ))
observed() { echo "OBSERVED: $1"; }
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
# the superconductor skill's directory, where beat.sh lives
skill=$(cd "$(dirname "$0")/../plugins/supersonic/skills/superconductor" && pwd -P)

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
  for f in "$scratch"/ledger/prompts/*.pid; do [ -f "$f" ] && pkill -KILL -g "$(cat "$f")" 2>/dev/null; done
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
# SDD's scripts directory, resolved the way the conductor resolves it at intake: the scripts/
# directory of the installed superpowers subagent-driven-development skill
sdd=$(python3 -c '
import json,os
d=json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json")))
for k,v in d.get("plugins",{}).items():
    if k.split("@")[0]=="superpowers" and v:
        print(v[0]["installPath"]+"/skills/subagent-driven-development/scripts"); break' 2>/dev/null)
if [ -n "$sdd" ] && [ -f "$sdd/sdd-workspace" ]; then pass "sdd scripts dir ($sdd)"; else fail "sdd scripts dir ('$sdd')"; fi
# the operator is launched with the superconductor skill's launch template (project command
# replaced by the harmless Bash(true:*)); the ledger dir is outside the worktree
op_tools="Read,Grep,Glob,Write,Edit,Skill,Agent,SendMessage,TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,TaskStop,Bash(sleep:*),Bash(sh $skill/beat.sh changed:*),Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(git show:*),Bash(git merge:*),Bash(git merge-base:*),Bash(git branch:*),Bash(git rm:*),Bash(bash $sdd/sdd-workspace:*),Bash(bash $sdd/task-brief:*),Bash(bash $sdd/review-package:*),Bash(true:*)"
ledger="$scratch/ledger"
mkdir -p "$ledger"
ledger=$(cd "$ledger" && pwd -P)
# a small committed plan for the operator's SDD script call
printf '# Drill plan\n\n### Task 1: nothing\n\nNo steps.\n' > drill-plan.md
git add drill-plan.md && git -c user.name=drill -c user.email=drill@example.invalid commit -q -m "drill: plan"

# --- spawn ---
cat > "$scratch/op.txt" <<PROMPT
You are the session named $op. Your peer is named $cond. You are already in worktree $wtp; that satisfies the worktree rule; do not create another. Marker: \`op\`. Do nothing now; end your turn and wait to be messaged. When a message from $cond asks you to, do exactly what it says.
PROMPT
cat > "$scratch/cond.txt" <<PROMPT
You are the session named $cond. Your peer is named $op. You are already in worktree $wtp; that satisfies the worktree rule; do not create another. Marker: \`cond\`.
Do this now: call SendMessage to $op (by name) with notify_when_idle enabled, message text exactly: "Please run the Bash command bash $sdd/sdd-workspace drill-plan.md from your cwd, then call the Skill tool once with skill superpowers:verification-before-completion (only load it), then write the file op-done.txt in $wtp containing the single word PONG, then write the file $ledger/ledger-done.txt containing the single word LEDGER, then reply to $cond by name with the single word DONE." Then end your turn.
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

# --- sdd-and-skill: the operator ran an SDD script by absolute path and made a Skill call,
# both inside the launch list (op-done within 120 s above rules out a permission stall) ---
proj="$HOME/.claude/projects/$(printf '%s' "$wtp" | sed 's|[/.]|-|g')"
opsid=$(claude agents --json 2>/dev/null | python3 -c '
import json,sys
for a in json.load(sys.stdin):
    if a.get("name")==sys.argv[1]: print(a.get("sessionId","")); break' "$op")
calls=$(python3 - "$proj/$opsid.jsonl" "$sdd/sdd-workspace" <<'PY'
import json,sys
uses={}; errs=set(); out=[]
try:
    for line in open(sys.argv[1]):
        try: d=json.loads(line)
        except ValueError: continue
        c=(d.get("message") or {}).get("content")
        if not isinstance(c,list): continue
        for b in c:
            if b.get("type")=="tool_use": uses[b["id"]]=(b.get("name"),json.dumps(b.get("input")))
            if b.get("type")=="tool_result" and b.get("is_error"): errs.add(b.get("tool_use_id"))
except OSError: pass
for i,(n,inp) in uses.items():
    if n=="Bash" and ("bash "+sys.argv[2]) in json.loads(inp).get("command","") and i not in errs: out.append("SDD")
    if n=="Skill" and i not in errs: out.append("SKILL")
print(" ".join(sorted(set(out))))
PY
)
if [ -d "$wtp/.superpowers/sdd/drill-plan" ] && [ "$calls" = "SDD SKILL" ]; then
  pass "sdd-and-skill (sdd-workspace made .superpowers/sdd/drill-plan; transcript: $calls)"
else
  fail "sdd-and-skill (workspace dir: $([ -d "$wtp/.superpowers/sdd/drill-plan" ] && echo yes || echo no); transcript calls: '${calls}'; transcript $proj/$opsid.jsonl)"
fi

# --- checkpoint ---
mkdir -p pkg/questions pkg/rulings
printf '# Design\n\n- Unit A writes a.txt containing 1\n' > pkg/design.md
printf '# Q1\n\nChange the value to 2.\n' > pkg/questions/q1.md
git add pkg && git -c user.name=drill -c user.email=drill@example.invalid commit -q -m "drill: package" 
cp_json=$(claude -p --model haiku --output-format json --allowedTools="Read" "Read pkg/design.md in the current directory and remember its rule. Reply with the single word READY." </dev/null 2>"$scratch/cp.err")
cpid=$(printf '%s' "$cp_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)
if [ -n "$cpid" ]; then pass "checkpoint ($cpid)"; else fail "checkpoint"; fi

# --- fork ---
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

# --- stall detection: the facts beat.sh and the skill rely on ---
# Copies of beat.sh with short fork limits bound every claude command below.
fast="$scratch/beat-20.sh"; kill3="$scratch/beat-3.sh"; long="$scratch/beat-300.sh"
sed 's/^FORK_LIMIT=2700$/FORK_LIMIT=20/' "$skill/beat.sh" > "$fast"
sed 's/^FORK_LIMIT=2700$/FORK_LIMIT=3/' "$skill/beat.sh" > "$kill3"
sed 's/^FORK_LIMIT=2700$/FORK_LIMIT=300/' "$skill/beat.sh" > "$long"
mkdir -p "$ledger/prompts"
agent_field() { # agent_field <name> <field>
  claude agents --json 2>/dev/null | python3 -c '
import json,sys
for a in json.load(sys.stdin):
    if a.get("name")==sys.argv[1]: print(a.get(sys.argv[2])); break' "$1" "$2"
}
until_file() { # until_file <path> <seconds>: wait for a file, bounded by the drill deadline
  end=$(( $(date +%s) + $2 )); [ "$end" -gt "$DRILL_DEADLINE" ] && end=$DRILL_DEADLINE
  while [ ! -s "$1" ] && [ "$(date +%s)" -lt "$end" ]; do sleep 2; done
  [ -s "$1" ]
}
mt() { perl -e 'print((stat shift)[9] // "")' "$1"; }

# 2a. claude logs on a running --bg session (the rung-2 investigation reads it).
opid=$(agent_field "$op" id)
sh "$fast" "$ledger" fork logs-running claude logs "$opid" >"$scratch/logs-running.out" 2>&1; rc=$?
observed "claude logs <running short id>: exit $rc (124 = still streaming at 20 s), $(wc -l < "$scratch/logs-running.out" | tr -d ' ') lines, first: $(head -c 100 "$scratch/logs-running.out" | tr '\n' ' ')"
if [ -s "$scratch/logs-running.out" ] && { [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; }; then pass "logs of a running session"; else fail "logs of a running session (exit $rc)"; fi

# 3. claude -p under beat.sh fork: the limit stops it and its whole group; a normal exit leaves nothing.
t0=$(date +%s)
sh "$kill3" "$ledger" fork drill-limit env -C "$wtp" claude -p --model haiku --allowedTools="Read" \
  "Write a numbered list of 300 short lines about rivers." </dev/null >"$scratch/limit.out" 2>&1; rc=$?
el=$(( $(date +%s) - t0 )); sleep 2
lim_left=$(pgrep -g "$(cat "$ledger/prompts/drill-limit.pid")" 2>/dev/null | wc -l | tr -d ' ')
observed "claude -p under a 3 s limit: exit $rc after ${el}s; processes left in its group: $lim_left"
if [ "$rc" -eq 124 ] && [ "$lim_left" -eq 0 ]; then pass "fork limit stops claude -p and its group"; else fail "fork limit (exit $rc, $lim_left left)"; fi
sh "$long" "$ledger" fork drill-normal env -C "$wtp" claude -p --model haiku --allowedTools="Read" \
  "Reply with the single word OK." </dev/null >"$scratch/normal.out" 2>&1; rc=$?
sleep 2
norm_left=$(pgrep -g "$(cat "$ledger/prompts/drill-normal.pid")" 2>/dev/null | wc -l | tr -d ' ')
observed "claude -p normal exit under the watchdog: exit $rc, output '$(head -c 40 "$scratch/normal.out" | tr '\n' ' ')', processes left in its group: $norm_left"
if [ "$rc" -eq 0 ] && [ "$norm_left" -eq 0 ]; then pass "normal fork exit leaves no process"; else fail "normal fork exit (exit $rc, $norm_left left)"; fi

# 4. A --bg operator launched with the skill's exact launch form: background Agent, TaskStop,
#    beat.sh changed timing, SendMessage to a missing name, a background sleep's wake, and a
#    message read while that sleep runs. Its session list status is sampled all along (1).
op2="drill-$pid-op2"; cond2="drill-$pid-cond2"; o="$wtp/op2"; mkdir -p "$o"
cat > "$scratch/op2.txt" <<PROMPT
You are the session named $op2. You are already in worktree $wtp; that satisfies the worktree rule; do not create another. Do these steps in order, writing every file with the Write tool, each containing only what it says.
1. Dispatch a subagent with the Agent tool, model haiku, run_in_background true, prompt: "Reply with the single word LEAF. Your final message is your report; do not use SendMessage." Write $o/agent-dispatched.txt containing the agentId the dispatch returned. Whenever its completion notification arrives, write $o/agent-result.txt containing its result.
2. Dispatch a second subagent with the Agent tool, model haiku, run_in_background true, prompt: "Run the Bash command sleep 200, then reply DONE. Your final message is your report; do not use SendMessage." Then stop it with the TaskStop tool. Write $o/taskstop.txt containing the text TaskStop returned.
3. Write $o/before-changed.txt containing X. Run the Bash command: sh $skill/beat.sh changed $ledger/op2.stretch
   Then write $o/after-changed.txt containing the word RAN and any error text the command returned.
4. Call SendMessage to the name drill-$pid-nobody with the text "ping; reply if you exist". Write $o/sendfail.txt containing exactly the result or error text SendMessage returned.
5. Write $o/sleeping.txt containing X. Run the Bash command sleep 45 with run_in_background true. Then end your turn.
6. When a message from $cond2 arrives, write $o/msg-read.txt containing its text, then end your turn.
7. When the background sleep's exit wakes you, write $o/sleep-woke.txt containing WOKE, then end your turn.
PROMPT
env -C "$wtp" claude --bg -n "$op2" --model haiku --permission-mode acceptEdits --allowedTools="$op_tools" --add-dir="$ledger" "$(cat "$scratch/op2.txt")" >"$scratch/launch-$op2.log" 2>&1 </dev/null
( end=$(( $(date +%s) + 420 )); while [ "$(date +%s)" -lt "$end" ] && [ ! -s "$o/sleep-woke.txt" ]; do
    agent_field "$op2" status; agent_field "$op2" state; sleep 2; done ) | sort | uniq -c > "$scratch/op2-states.txt" &
sampler=$!
until_file "$o/sleeping.txt" 300 || fail "op2 never reached its background sleep (files: $(ls "$o" | tr '\n' ' '))"
if [ -s "$o/sleeping.txt" ]; then
  cat > "$scratch/cond2.txt" <<PROMPT
You are the session named $cond2. Call SendMessage to $op2 (by name), text exactly: "Write the word HEARD into msg-read.txt as your instructions say." Then end your turn.
PROMPT
  env -C "$wtp" claude --bg -n "$cond2" --model haiku --permission-mode acceptEdits --allowedTools="SendMessage" "$(cat "$scratch/cond2.txt")" >"$scratch/launch-$cond2.log" 2>&1 </dev/null
fi
until_file "$o/sleep-woke.txt" 180
until_file "$o/agent-result.txt" 30
wait "$sampler" 2>/dev/null
idle=$(agent_field "$op2" status)/$(agent_field "$op2" state)
op2id=$(agent_field "$op2" id)
observed "op2 session list status/state counts while working (2 s samples): $(tr '\n' ';' < "$scratch/op2-states.txt" | tr -s ' ')"
observed "op2 status/state once idle: $idle"
if grep -qw busy "$scratch/op2-states.txt"; then pass "the session list says busy while working (beat.sh looks for the word busy)"; else fail "the word busy never appeared in status/state while op2 worked; beat.sh's busy rule needs the word observed above"; fi
if [ -s "$o/agent-dispatched.txt" ] && grep -q LEAF "$o/agent-result.txt" 2>/dev/null; then pass "background Agent dispatch returned its id and then its result"
else fail "background Agent (dispatched: $(cat "$o/agent-dispatched.txt" 2>/dev/null); result: $(cat "$o/agent-result.txt" 2>/dev/null))"; fi
observed "TaskStop result: $(head -c 160 "$o/taskstop.txt" 2>/dev/null | tr '\n' ' ')"
[ -s "$o/taskstop.txt" ] && ! grep -qi -e 'error' -e 'not found' -e 'denied' "$o/taskstop.txt" && pass "TaskStop stopped a background child" || fail "TaskStop (see OBSERVED)"
if [ -s "$o/before-changed.txt" ] && [ -s "$o/after-changed.txt" ]; then
  dt=$(( $(mt "$o/after-changed.txt") - $(mt "$o/before-changed.txt") ))
  observed "beat.sh changed: ${dt}s between the files around it; said: $(head -c 120 "$o/after-changed.txt" | tr '\n' ' ')"
  [ "$dt" -lt 60 ] && pass "beat.sh changed ran without a permission stall (${dt}s)" || fail "beat.sh changed took ${dt}s (a stall is ~120 s)"
else fail "beat.sh changed step not reached"; fi
observed "SendMessage to a missing name returned: $(head -c 200 "$o/sendfail.txt" 2>/dev/null | tr '\n' ' ')"
[ -s "$o/sendfail.txt" ] && pass "SendMessage to a missing name reported something (see OBSERVED)" || fail "SendMessage to a missing name: nothing recorded"
if [ -s "$o/sleep-woke.txt" ]; then pass "a background sleep's exit woke the operator"; else fail "background sleep exit did not wake the operator"; fi
if [ -s "$o/msg-read.txt" ] && [ -s "$o/sleep-woke.txt" ] && [ "$(mt "$o/msg-read.txt")" -le "$(mt "$o/sleep-woke.txt")" ]; then
  pass "a message was read while the background sleep ran ($(( $(mt "$o/msg-read.txt") - $(mt "$o/sleeping.txt") ))s after the stretch began)"
else fail "message during the stretch (msg-read: $(cat "$o/msg-read.txt" 2>/dev/null); woke: $(cat "$o/sleep-woke.txt" 2>/dev/null))"; fi

# --- stop ---
claude stop "$op" >"$scratch/stop-op.log" 2>&1; echo "INFO stop by name ($op): exit $? $(head -c 120 "$scratch/stop-op.log")"
for id in $(drill_ids); do claude stop "$id" >/dev/null 2>&1; done
sleep 2
if [ -z "$(drill_ids)" ]; then pass stop; else fail "stop (still listed: $(drill_ids))"; fi
# 1b. Is a stopped session still listed, and with what status? (beat.sh reads "absent" as dead.)
observed "stopped sessions still listed: $(claude agents --json 2>/dev/null | python3 -c '
import json,sys
p=sys.argv[1]; m=[(a.get("name"),a.get("status"),a.get("state")) for a in json.load(sys.stdin) if (a.get("name") or "").startswith(p)]
print(m if m else "none")' "drill-$pid-")"
# 2b. claude logs on a stopped --bg session (the rung-2 investigation reads it).
if [ -n "${op2id:-}" ]; then
  sh "$fast" "$ledger" fork logs-stopped claude logs "$op2id" >"$scratch/logs-stopped.out" 2>&1; rc=$?
  observed "claude logs <stopped short id>: exit $rc, $(wc -l < "$scratch/logs-stopped.out" | tr -d ' ') lines, first: $(head -c 100 "$scratch/logs-stopped.out" | tr '\n' ' ')"
  if [ -s "$scratch/logs-stopped.out" ] && { [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; }; then pass "logs of a stopped session"
  else fail "logs of a stopped session (exit $rc; the investigation then falls back to the worktree)"; fi
fi

echo "DRILL-EXIT: $([ "$fails" -eq 0 ] && echo 0 || echo 1)"
[ "$fails" -eq 0 ]
