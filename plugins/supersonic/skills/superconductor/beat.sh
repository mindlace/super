#!/bin/sh
# beat.sh — the superconductor heartbeat's eyes and hands. The constants below are the
# single source the skill quotes. The report reads state and prints facts; it sends nothing
# and decides nothing the skill does not define here as arithmetic. Stock macOS: sh + perl.
#
# Usage (<dir> is the ledger dir, <project>/.superpowers/superconductor/<design-slug>):
#   beat.sh <dir>                       report: unit, row, transcript, fork, question and timer lines, then "beat:"
#   beat.sh <dir> seen <unit-slug>      progress seen (a message handled, a restart): rewrite its beat file
#   beat.sh <dir> asked <unit-slug>     a status ask was sent: record it
#   beat.sh <dir> launching <unit-slug> a first launch is ledgered: forget the last session's id
#   beat.sh <dir> launched <unit-slug>  after a launch: confirm its session is up over the whole
#                                       bounded wait and record its id; if it never appears or
#                                       fails, ledger `launch failed`
#   beat.sh <dir> relaunched <unit-slug> ledger a relaunch with a longer list
#   beat.sh <dir> resume                Phase 0: stop the old timer, restart every beat file, drop asks
#   beat.sh <dir> restart <unit> <cause>  ledger a restart; the script writes its rung and key
#   beat.sh <dir> wait <unit> <minutes> ledger a unit waiting for a usage reset that far ahead
#   beat.sh <dir> strays <unit>         list processes left running in the unit's worktree
#   beat.sh <dir> kill-strays <unit>    stop those whose command line contains the hung command
#                                       named in <dir>/assignments/<unit>.cause
#   beat.sh <dir> timer <seconds>       the heartbeat timer; run it in the background
#   beat.sh <dir> stop-timer            stop the timer, if one runs
#   beat.sh <dir> fork <name> <cmd>     run a fork under FORK_LIMIT in its own process group
#   beat.sh <dir> stop-fork <name>      stop a fork's process group (TERM, then KILL)
#   beat.sh <dir> stop <unit-slug> [failed]  stop every session listed under the unit's name
#                                       (only `failed` ones with `failed`), each by its own
#                                       short id; then look LAUNCH_TRIES times LAUNCH_WAIT apart
#                                       for them to leave the list, and report what is left
#   beat.sh changed <marker>            operator: print one file under the cwd changed since
#                                       <marker> (none: print nothing), then touch <marker>
set -u
BEAT=600
STALL_BEATS=1
FORK_LIMIT=2700
LAUNCH_TRIES=3
LAUNCH_WAIT=10
TAIL_LINES=200
TAIL_BYTES=65536

