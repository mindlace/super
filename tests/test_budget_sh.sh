#!/bin/sh
# tests/test_budget_sh.sh — fixture tests for the budget band reader.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
b="$root/plugins/supersonic/skills/superconductor/budget.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
now=$(date +%s)

mk() { # mk <file> <5used> <5reset> <7used> <7reset>
  printf '{"five_hour":{"used_percentage":%s,"resets_at":%s},"seven_day":{"used_percentage":%s,"resets_at":%s}}' \
    "$2" "$3" "$4" "$5" > "$tmp/$1"
}

fail() { echo "FAIL: $1"; exit 1; }

# 1. fresh 24/76 -> middle (max 76), exit 0
mk mid.json 24 $((now+3600)) 76 $((now+86400))
out=$(sh "$b" "$tmp/mid.json") || fail "mid fixture exited non-zero"
echo "$out" | grep -q '^BAND: middle' || fail "expected middle band, got: $out"
echo "$out" | grep -q '^FIVE_HOUR: used 24%' || fail "five_hour line wrong: $out"
echo "$out" | grep -q '^SEVEN_DAY: used 76%' || fail "seven_day line wrong: $out"
echo "$out" | grep -q '^DATA: ' || fail "missing DATA line: $out"
[ "$(echo "$out" | tail -n 1 | cut -c1-5)" = "BAND:" ] || fail "BAND must be the last line: $out"
[ "$(echo "$out" | grep -c '^BAND:')" -eq 1 ] || fail "expected exactly one BAND line: $out"

# 2. 10/20 -> low
mk low.json 10 $((now+3600)) 20 $((now+86400))
sh "$b" "$tmp/low.json" | grep -q '^BAND: low' || fail "expected low band"

# 3. 92/10 -> high (five_hour drives it)
mk high.json 92 $((now+3600)) 10 $((now+86400))
sh "$b" "$tmp/high.json" | grep -q '^BAND: high' || fail "expected high band"

# 4. missing file -> middle, exit 0
rc=0; out=$(sh "$b" "$tmp/missing.json") || rc=$?
[ "$rc" -eq 0 ] || fail "missing file must exit 0, got $rc"
echo "$out" | grep -q '^BAND: middle' || fail "missing file should be middle: $out"

# 5. 40-minute-old 10/10 -> middle, reason mentions stale
mk stale.json 10 $((now+3600)) 10 $((now+86400))
old=$(( now - 2400 ))
if touch -d "@$old" "$tmp/stale.json" 2>/dev/null; then :; else
  touch -t "$(date -r "$old" +%Y%m%d%H%M.%S)" "$tmp/stale.json"
fi
out=$(sh "$b" "$tmp/stale.json")
echo "$out" | grep '^BAND: middle' | grep -q 'stale' || fail "expected middle with stale reason: $out"

# 6. five_hour 95 with elapsed reset ignored; seven_day 20 -> low
mk elapsed.json 95 $((now-60)) 20 $((now+86400))
out=$(sh "$b" "$tmp/elapsed.json")
echo "$out" | grep -q '^BAND: low' || fail "elapsed window must be ignored (expected low): $out"

# 7. both windows null -> middle
printf '{"five_hour":{"used_percentage":null,"resets_at":null},"seven_day":{"used_percentage":null,"resets_at":null}}' > "$tmp/null.json"
rc=0; out=$(sh "$b" "$tmp/null.json") || rc=$?
[ "$rc" -eq 0 ] || fail "null fixture must exit 0, got $rc"
echo "$out" | grep -q '^BAND: middle' || fail "null windows should be middle: $out"

# 8. output never contains VERDICT or reserve
for f in mid low high stale elapsed null; do
  if sh "$b" "$tmp/$f.json" | grep -qi -e VERDICT -e reserve; then fail "$f output mentions VERDICT/reserve"; fi
done

# 9. thresholds defined once, in the first 15 lines
[ "$(head -n 15 "$b" | grep -c -e '^LOWER=70$' -e '^UPPER=90$' -e '^N=2$')" -eq 3 ] || fail "LOWER/UPPER/N must be defined in the first 15 lines"

echo "PASS: budget.sh"
