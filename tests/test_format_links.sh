#!/bin/sh
# Each plugin that writes the HTML spec format holds a git symlink to the one
# copy of docs/spec-format.md. Arguments are link:target pairs, paths relative to
# the repo root; with none, the default pairs below are checked.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "FAIL: $1"; exit 1; }
real() { python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
if [ "$#" -eq 0 ]; then
  set -- plugins/supersonic/skills/supercomposer/spec-format.md:docs/spec-format.md \
    plugins/superpowers-html/hooks/run-hook.cmd:plugins/superpowers-jev/hooks/run-hook.cmd
fi
for pair in "$@"; do
  link="${pair%%:*}"
  target="${pair#*:}"
  test -L "$root/$link" || fail "$link is not a symlink"
  [ "$(real "$root/$link")" = "$(real "$root/$target")" ] || fail "$link does not resolve to $target"
  mode=$(git -C "$root" ls-files -s "$link" | cut -c1-6)
  [ "$mode" = "120000" ] || fail "$link must be committed as a symlink (120000), got '$mode'"
done
echo "PASS: format links"