die() { echo "beat.sh: $*" >&2; exit 2; }
[ $# -ge 1 ] || die "usage: beat.sh <ledger dir> [command]"

if [ "$1" = changed ]; then
  [ $# -eq 2 ] || die "usage: beat.sh changed <marker>"
  m=$2
  if [ -f "$m" ]; then
    find . \( -name .git -o -name node_modules \) -prune -o -type f -newer "$m" -print -quit
  fi
  mkdir -p "$(dirname "$m")" && touch "$m"
  exit 0
fi

dir=$(cd "$1" 2>/dev/null && pwd -P) || die "no ledger dir: $1"
shift
self=$0
pl() { exec perl -x -MJSON::PP "$self" "$@"; }
# The package worktree's index lock, which a KILLed git commit leaves behind.
pkglock() {
  pkg=$(sed -n 's/^Package worktree: //p' "$dir/ledger.md" 2>/dev/null | head -n 1)
  [ -n "$pkg" ] && git -C "$pkg" rev-parse --path-format=absolute --git-path index.lock 2>/dev/null
}

case "${1:-report}" in
report)
  agents=$(claude agents --json 2>/dev/null) && sessions=ok || { agents=; sessions=unknown; }
  timer=none; deadline=-
  if [ -f "$dir/timer" ] && pgrep -F "$dir/timer" -x sleep >/dev/null 2>&1; then
    timer=running; deadline=$(cut -d' ' -f2 "$dir/timer")
  fi
  AGENTS=$agents SESSIONS=$sessions TAIL_LINES=$TAIL_LINES TAIL_BYTES=$TAIL_BYTES \
    pl report "$dir" "$BEAT" "$STALL_BEATS" "$timer" "$deadline" ;;
stop)
  [ $# -ge 2 ] || die "usage: beat.sh <dir> stop <unit-slug> [failed]"
  LAUNCH_TRIES=$LAUNCH_TRIES LAUNCH_WAIT=$LAUNCH_WAIT pl "$@" "$dir" ;;
seen|asked|restart|wait|strays|kill-strays|launching|relaunched)
  [ $# -ge 2 ] || die "usage: beat.sh <dir> $1 <unit-slug> ..."
  pl "$@" "$dir" ;;
launched)
  # Over LAUNCH_TRIES looks LAUNCH_WAIT seconds apart the session must be listed and alive at
  # the last look, and never `failed` (a session that cannot start is listed, then fails).
  # A session that never appears or fails is a failed start, ledgered so the ladder climbs.
  [ $# -eq 2 ] || die "usage: beat.sh <dir> launched <unit-slug>"
  i=1; rc=3
  while :; do
    if agents=$(claude agents --json 2>/dev/null); then
      AGENTS=$agents perl -x -MJSON::PP "$self" probe "$2" "$dir"; rc=$?
    else rc=2; fi
    [ "$rc" -eq 4 ] && break
    [ "$i" -ge "$LAUNCH_TRIES" ] && break
    i=$((i + 1)); sleep "$LAUNCH_WAIT"
  done
  [ "$rc" -eq 0 ] && AGENTS=$agents pl launched "$2" "$dir"
  [ "$rc" -eq 2 ] && die "the session list is unreadable; run launched again later"
  pl launch-failed "$2" "$dir" ;;
resume)
  [ -f "$dir/timer" ] && pkill -F "$dir/timer" -x sleep 2>/dev/null
  pl resume x "$dir" ;;
timer)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> timer <seconds>"
  exec perl -e '($f,$s)=@ARGV; open(T,q(>),$f) or die; print T $$, q( ), time+$s, qq(\n); close T; exec(q(sleep),$s)' "$dir/timer" "$2" ;;
stop-timer)
  [ -f "$dir/timer" ] && pkill -F "$dir/timer" -x sleep 2>/dev/null; exit 0 ;;
fork)
  [ $# -ge 3 ] || die "usage: beat.sh <dir> fork <name> <command...>"
  name=$2; shift 2
  mkdir -p "$dir/prompts"
  # Only an amending fork may hold the package worktree's lock; clear it if KILL was needed.
  case "$name" in rule-*|graph-*) lock=$(pkglock) ;; *) lock= ;; esac
  # The fork runs in its own process group. On the limit or a signal the whole group is
  # stopped (exit 124 / 143); on the fork's own exit any leftover member is stopped too,
  # and the fork's status is kept (128 + n for a death by signal n).
  exec perl -e '
    ($t, $f, $lock) = splice(@ARGV, 0, 3);
    $p = fork; if (!$p) { setpgrp; exec(@ARGV) or exit 127 }
    open(P, q(>), $f); print P qq($p\n); close P;
    sub sweep { return unless kill(0, -$p); kill(TERM => -$p);
      for (1..5) { last unless kill(0, -$p); sleep 1 }
      if (kill(0, -$p)) { kill(KILL => -$p); unlink $lock if length $lock } }
    $SIG{ALRM} = sub { sweep(); exit 124 };
    $SIG{$_} = sub { sweep(); exit 143 } for qw(TERM HUP INT);
    alarm $t; waitpid($p, 0); my $st = $?; alarm 0; sweep();
    exit($st & 127 ? 128 + ($st & 127) : $st >> 8)' \
    "$FORK_LIMIT" "$dir/prompts/$name.pid" "$lock" "$@" ;;
