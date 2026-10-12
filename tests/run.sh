#!/bin/sh
# Run every test: sh tests, then the python suite. Exit non-zero if any fails.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
status=0
for t in "$root"/tests/test_*.sh; do
  [ -f "$t" ] || continue
  sh "$t" || status=1
done
if [ -d "$root/tests/jev" ]; then
  python3 -m unittest discover -s "$root/tests/jev" -t "$root/tests/jev" || status=1
fi
exit $status
