#!/bin/sh
# records.sh — where a superconductor run keeps its records (ledger, assignments, prompts,
# surveys), outside the project repository. Stock macOS: sh + perl.
#
# Path rule: <home>/superconductor/<key>/<design-slug>, where <home> is $SUPERSONIC_HOME or,
# when unset, $HOME/.supersonic, and <key> is the repository's main checkout path (the git
# common dir minus a trailing /.git; as it is when it does not end in /.git) with every
# character outside A-Za-z0-9 replaced by "-". Every worktree of a repository shares the key.
#
# Usage (run inside the repository's main checkout or any of its worktrees, except check):
#   records.sh <design-slug>          create the records directory, print its absolute path
#   records.sh migrate <design-slug>  move an old <main checkout>/.superpowers/superconductor/<slug>
#                                     into the records directory (once); prints one line, or
#                                     nothing when there is nothing to migrate
#   records.sh check                  print home:, settings: and covered: yes|no (whether
#                                     permissions.additionalDirectories reaches the home)
set -u

usage() { echo "usage: records.sh <design-slug> | migrate <design-slug> | check" >&2; exit 2; }

home_dir() {
  h=${SUPERSONIC_HOME:-$HOME/.supersonic}
  while [ "${h%/}" != "$h" ]; do h=${h%/}; done
  printf '%s\n' "$h"
}

valid_slug() { printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$'; }

# Sets main (the main checkout) and rdir (the records directory), or exits 1.
resolve() {
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || {
    echo "records.sh: not in a git repository" >&2; exit 1; }
  case "$common" in */.git) main=${common%/.git} ;; *) main=$common ;; esac
  key=$(printf '%s' "$main" | sed 's/[^A-Za-z0-9]/-/g')
  rdir="$(home_dir)/superconductor/$key/$1"
}

case "${1:-}" in
check)
  [ $# -eq 1 ] || usage
  home=$(home_dir)
  settings=${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/settings.json}
  : "${settings:=$HOME/.claude/settings.json}"
  echo "home: $home"
  echo "settings: $settings"
  covered=$(perl -MJSON::PP -e '
    my ($file, $home, $user) = @ARGV;
    open my $fh, "<", $file or do { print "no"; exit };
    local $/; my $d = eval { decode_json(<$fh>) };
    my $l = ref $d eq "HASH" && ref $d->{permissions} eq "HASH" ? $d->{permissions}{additionalDirectories} : undef;
    if (ref $l eq "ARRAY") {
      for my $e (@$l) {
        next if ref $e;
        $e =~ s{^~(?=/|$)}{$user};
        $e =~ s{/+$}{};
        if ($e eq $home or index($home, "$e/") == 0) { print "yes"; exit }
      }
    }
    print "no";
  ' "$settings" "$home" "$HOME" 2>/dev/null) || covered=no
  echo "covered: ${covered:-no}"
  ;;
migrate)
  [ $# -eq 2 ] && valid_slug "$2" || usage
  resolve "$2"
  old="$main/.superpowers/superconductor/$2"
  [ ! -f "$rdir/ledger.md" ] && [ -f "$old/ledger.md" ] || exit 0
  mkdir -p "$rdir" && cp -R "$old/." "$rdir/" || { echo "records.sh: copy failed" >&2; exit 1; }
  for f in "$rdir/ledger.md" "$rdir"/assignments/*.md; do
    [ -f "$f" ] || continue
    OLD=$old NEW=$rdir perl -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$f"
  done
  tracked=$(git -C "$main" ls-files -- ".superpowers/superconductor/$2")
  n=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$((n + 1))
    rel=${f#.superpowers/superconductor/$2/}
    if ! printf '%s\n' "$tracked" | grep -Fxq -- "$f"; then rm -f "$old/$rel"; fi
  done <<EOF
$(cd "$old" && find . -type f | sed 's|^\./|.superpowers/superconductor/'"$2"'/|')
EOF
  find "$old" -depth -type d -empty -delete 2>/dev/null
  left=$(find "$old" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "migrated $n files from $old; $left tracked left"
  ;;
*)
  [ $# -eq 1 ] && valid_slug "$1" || usage
  resolve "$1"
  mkdir -p "$rdir" || exit 1
  echo "$rdir"
  ;;
esac