stop-fork)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> stop-fork <name>"
  pg=$(cat "$dir/prompts/$2.pid" 2>/dev/null)
  if [ -z "$pg" ] || ! pgrep -g "$pg" >/dev/null 2>&1; then echo "not running $2"; exit 0; fi
  pkill -TERM -g "$pg"
  i=0; while pgrep -g "$pg" >/dev/null 2>&1 && [ $i -lt 10 ]; do sleep 1; i=$((i+1)); done
  if pgrep -g "$pg" >/dev/null 2>&1; then
    pkill -KILL -g "$pg"; sleep 1
    case "$2" in rule-*|graph-*) lock=$(pkglock); [ -n "$lock" ] && rm -f "$lock" ;; esac
    echo "killed $2"
  else
    echo "stopped $2"
  fi
  exit 0 ;;
*) die "unknown command: $1" ;;
esac
exit 0

# The perl half: `perl -x` starts at the next line; sh reads it as an unused here-document.
: <<'PERL'
#!perl
use strict; use warnings;
use File::Glob qw(bsd_glob);
my $mode = shift @ARGV;
my $w = qr/(?![a-z0-9-])/;
# Run a command without a shell, stderr discarded; return its output lines.
sub run { my $pid = open(my $F, "-|"); return () unless defined $pid;
  if (!$pid) { open(STDERR, ">", "/dev/null"); exec(@_) or exit 127 }
  my @o = <$F>; close $F; chomp @o; @o }

