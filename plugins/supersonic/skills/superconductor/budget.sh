#!/bin/sh
# budget.sh — superconductor budget band reader. The thresholds below are the
# single source the skill quotes.
# Usage: budget.sh [rate-limits.json]
# Prints DATA/FIVE_HOUR/SEVEN_DAY lines and ends with one "BAND:" line.
# Exits 0 whenever it prints a band; missing/malformed/stale input is middle.
set -eu
LOWER=70
UPPER=90
N=2
limits="${1:-$HOME/.claude/rate-limits.json}"

band() { echo "BAND: $1 — $2"; exit 0; }

[ -f "$limits" ] || { echo "DATA: no data ($limits missing)"; band middle "no data; $limits missing"; }

now=$(date +%s)
mtime=$(stat -f %m "$limits" 2>/dev/null || stat -c %Y "$limits")
age_min=$(( (now - mtime) / 60 ))

# Extract "<window>":{...} then a numeric key from it. No jq dependency.
win() { sed -n "s/.*\"$1\":{\([^}]*\)}.*/\1/p" "$limits"; }
val() { printf '%s' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"; }

five="$(win five_hour)"; seven="$(win seven_day)"
f_used="$(val "$five" used_percentage)"; f_reset="$(val "$five" resets_at)"
s_used="$(val "$seven" used_percentage)"; s_reset="$(val "$seven" resets_at)"

local_time() { date -r "$1" '+%a %H:%M' 2>/dev/null || date -d "@$1" '+%a %H:%M'; }
until_h() { d=$(( $1 - now )); [ "$d" -lt 0 ] && d=0; printf '%dh%02dm' $((d/3600)) $((d%3600/60)); }
note() { [ "$1" -lt "$now" ] && printf ' (reset elapsed — data predates reset)'; return 0; }

stale=''; [ "$age_min" -gt 30 ] && stale=" — STALE"
echo "DATA: ${age_min}m old${stale}"

usage=''
report() { # report <LABEL> <used> <reset>
  if [ -n "$2" ] && [ -n "$3" ]; then
    echo "$1: used ${2}% — resets $(local_time "$3") (in $(until_h "$3"))$(note "$3")"
    if [ "$3" -ge "$now" ] && { [ -z "$usage" ] || [ "$2" -gt "$usage" ]; }; then usage="$2"; fi
  else
    echo "$1: NO DATA (window absent or null — likely just reset)"
  fi
}
report FIVE_HOUR "$f_used" "$f_reset"
report SEVEN_DAY "$s_used" "$s_reset"

[ "$age_min" -gt 30 ] && band middle "data stale (${age_min}m old, >30m)"
[ -n "$usage" ] || band middle "no live window carries numbers"
if [ "$usage" -lt "$LOWER" ]; then band low "max usage ${usage}% < ${LOWER}%"
elif [ "$usage" -ge "$UPPER" ]; then band high "max usage ${usage}% >= ${UPPER}%"
else band middle "max usage ${usage}% in ${LOWER}-${UPPER}%"
fi
