#!/bin/sh
# Run every test: sh tests, the python suite, then the reader tests. Exit non-zero if any fails.
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
if [ -d "$root/tests/html" ]; then
  python3 -m unittest discover -s "$root/tests/html" -t "$root/tests/html" || status=1
fi
if command -v node >/dev/null 2>&1; then
  node --test "$root"/tests/reader/*.test.mjs || status=1
else
  echo "SKIP: reader tests (node not on PATH)"
fi
if command -v claude >/dev/null 2>&1; then
  claude plugin test "$root/plugins/superpowers-reader" || status=1
else
  echo "SKIP: reader hooks-module tests (claude not on PATH)"
fi
exit $status