# ---- the ledger ----------------------------------------------------------------------
my ($dir, $design, $project, %sec, @order);
sub load {
  $dir = shift;
  ($design = $dir) =~ s{.*/}{};
  ($project = $dir) =~ s{/[^/]+/[^/]+/[^/]+$}{};
  open(my $L, "<", "$dir/ledger.md") or die "beat.sh: no ledger.md in $dir\n";
  my $cur;
  while (my $l = <$L>) { chomp $l;
    if ($l =~ /^## (.+)$/) { $cur = $1; push @order, $cur; next }
    push @{ $sec{$cur // "" } }, $l; }
  close $L;
}
my (%unit, @slugs);
sub units {
  my $last;
  for my $l (@{ $sec{Units} || [] }) {
    if ($l =~ /^- ([a-z0-9-]+):/) { $last = $1; push @slugs, $1 unless exists $unit{$1}; $unit{$1} = $l }
    elsif (defined $last && $l =~ /^\s+\S/) { $unit{$last} .= " " . ($l =~ s/^\s+//r) }
  }
}
sub status { my ($st) = ($unit{$_[0]} // "") =~ /status: ([a-z]+)/; $st // "-" }
# The unit's worktree: the Units line's `worktree <path>, start` field, else the convention.
sub wt { my $u = shift;
  return $1 if ($unit{$u} // "") =~ /\bworktree (\/.+?), start /;
  return "$project/.claude/worktrees/$design-$u"; }
sub head { my ($h) = run("git", "-C", shift, "rev-parse", "HEAD"); $h // "" }
sub writebeat { my ($u, $h) = @_; mkdir "$dir/assignments";
  open(my $B, ">", "$dir/assignments/$u.beat") or die; print $B "$h\n"; close $B }
sub mtime { my @s = stat $_[0]; @s ? $s[9] : undef }
# One definition of a live session: listed under the unit's name, and not in state `failed`
# (a session that cannot start stays listed with status idle, state failed).
sub failed_entry { my $a = shift; grep { ($a->{$_} // "") eq "failed" } qw(state status) }
# Several entries can share a name (a failed one stays listed beside its relaunch): the
# unit's entry is one that is not failed if there is one, else a failed one.
sub entry { my ($list, $name) = @_;
  my @a = grep { ref $_ eq "HASH" && ($_->{name} // "") eq $name } @$list;
  my ($live) = grep { !failed_entry($_) } @a; $live // $a[0] }
sub entries { my ($list, $name, $only_failed) = @_;
  grep { ref $_ eq "HASH" && ($_->{name} // "") eq $name && (!$only_failed || failed_entry($_)) } @$list }
# The transcript of the unit's last confirmed session: <session id>.jsonl under ~/.claude/projects.
sub transcript { my $u = shift; open(my $S, "<", "$dir/assignments/$u.session") or return undef;
  my $id = <$S> // ""; close $S; chomp $id; return undef unless $id =~ /^[0-9a-f-]+$/;
  my ($f) = bsd_glob("$ENV{HOME}/.claude/projects/*/$id.jsonl"); $f }
my @sup; my @int;
# The ladder's key: the unit's newest merge (the sha exactly as its merged line has it) and
# how many times it has been replaced. A merge or a replacement starts the ladder again.
sub key { my $u = shift; my $sha = "start";
  for (@int) { $sha = $1 if /^- merged \Q$u\E$w.*?@ ([0-9a-f]+)/ }
  my $gen = () = grep { /^- \Q$u\E$w:.*status: replaced/ } @{ $sec{Units} || [] };
  ("$sha", $gen) }
sub rung { my $u = shift; my ($sha, $gen) = key($u);
  1 + scalar grep { /^- restarted \Q$u\E$w: .*, rung \d+, since (\S+) gen (\d+)\s*$/ && $1 eq $sha && $2 == $gen } @sup }
# A restart or relaunch is seen through once a `resent to <session>` line follows it.
# A launch that never brought a session up (`launch failed`) is seen through as well: it failed.
# Returns 1 (pending), 2 (the launch was ledgered failed) or 0.
sub pending { my $u = shift; my $s = "$design-$u"; my $p = 0;
  for (@sup) { $p = 1 if /^- (?:restarted|relaunched) \Q$u\E$w/;
    $p = 0 if /^- resent to \Q$s\E\s*$/; $p = 2 if /^- launch failed \Q$u\E$w/ } $p }
# An investigation for this rung: an `investigated` line with no later `restarted` line.
sub investigated { my $u = shift; my $i = 0;
  for (@sup) { $i = 1 if /^- investigated \Q$u\E$w/; $i = 0 if /^- restarted \Q$u\E$w/ } $i }
# The bounded tail of the transcript, copied into the ledger dir for the investigating agent.
# Whole lines only: a line cut by the byte window is dropped; nothing left means none.
sub tailfile { my $u = shift; my $t = transcript($u) // return undef;
  my $sz = -s $t // 0; open(my $T, "<", $t) or return undef;
  my $start = $sz > $ENV{TAIL_BYTES} ? $sz - $ENV{TAIL_BYTES} : 0;
  my $cut = 0;
  if ($start > 0) { seek($T, $start - 1, 0); read($T, my $c, 1); $cut = $c ne "\n" }
  seek($T, $start, 0); my @l = <$T>; close $T;
  shift @l if $cut;
  @l = @l[-$ENV{TAIL_LINES} .. -1] if @l > $ENV{TAIL_LINES};
  my $f = "$dir/assignments/$u.tail";
  unless (@l) { unlink $f; return undef }
  open(my $O, ">", $f) or return undef; print $O @l; close $O; $f }
# Waiting for a usage reset: the newest `waiting reset` line with no later `restarted` line.
sub waiting { my $u = shift; my $until;
  for (@sup) { $until = $1 if /^- waiting reset \Q$u\E$w until (\d+)/; undef $until if /^- restarted \Q$u\E$w/ } $until }
# Insert a line at the end of ## Supervision (created before ## Questions if missing).
sub append_sup { my $line = shift;
  open(my $L, "<", "$dir/ledger.md") or die; my @l = <$L>; close $L;
  my ($in, $at) = (0, undef);
  for my $i (0..$#l) {
    if ($l[$i] =~ /^## (.+)$/) { if ($in) { $at = $i; last } $in = ($1 eq "Supervision") }
  }
  if ($in && !defined $at) { $at = @l }
  if (defined $at) { $at-- while $at > 0 && $l[$at-1] =~ /^\s*$/; splice(@l, $at, 0, "$line\n") }
  else { my ($q) = grep { $l[$_] =~ /^## Questions$/ } 0..$#l; $q //= scalar @l;
    splice(@l, $q, 0, "## Supervision\n", "$line\n", "\n") }
  open(my $O, ">", "$dir/ledger.md.tmp") or die; print $O @l; close $O;
  rename("$dir/ledger.md.tmp", "$dir/ledger.md") or die; print "$line\n" }
# Processes left in a unit's worktree: cwd inside it and no controlling terminal.
sub strays { my ($wt, $want) = @_; my @r; my ($pid, $cwd);
  require Cwd; $wt = Cwd::abs_path($wt) // $wt;
  my %cwd; for (run("lsof", "-w", "-a", "-d", "cwd", "-Fpn")) {
    if (/^p(\d+)/) { $pid = $1 } elsif (/^n(.*)/ && $pid) { $cwd{$pid} = $1 } }
  for my $p (sort { $a <=> $b } keys %cwd) {
    next unless $cwd{$p} eq $wt || index($cwd{$p}, "$wt/") == 0;
    next if $p == $$;
    my ($o) = run("ps", "-o", "tty=,command=", "-p", $p); $o //= "";
    my ($tty, $cmd) = $o =~ /^\s*(\S+)\s+(.*)$/ or next;
    next unless $tty eq "??" || $tty eq "?";
    next if defined $want && index($cmd, $want) < 0;
    push @r, [$p, $cmd] }
  @r }

if ($mode eq "report") {
  my ($d, $beat, $stall, $timer, $deadline) = @ARGV; load($d); units();
  @sup = @{ $sec{Supervision} || [] }; @int = @{ $sec{Integration} || [] };
  my $now = time;
  my $known = ($ENV{SESSIONS} // "") eq "ok";
  my %sess;
  if ($known) {
    my $list = eval { JSON::PP->new->decode($ENV{AGENTS}) };
    if (ref $list eq "ARRAY") {
      for my $a (@$list) { next unless ref $a eq "HASH" && defined $a->{name};
        # A live entry wins over a failed one under the same name.
        next if exists $sess{$a->{name}} && $sess{$a->{name}} ne "failed";
        $sess{$a->{name}} = failed_entry($a) ? "failed" : ($a->{sessionId} // 1) }
    } else { $known = 0 }
  }
  my %fixopen; for my $u (@slugs) { my $o = 0;
    for (@int) { $o = 1 if /^- fix round \Q$u\E$w/; $o = 0 if /^- merged \Q$u\E$w/ } $fixopen{$u} = $o }
  my (%produces, %needs, %rowmerged);
  for my $u (@slugs) {
    for ([\%produces, "produces"], [\%needs, "needs"]) { my ($h, $k) = @$_;
      my ($v) = $unit{$u} =~ /\b$k: (.*?)(?:,\s*[a-z]+:|\)|$)/;
      $h->{$u} = [ grep { length && $_ ne "none" } map { s/^\s+|\s+$//gr } split /,/, ($v // "") ] } }
  for (@int) {
    if (/^- merged [a-z0-9-]+ row (\S+) @/) { $rowmerged{$1} = 1 }
    elsif (/^- merged ([a-z0-9-]+) @/) { $rowmerged{$_} = 1 for @{ $produces{$1} || [] } }
    elsif (/^- unmerged row (\S+?):/) { $rowmerged{$1} = 0 }
  }
  my %n = map { $_ => 0 } qw(watched absent evidence due overdue rows forks_running forks_gone
    fixrounds deferred questions waiting movable);
  my $next = "-";
  for my $u (@slugs) {
    my $st = status($u); $n{deferred}++ if $st eq "deferred";
    my $fix = $fixopen{$u};
    next unless $st eq "planning" || $st eq "admitted" || $fix;
    $n{watched}++; $n{fixrounds}++ if $fix;
    my $name = "$design-$u"; my $wt = wt($u);
    my $session = !$known ? "unknown" : !exists $sess{$name} ? "absent"
                : $sess{$name} eq "failed" ? "failed" : "alive";
    my $until = waiting($u);
    my $wait = !defined $until ? "none" : $until > $now ? "until-$until" : "over";
    if (defined $until && $until > $now) { $n{waiting}++; $next = $until if $next eq "-" || $until < $next }
    $n{absent}++ if ($session eq "absent" || $session eq "failed") && $wait eq "none";
    my $plan = (grep { /^- plan \Q$u\E$w/ } @sup) ? "yes" : "no";
    my $progress = !($st eq "planning" && $plan eq "yes") && $wait eq "none";
    my $bf = "$dir/assignments/$u.beat"; my $af = "$dir/assignments/$u.asked";
    my $head = head($wt); my $evidence = "no";
    if (!-e $bf) { $evidence = "new" }
    else {
      open(my $B, "<", $bf); my $old = <$B> // ""; close $B; chomp $old;
      if ($head ne $old) { $evidence = "yes" }
      elsif (-d $wt) {
        my ($hit) = run("find", $wt, "(", "-name", ".git", "-o", "-name", "node_modules", ")",
          "-prune", "-o", "-type", "f", "-newer", $bf, "-print", "-quit");
        $evidence = "yes" if defined $hit && length $hit } }
    if ($evidence ne "no") { writebeat($u, $head); $n{evidence}++ }
    my ($bm, $am) = (mtime($bf), mtime($af));
    my $quiet = int(($now - $bm) / 60);
    my $ask = "none"; my $asked = "-";
    if (defined $am && $am > $bm && $wait eq "none") {
      my $age = $now - $am; $asked = int($age / 60);
      $ask = $age >= $beat ? "overdue" : "open";
    } elsif ($progress && $evidence eq "no" && $now - $bm >= $stall * $beat) { $ask = "due" }
    $n{due}++ if $ask eq "due"; $n{overdue}++ if $ask eq "overdue";
    # Can it move without the partner? Waiting on a reset, or planned and waiting on rows
    # that no live unit produces, it cannot.
    my $movable = "yes";
    if ($wait =~ /^until/) { $movable = "no" }
    elsif ($st eq "planning" && $plan eq "yes" && !$fix) {
      my @open = grep { !$rowmerged{$_} } @{ $needs{$u} };
      my %live = map { my $s = status($_); ($s eq "planning" || $s eq "admitted") ? ($_ => 1) : () } @slugs;
      $movable = (grep { my $r = $_; grep { $live{$_} && grep { $_ eq $r } @{ $produces{$_} } } @slugs } @open) ? "yes" : "no" }
    $n{movable}++ if $movable eq "yes";
    my ($sha, $gen) = key($u);
    my $rung = rung($u);
    # A launch ledgered failed whose session is up after all is owed its resends like any other.
    my $pd = pending($u);
    my $restart = ($pd == 1 || ($pd == 2 && $session eq "alive")) ? "pending" : "none";
    # A listed session's id is the unit's current one.
    if ($session eq "alive" && $sess{$name} =~ /^[0-9a-f-]+$/) {
      open(my $S, ">", "$dir/assignments/$u.session"); print $S "$sess{$name}\n"; close $S }
    printf "unit %s status %s session %s evidence %s quiet %d ask %s asked %s plan %s fixround %s rung %d investigated %s restart %s wait %s movable %s\n",
      $u, $st, $session, $evidence, $quiet, $ask, $asked, $plan, ($fix ? "open" : "none"),
      $rung, (investigated($u) ? "yes" : "no"), $restart, $wait, $movable;
    # On the investigating rung, a bounded copy of its last session's transcript tail.
    print "transcript $u ", tailfile($u) // "none", "\n" if $rung >= 2;

    # Rows the SDD ledger shows passed review that no merge has delivered.
    for my $pp (bsd_glob("$wt/.superpowers/sdd/*/plan-path")) {
      open(my $P, "<", $pp) or next; my $rel = <$P> // ""; close $P; chomp $rel;
      my $planf = $rel =~ m{^/} ? $rel : "$wt/$rel";
      (my $prog = $pp) =~ s/plan-path$/progress.md/;
      open(my $PF, "<", $planf) or next; my @pl = <$PF>; close $PF;
      my @done = -f $prog ? do { open(my $G, "<", $prog); <$G> } : ();
      for my $r (@{ $produces{$u} }) {
        next if $rowmerged{$r};
        my ($task, $cand);
        for (@pl) { $cand = $1 if /^#+\s*Task\s+(\d+)\b/;
          if (/Delivers row \Q$r\E(?![A-Za-z0-9-])/) { $task = $cand; last } }
        next unless defined $task;
        for (@done) { if (/^Task \Q$task\E: complete \(commits [0-9a-f]+\.\.([0-9a-f]+)/) {
          print "row $u $r task $task head $1\n"; $n{rows}++; last } }
      }
    }
  }
  # Forks started and not yet seen to exit. An attempt after the first is named <name>@<k>.
  my (%fork, %fail, @fnames);
  for (@{ $sec{Forks} || [] }) {
    next unless /^- fork (\S+) (started|exited)/;
    my ($f, $ev) = ($1, $2); (my $base = $f) =~ s/@\d+$//;
    push @fnames, $f unless exists $fork{$f}; $fork{$f} = $ev;
    $fail{$base}++ if $ev eq "exited" && /: no output\s*$/;
  }
  for my $f (@fnames) {
    next unless $fork{$f} eq "started";
    (my $base = $f) =~ s/@\d+$//;
    my $pg = ""; my $state;
    if (open(my $P, "<", "$dir/prompts/$f.pid")) { $pg = <$P> // ""; close $P; chomp $pg }
    if ($pg !~ /^\d+$/) { $state = "unstarted" }
    else { $state = system("pgrep -g $pg >/dev/null 2>&1") == 0 ? "running" : "gone" }
    printf "fork %s %s failures %d\n", $f, $state, $fail{$base} // 0;
    $n{ $state eq "running" ? "forks_running" : "forks_gone" }++;
  }
  # Question files with no ## Questions line.
  my @q = @{ $sec{Questions} || [] };
  for my $qf (sort(bsd_glob("$dir/questions/*.md"))) {
    (my $id = $qf) =~ s{.*/}{}; $id =~ s/\.md$//;
    next if grep { /(?<![a-z0-9-])\Q$id\E(?![a-z0-9-])/ } @q;
    print "question $id\n"; $n{questions}++;
  }
  print "timer $timer deadline $deadline\n";
  printf "beat: sessions %s watched %d absent %d evidence %d due %d overdue %d rows %d forks running %d gone %d fixrounds %d deferred %d questions %d waiting %d next-reset %s movable %d timer %s\n",
    ($known ? "ok" : "unknown"), @n{qw(watched absent evidence due overdue rows forks_running forks_gone fixrounds deferred questions waiting)},
    $next, $n{movable}, $timer;
  exit 0;
}

my $u = shift @ARGV;
die "beat.sh: bad unit slug: $u\n" unless $u =~ /^[a-z0-9-]+$/ || $mode eq "resume";
if ($mode eq "restart") {
  my ($cause, $d) = @ARGV; load($d); units(); @sup = @{ $sec{Supervision} || [] }; @int = @{ $sec{Integration} || [] };
  die "beat.sh: bad cause: $cause\n" unless $cause =~ /^(death|stall|usage-limit|denied-command|hung-process|defect|unknown)$/;
  my ($sha, $gen) = key($u);
  # A usage-limit restart climbs no rung; every other restart takes the unit's next rung.
  unlink "$dir/assignments/$u.session";
  append_sup($cause eq "usage-limit" ? "- restarted $u: usage-limit, since $sha gen $gen"
                                     : "- restarted $u: $cause, rung " . rung($u) . ", since $sha gen $gen");
} elsif ($mode eq "stop") {
  my $d = pop @ARGV; my ($which) = @ARGV; load($d); my $name = "$design-$u";
  my $only = defined $which && $which eq "failed";
  my $list = sub { my $j = join "", run("claude", "agents", "--json");
    my $l = eval { JSON::PP->new->decode($j) }; ref $l eq "ARRAY" ? $l : undef };
  my $l = $list->() or do { print "stop $u: the session list is unreadable; nothing stopped\n"; exit 0 };
  my @ids = map { $_->{id} } grep { defined $_->{id} } entries($l, $name, $only);
  run("claude", "stop", $_) for @ids;
  my @left = @ids;
  for my $try (1 .. $ENV{LAUNCH_TRIES}) {
    my $now = $list->() // last; my %on = map { (($_->{id} // "") => 1) } entries($now, $name, 0);
    @left = grep { $on{$_} } @ids; last unless @left;
    sleep $ENV{LAUNCH_WAIT} if $try < $ENV{LAUNCH_TRIES} }
  printf "stop %s: stopped %s; still listed: %s\n", $u, (@ids ? join(",", @ids) : "none"), (@left ? join(",", @left) : "none");
} elsif ($mode eq "launching") {
  my ($d) = @ARGV; load($d); unlink "$dir/assignments/$u.session";
} elsif ($mode eq "relaunched") {
  my ($d) = @ARGV; load($d); unlink "$dir/assignments/$u.session"; append_sup("- relaunched $u");
} elsif ($mode eq "launch-failed") {
  my ($d) = @ARGV; load($d); append_sup("- launch failed $u"); exit 1;
} elsif ($mode eq "probe" || $mode eq "launched") {
  my ($d) = @ARGV; load($d); my $name = "$design-$u";
  my $list = eval { JSON::PP->new->decode($ENV{AGENTS}) };
  unless (ref $list eq "ARRAY") { print STDERR "beat.sh: the session list is unreadable\n"; exit 2 }
  my $a = entry($list, $name);
  unless ($a && ($a->{sessionId} // "") =~ /^[0-9a-f-]+$/) { print STDERR "beat.sh: $name is not listed\n"; exit 3 }
  if (failed_entry($a)) { print STDERR "beat.sh: $name is listed as failed\n"; exit 4 }
  exit 0 if $mode eq "probe";
  mkdir "$dir/assignments";
  open(my $S, ">", "$dir/assignments/$u.session") or die; print $S "$a->{sessionId}\n"; close $S;
  print "$name $a->{sessionId}\n";
} elsif ($mode eq "wait") {
  my ($min, $d) = @ARGV; die "beat.sh: minutes must be a number\n" unless $min =~ /^\d+$/;
  load($d); append_sup("- waiting reset $u until " . (time + 60 * $min));
} elsif ($mode eq "seen" || $mode eq "asked") {
  my ($d) = @ARGV; load($d); units(); mkdir "$dir/assignments";
  if ($mode eq "seen") { writebeat($u, head(wt($u))) }
  else { my $f = "$dir/assignments/$u.asked"; open(my $A, ">>", $f); close $A; utime(undef, undef, $f) }
} elsif ($mode eq "resume") {
  my ($d) = @ARGV; load($d); units();
  for my $bf (bsd_glob("$dir/assignments/*.beat")) {
    (my $s = $bf) =~ s{.*/}{}; $s =~ s/\.beat$//;
    writebeat($s, head(wt($s))); unlink "$dir/assignments/$s.asked" }
} elsif ($mode eq "strays" || $mode eq "kill-strays") {
  my $d = pop @ARGV; my ($want) = @ARGV; load($d); units();
  my $wt = wt($u);
  if ($mode eq "strays") { print "stray $_->[0] $_->[1]\n" for strays($wt); exit 0 }
  # Only processes whose command line contains the command the investigation named, read from
  # its one-line answer in <unit>.cause (`cause: hung process <command>`), never from a shell.
  $want = undef;
  if (open(my $C, "<", "$dir/assignments/$u.cause")) { my $l = <$C> // ""; close $C; chomp $l;
    ($want) = $l =~ /^\s*cause:\s*hung process\s+(.*\S)\s*$/ }
  die "beat.sh: no hung command named in assignments/$u.cause\n" unless defined $want && length $want;
  my @s = strays($wt, $want);
  my @p = map { $_->[0] } @s; kill(TERM => @p) if @p;
  for (1..5) { @p = grep { kill(0, $_) } @p; last unless @p; sleep 1 }
  kill(KILL => @p) if @p;
  print "stopped ", scalar(@s), " in $wt\n";
} else { die "beat.sh: unknown command: $mode\n" }
__END__
PERL
