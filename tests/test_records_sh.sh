#!/bin/sh
# tests/test_records_sh.sh — fixture tests for the records-directory script. HOME and
# SUPERSONIC_HOME always point into the fixture, never the real home. The fixture repo's path
# has a space and a dot in it.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/plugins/supersonic/skills/superconductor/records.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/records-test.XXXXXX") || exit 1
trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
fail() { echo "FAIL: records.sh: $1"; exit 1; }

[ -f "$src" ] || fail "script missing: $src"
sh -n "$src" || fail "sh -n"

export HOME="$tmp/home"; mkdir -p "$HOME"
unset CLAUDE_CONFIG_DIR
export SUPERSONIC_HOME="$tmp/h"
r() { sh "$src" "$@"; }

main="$tmp/my proj.x"; pkg="$main/.claude/worktrees/pkg"; unit="$pkg/.claude/worktrees/unit"
git init -q "$main"
git -C "$main" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$main" worktree add -q "$pkg" -b pkg
git -C "$pkg" worktree add -q "$unit" -b unit

common=$(git -C "$main" rev-parse --path-format=absolute --git-common-dir)
key=$(printf '%s' "${common%/.git}" | sed 's/[^A-Za-z0-9]/-/g')

# --- encoding ---
out=$(cd "$main" && r des) || fail "records des from main exited $?"
[ "$out" = "$tmp/h/superconductor/$key/des" ] || fail "encoding: got '$out'"
[ -d "$out" ] || fail "records dir not created"
printf '%s' "$key" | grep -Eq '^-[A-Za-z0-9-]*$' || fail "key shape: $key"

# --- shared key ---
o2=$(cd "$pkg" && r des) || fail "from pkg"
o3=$(cd "$unit" && r des) || fail "from unit"
[ "$o2" = "$out" ] || fail "pkg key differs: $o2"
[ "$o3" = "$out" ] || fail "unit key differs: $o3"

# --- default home ---
o4=$(cd "$main" && env -u SUPERSONIC_HOME HOME="$tmp/home" sh "$src" des) || fail "default home"
case "$o4" in "$tmp/home/.supersonic/superconductor/"*) ;; *) fail "default home: $o4";; esac

# --- bad input ---
rm -rf "$tmp/h"
for s in '' a/b ..; do
  (cd "$main" && r "$s") >/dev/null 2>&1; rc=$?
  [ "$rc" = 2 ] || fail "slug '$s' exit $rc, want 2"
done
[ ! -e "$tmp/h" ] || fail "bad slugs created $tmp/h"
(cd "$tmp" && r des) >/dev/null 2>"$tmp/err"; rc=$?
[ "$rc" = 1 ] || fail "outside repo exit $rc, want 1"
grep -q 'records.sh: not in a git repository' "$tmp/err" || fail "outside repo message"

# --- migrate ---
old="${common%/.git}/.superpowers/superconductor/des"
mkdir -p "$old/assignments" "$old/prompts" "$old/surveys"
echo c > "$old/surveys/café.md"
echo "dir $old here" > "$old/ledger.md"
printf -- '- Ledger: %s/ledger.md\n' "$old" > "$old/assignments/u.md"
echo p > "$old/prompts/p.md"
echo s > "$old/surveys/s.md"
git -C "$main" add -f ".superpowers/superconductor/des/surveys/s.md" ".superpowers/superconductor/des/surveys/café.md"
git -C "$main" -c user.name=t -c user.email=t@t commit -q -m survey
new="$tmp/h/superconductor/$key/des"
m=$(cd "$pkg" && r migrate des) || fail "migrate exit"
[ "$m" = "migrated 5 files from $old; 2 tracked left" ] || fail "migrate line: '$m'"
for f in ledger.md assignments/u.md prompts/p.md surveys/s.md surveys/café.md; do
  [ -f "$new/$f" ] || fail "migrated $f missing"
done
grep -qF "$new" "$new/ledger.md" && ! grep -qF "$old" "$new/ledger.md" || fail "ledger path not rewritten"
grep -qF "$new/ledger.md" "$new/assignments/u.md" && ! grep -qF "$old" "$new/assignments/u.md" || fail "assignment path not rewritten"
[ -f "$old/surveys/s.md" ] || fail "tracked file removed from old"
[ -f "$old/surveys/café.md" ] || fail "tracked non-ASCII file removed from old"
[ ! -e "$old/prompts" ] || fail "prompts/ remains"
[ ! -e "$old/ledger.md" ] || fail "old ledger remains"
m2=$(cd "$pkg" && r migrate des); [ -z "$m2" ] || fail "second migrate printed '$m2'"
m3=$(cd "$pkg" && r migrate other); [ -z "$m3" ] || fail "migrate other printed '$m3'"

