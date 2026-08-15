#!/bin/sh
# budget.sh — superconductor budget reader (budget-throttle spec §1).
# Usage: budget.sh [rate-limits.json] [reserves.json]
# Exit 0: report printed. Exit 2: missing or malformed input.
set -eu
limits="${1:-$HOME/.claude/rate-limits.json}"
reserves="${2:-$HOME/.claude/superconductor-reserves.json}"

[ -f "$limits" ] || { echo "BUDGET: no data — $limits missing (statusline writes it on render)"; exit 2; }

now=$(date +%s)
mtime=$(stat -f %m "$limits" 2>/dev/null || stat -c %Y "$limits")
age_min=$(( (now - mtime) / 60 ))

# Extract "<window>":{...} then a numeric key from it. Order-independent
# within the object; no jq dependency.
win() { sed -n "s/.*\"$1\":{\([^}]*\)}.*/\1/p" "$limits"; }
val() { printf '%s' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"; }

five="$(win five_hour)"; seven="$(win seven_day)"
f_used="$(val "$five" used_percentage)"; f_reset="$(val "$five" resets_at)"
s_used="$(val "$seven" used_percentage)"; s_reset="$(val "$seven" resets_at)"
[ -n "$f_used" ] && [ -n "$f_reset" ] && [ -n "$s_used" ] && [ -n "$s_reset" ] \
  || { echo "BUDGET: malformed $limits"; exit 2; }

# Reserve ceilings: partner-declared, defaults 80/60.
# Tolerates optional whitespace after the colon so a hand-written, pretty-printed
# reserves file (the natural form for a partner-owned file) still parses.
f_res=80; s_res=60
if [ -f "$reserves" ]; then
  r="$(cat "$reserves")"
  f_parsed="$(printf '%s' "$r" | sed -n 's/.*"five_hour":[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
  s_parsed="$(printf '%s' "$r" | sed -n 's/.*"seven_day":[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
  if [ -z "$f_parsed" ] && [ -z "$s_parsed" ]; then
    echo "BUDGET: warning — $reserves unreadable, using default reserves (80/60)" >&2
  fi
  f_res="${f_parsed:-80}"
  s_res="${s_parsed:-60}"
fi

local_time() { date -r "$1" '+%a %H:%M' 2>/dev/null || date -d "@$1" '+%a %H:%M'; }
until_h() { d=$(( $1 - now )); [ "$d" -lt 0 ] && d=0; printf '%dh%02dm' $((d/3600)) $((d%3600/60)); }

note() { [ "$1" -lt "$now" ] && printf ' (reset elapsed — data predates reset; refresh via any statusline render)'; }
stale=''; [ "$age_min" -gt 30 ] && stale=" — STALE"
stale_verdict=''
[ "$age_min" -gt 30 ] && stale_verdict=' — STALE (>30m): confirm with your partner before acting'
echo "DATA: ${age_min}m old${stale}"
echo "FIVE_HOUR: used ${f_used}% of ${f_res}% reserve — headroom $((f_res - f_used)) — resets $(local_time "$f_reset") (in $(until_h "$f_reset"))$(note "$f_reset")"
echo "SEVEN_DAY: used ${s_used}% of ${s_res}% reserve — headroom $((s_res - s_used)) — resets $(local_time "$s_reset") (in $(until_h "$s_reset"))$(note "$s_reset")"

if [ "$s_used" -ge "$s_res" ] && [ "$s_reset" -ge "$now" ]; then
  echo "VERDICT: STOP (seven_day at/over reserve) — admit nothing; resume after $(local_time "$s_reset")${stale_verdict}"
elif [ "$f_used" -ge "$f_res" ] && [ "$f_reset" -ge "$now" ]; then
  echo "VERDICT: HOLD (five_hour at/over reserve) — pause the wave until $(local_time "$f_reset")${stale_verdict}"
else
  echo "VERDICT: OK — admit within headroom${stale_verdict}"
fi
