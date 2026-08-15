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
if echo "$out" | grep -q 'STALE'; then fail "fresh fixture unexpectedly flagged STALE: $out"; fi

# 2. five_hour at ceiling -> HOLD
mk hold.json 60 $((now+1800)) 10 $((now+86400)); res 60 85
sh "$b" "$tmp/hold.json" "$tmp/reserves.json" | grep -q 'VERDICT: HOLD (five_hour' || fail "expected HOLD at five_hour ceiling"

# 3. seven_day over ceiling -> STOP (takes precedence over a five_hour hold)
mk stop.json 90 $((now+1800)) 92 $((now+86400)); res 60 85
sh "$b" "$tmp/stop.json" "$tmp/reserves.json" | grep -q 'VERDICT: STOP (seven_day' || fail "expected STOP at seven_day ceiling"

# 4. defaults apply when the reserves file is absent
mk def.json 59 $((now+3600)) 84 $((now+86400))
sh "$b" "$tmp/def.json" "$tmp/nonexistent.json" | grep -q 'VERDICT: OK' || fail "defaults (60/85) should admit 59/84"

# 5. stale data (>30m) is reported, including on the VERDICT line itself
mk stale.json 10 $((now+3600)) 10 $((now+86400)); res 60 85
old=$(( (now - 2400) ))
if touch -d "@$old" "$tmp/stale.json" 2>/dev/null; then :; else
  touch -t "$(date -r "$old" +%Y%m%d%H%M.%S)" "$tmp/stale.json"
fi
out=$(sh "$b" "$tmp/stale.json" "$tmp/reserves.json")
echo "$out" | grep -q 'STALE' || fail "expected STALE marker on 40m-old data"
echo "$out" | grep -q 'VERDICT: OK.*STALE (>30m)' || fail "expected staleness marker appended to VERDICT line: $out"

# 6. reset already elapsed is called out, not treated as live usage, and does
#    not spuriously trigger HOLD (the elapsed reset must be suppressed).
mk elapsed.json 90 $((now-60)) 10 $((now+86400)); res 60 85
out=$(sh "$b" "$tmp/elapsed.json" "$tmp/reserves.json")
echo "$out" | grep -q 'reset elapsed' || fail "expected reset-elapsed note"
echo "$out" | grep -q 'VERDICT: OK' || fail "expected OK verdict despite elapsed five_hour reset (suppressed HOLD): $out"

# 6b. declared reserves are honored: a tighter five_hour ceiling flips OK -> HOLD
mk tight5.json 55 $((now+3600)) 40 $((now+86400)); res 50 70
out=$(sh "$b" "$tmp/tight5.json" "$tmp/reserves.json")
echo "$out" | grep -q 'FIVE_HOUR: used 55% of 50% reserve' || fail "declared five_hour reserve not honored: $out"
echo "$out" | grep -q 'VERDICT: HOLD (five_hour' || fail "expected HOLD under tighter declared five_hour ceiling: $out"

# 6c. declared reserves are honored: a tighter seven_day ceiling flips OK -> STOP
mk tight7.json 10 $((now+3600)) 65 $((now+86400)); res 60 60
out=$(sh "$b" "$tmp/tight7.json" "$tmp/reserves.json")
echo "$out" | grep -q 'SEVEN_DAY: used 65% of 60% reserve' || fail "declared seven_day reserve not honored: $out"
echo "$out" | grep -q 'VERDICT: STOP (seven_day' || fail "expected STOP under tighter declared seven_day ceiling: $out"

# 6d. pretty-printed reserves file (whitespace after colon) is parsed, not
#     silently defaulted
printf '{\n  "five_hour": 30,\n  "seven_day": 40\n}\n' > "$tmp/pretty_reserves.json"
mk pretty.json 35 $((now+3600)) 20 $((now+86400))
out=$(sh "$b" "$tmp/pretty.json" "$tmp/pretty_reserves.json")
echo "$out" | grep -q 'FIVE_HOUR: used 35% of 30% reserve' || fail "pretty-printed reserves not honored: $out"
echo "$out" | grep -q 'VERDICT: HOLD (five_hour' || fail "expected HOLD under pretty-printed declared reserves: $out"

# 6e. reserves file present but unparseable -> warns on stderr, falls back to 60/85
printf 'not json at all\n' > "$tmp/garbage_reserves.json"
mk garbage.json 59 $((now+3600)) 84 $((now+86400))
err=$(sh "$b" "$tmp/garbage.json" "$tmp/garbage_reserves.json" 2>&1 >/dev/null)
echo "$err" | grep -qi 'unreadable' || fail "expected a stderr warning for an unparseable reserves file: $err"
out=$(sh "$b" "$tmp/garbage.json" "$tmp/garbage_reserves.json" 2>/dev/null)
echo "$out" | grep -q 'FIVE_HOUR: used 59% of 60% reserve' || fail "garbage reserves file should fall back to default 60: $out"

# 6f. reserves file absent -> defaults apply with no warning
mk noreserves.json 59 $((now+3600)) 84 $((now+86400))
err=$(sh "$b" "$tmp/noreserves.json" "$tmp/nonexistent.json" 2>&1 >/dev/null)
[ -z "$err" ] || fail "absent reserves file must not warn: $err"

# 7. missing file -> exit 2
rc=0; sh "$b" "$tmp/missing.json" "$tmp/reserves.json" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "missing file must exit 2, got $rc"

# 8. malformed file -> exit 2
echo '{"nope":true}' > "$tmp/bad.json"
rc=0; sh "$b" "$tmp/bad.json" "$tmp/reserves.json" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "malformed file must exit 2, got $rc"

echo "PASS: budget.sh"