# failed rewrite: nothing is deleted, exit 1, the half copy is dropped
oldb="${common%/.git}/.superpowers/superconductor/bad"
mkdir -p "$oldb/assignments"
echo x > "$oldb/ledger.md"; echo y > "$oldb/assignments/u.md"
chmod 0444 "$oldb/assignments/u.md"
(cd "$pkg" && r migrate bad) >/dev/null 2>&1; rc=$?
chmod 0644 "$oldb/assignments/u.md"
[ "$rc" != 0 ] || fail "failed rewrite exited 0"
[ -f "$oldb/ledger.md" ] && [ -f "$oldb/assignments/u.md" ] || fail "failed rewrite deleted originals"
[ ! -e "$tmp/h/superconductor/$key/bad" ] || fail "failed rewrite left the copy"

# failed copy: an unreadable file in the old dir; nothing is deleted, exit 1, the partial copy is dropped
oldc="${common%/.git}/.superpowers/superconductor/cp"
mkdir -p "$oldc"
echo x > "$oldc/ledger.md"; echo y > "$oldc/secret.md"
chmod 0000 "$oldc/secret.md"
(cd "$pkg" && r migrate cp) >/dev/null 2>&1; rc=$?
chmod 0644 "$oldc/secret.md"
[ "$rc" != 0 ] || fail "failed copy exited 0"
[ -f "$oldc/ledger.md" ] && [ -f "$oldc/secret.md" ] || fail "failed copy deleted originals"
[ ! -e "$tmp/h/superconductor/$key/cp" ] || fail "failed copy left the partial copy"

# relative SUPERSONIC_HOME is rejected by every command, creating nothing
for w in "$main" "$pkg"; do
  for c in des "migrate des" check; do
    (cd "$w" && SUPERSONIC_HOME=rel sh "$src" $c) >/dev/null 2>"$tmp/err"; rc=$?
    [ "$rc" = 2 ] || fail "relative home '$c' exit $rc, want 2"
    grep -q 'SUPERSONIC_HOME must be an absolute path' "$tmp/err" || fail "relative home message for '$c'"
  done
  [ ! -e "$w/rel" ] || fail "relative home created $w/rel"
done

# --- check ---
settings="$HOME/.claude/settings.json"
c=$(cd "$tmp" && sh "$src" check) || fail "check exit"
printf '%s\n' "$c" | grep -qx "home: $tmp/h" || fail "check home line: $c"
printf '%s\n' "$c" | grep -qx "settings: $settings" || fail "check settings line: $c"
printf '%s\n' "$c" | grep -qx 'covered: no' || fail "no settings should be no: $c"
mkdir -p "$HOME/.claude"
want() { # json expected [env...]
  j=$1; e=$2; shift 2
  printf '%s' "$j" > "$settings"
  o=$(cd "$tmp" && "$@" sh "$src" check) || fail "check exit for $j"
  printf '%s\n' "$o" | grep -qx "covered: $e" || fail "settings $j: want $e, got: $o"
}
want '{"permissions":{"additionalDirectories":["~/.supersonic"]}}' yes env -u SUPERSONIC_HOME
want '{"permissions":{"additionalDirectories":["~"]}}' yes env -u SUPERSONIC_HOME
want '{"permissions":{"additionalDirectories":["~/.supersonic/"]}}' yes env -u SUPERSONIC_HOME
want '{"permissions":{"additionalDirectories":["~/.supersonic-old"]}}' no env -u SUPERSONIC_HOME
want '{"permissions":{}}' no env -u SUPERSONIC_HOME
want 'not json' no env -u SUPERSONIC_HOME
# CLAUDE_CONFIG_DIR: only that file counts
mkdir -p "$tmp/cfg"
printf '{"permissions":{"additionalDirectories":["~"]}}' > "$settings"
o=$(cd "$tmp" && env -u SUPERSONIC_HOME CLAUDE_CONFIG_DIR="$tmp/cfg" sh "$src" check)
printf '%s\n' "$o" | grep -qx "settings: $tmp/cfg/settings.json" || fail "cfg settings line: $o"
printf '%s\n' "$o" | grep -qx 'covered: no' || fail "cfg dir must not read home settings: $o"
printf '{"permissions":{"additionalDirectories":["~/.supersonic"]}}' > "$tmp/cfg/settings.json"
o=$(cd "$tmp" && env -u SUPERSONIC_HOME CLAUDE_CONFIG_DIR="$tmp/cfg" sh "$src" check)
printf '%s\n' "$o" | grep -qx 'covered: yes' || fail "cfg settings yes: $o"
# SUPERSONIC_HOME elsewhere
printf '{"permissions":{"additionalDirectories":["%s"]}}' "$tmp/elsewhere" > "$settings"
o=$(cd "$tmp" && SUPERSONIC_HOME="$tmp/elsewhere" sh "$src" check)
printf '%s\n' "$o" | grep -qx "home: $tmp/elsewhere" || fail "elsewhere home line: $o"
printf '%s\n' "$o" | grep -qx 'covered: yes' || fail "elsewhere covered: $o"

echo "PASS: records.sh"
