#!/bin/sh
# tests/test_budget_sh.sh — fixture tests for the budget reader.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
b="$root/home/dot_claude/skills/superconductor/executable_budget.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
now=$(date +%s)

mk() { # mk <file> <5used> <5reset> <7used> <7reset>
  printf '{"five_hour":{"used_percentage":%s,"resets_at":%s},"seven_day":{"used_percentage":%s,"resets_at":%s}}' \
    "$2" "$3" "$4" "$5" > "$tmp/$1"
}
res() { printf '{"five_hour":%s,"seven_day":%s}' "$1" "$2" > "$tmp/reserves.json"; }

fail() { echo "FAIL: $1"; exit 1; }

# 1. fresh + under both ceilings -> OK, exit 0
mk ok.json 24 $((now+3600)) 76 $((now+86400)); res 60 85
out=$(sh "$b" "$tmp/ok.json" "$tmp/reserves.json") || fail "ok fixture exited non-zero"
echo "$out" | grep -q 'VERDICT: OK' || fail "expected OK verdict, got: $out"
echo "$out" | grep -q 'FIVE_HOUR: used 24% .*headroom 36' || fail "five_hour line wrong: $out"
echo "$out" | grep -q 'SEVEN_DAY: used 76% .*headroom 9'  || fail "seven_day line wrong: $out"

# 2. five_hour at ceiling -> HOLD
mk hold.json 60 $((now+1800)) 10 $((now+86400)); res 60 85
sh "$b" "$tmp/hold.json" "$tmp/reserves.json" | grep -q 'VERDICT: HOLD (five_hour' || fail "expected HOLD at five_hour ceiling"

# 3. seven_day over ceiling -> STOP (takes precedence over a five_hour hold)
mk stop.json 90 $((now+1800)) 92 $((now+86400)); res 60 85
sh "$b" "$tmp/stop.json" "$tmp/reserves.json" | grep -q 'VERDICT: STOP (seven_day' || fail "expected STOP at seven_day ceiling"

# 4. defaults apply when the reserves file is absent
mk def.json 59 $((now+3600)) 84 $((now+86400))
sh "$b" "$tmp/def.json" "$tmp/nonexistent.json" | grep -q 'VERDICT: OK' || fail "defaults (60/85) should admit 59/84"

# 5. stale data (>30m) is reported
mk stale.json 10 $((now+3600)) 10 $((now+86400)); res 60 85
old=$(( (now - 2400) ))
if touch -d "@$old" "$tmp/stale.json" 2>/dev/null; then :; else
  touch -t "$(date -r "$old" +%Y%m%d%H%M.%S)" "$tmp/stale.json"
fi
sh "$b" "$tmp/stale.json" "$tmp/reserves.json" | grep -q 'STALE' || fail "expected STALE marker on 40m-old data"

# 6. reset already elapsed is called out, not treated as live usage
mk elapsed.json 90 $((now-60)) 10 $((now+86400)); res 60 85
sh "$b" "$tmp/elapsed.json" "$tmp/reserves.json" | grep -q 'reset elapsed' || fail "expected reset-elapsed note"

# 7. missing file -> exit 2
rc=0; sh "$b" "$tmp/missing.json" "$tmp/reserves.json" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "missing file must exit 2, got $rc"

# 8. malformed file -> exit 2
echo '{"nope":true}' > "$tmp/bad.json"
rc=0; sh "$b" "$tmp/bad.json" "$tmp/reserves.json" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "malformed file must exit 2, got $rc"

echo "PASS: budget.sh"
