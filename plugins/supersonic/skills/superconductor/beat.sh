#!/bin/sh
# beat.sh — the superconductor heartbeat's eyes and hands. The constants below are the
# single source the skill quotes. The report reads state and prints facts; it sends nothing
# and decides nothing the skill does not define here as arithmetic. Stock macOS: sh + perl.
#
# Usage (<dir> is the ledger dir, <project>/.superpowers/superconductor/<design-slug>):
#   beat.sh <dir>                     report: unit, row, fork, question, resend and timer lines, then "beat:"
#   beat.sh <dir> seen <unit-slug>    progress seen (a message handled, a restart): rewrite its beat file
#   beat.sh <dir> asked <unit-slug>   a status ask was sent: record it
#   beat.sh <dir> resume              Phase 0: stop the old timer, restart every beat file, drop asks
#   beat.sh <dir> timer <seconds>     the heartbeat timer; run it in the background
#   beat.sh <dir> stop-timer          stop the timer, if one runs
#   beat.sh <dir> fork <name> <cmd>   run a fork under FORK_LIMIT in its own process group
#   beat.sh <dir> stop-fork <name>    stop a fork's process group (TERM, then KILL)
#   beat.sh changed <marker>          operator: print one file under the cwd changed since
#                                     <marker> (none: print nothing), then touch <marker>
set -u
BEAT=600
STALL_BEATS=1
FORK_LIMIT=2700

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
design=$(basename "$dir")
project=$(cd "$dir/../../.." && pwd -P)
wt() { echo "$project/.claude/worktrees/$design-$1"; }

case "${1:-report}" in
report) ;;
seen)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> seen <unit-slug>"
  mkdir -p "$dir/assignments"
  git -C "$(wt "$2")" rev-parse HEAD > "$dir/assignments/$2.beat" 2>/dev/null || : > "$dir/assignments/$2.beat"
  exit 0 ;;
asked)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> asked <unit-slug>"
  mkdir -p "$dir/assignments"; touch "$dir/assignments/$2.asked"; exit 0 ;;
resume)
  [ -f "$dir/timer" ] && pkill -F "$dir/timer" -x sleep 2>/dev/null
  for b in "$dir"/assignments/*.beat; do
    [ -f "$b" ] || continue
    u=$(basename "$b" .beat)
    git -C "$(wt "$u")" rev-parse HEAD > "$b" 2>/dev/null || : > "$b"
    rm -f "$dir/assignments/$u.asked"
  done
  exit 0 ;;
timer)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> timer <seconds>"
  exec perl -e '($f,$s)=@ARGV; open(T,q(>),$f) or die; print T $$, q( ), time+$s, qq(\n); close T; exec(q(sleep),$s)' "$dir/timer" "$2" ;;
stop-timer)
  [ -f "$dir/timer" ] && pkill -F "$dir/timer" -x sleep 2>/dev/null; exit 0 ;;
fork)
  [ $# -ge 3 ] || die "usage: beat.sh <dir> fork <name> <command...>"
  name=$2; shift 2
  mkdir -p "$dir/prompts"
  exec perl -e '($t,$f)=splice(@ARGV,0,2); $p=fork; if(!$p){setpgrp; exec(@ARGV) or exit 127} open(P,q(>),$f); print P qq($p\n); close P; $k=sub{kill(TERM=>-$p); sleep 5; kill(KILL=>-$p); exit $_[0]}; $SIG{ALRM}=sub{$k->(124)}; $SIG{$_}=sub{$k->(143)} for qw(TERM HUP INT); alarm $t; waitpid($p,0); exit($?&127 ? 128+($?&127) : $?>>8)' \
    "$FORK_LIMIT" "$dir/prompts/$name.pid" "$@" ;;
stop-fork)
  [ $# -eq 2 ] || die "usage: beat.sh <dir> stop-fork <name>"
  pf="$dir/prompts/$2.pid"
  pg=$(cat "$pf" 2>/dev/null)
  if [ -z "$pg" ] || ! pgrep -g "$pg" >/dev/null 2>&1; then echo "not running $2"; exit 0; fi
  pkill -TERM -g "$pg"
  i=0; while pgrep -g "$pg" >/dev/null 2>&1 && [ $i -lt 10 ]; do sleep 1; i=$((i+1)); done
  if pgrep -g "$pg" >/dev/null 2>&1; then
    pkill -KILL -g "$pg"; sleep 1
    # A KILLed git commit leaves the package worktree's index lock behind.
    pkg=$(sed -n 's/^Package worktree: //p' "$dir/ledger.md" | head -n 1)
    if [ -n "$pkg" ]; then
      lock=$(git -C "$pkg" rev-parse --path-format=absolute --git-path index.lock 2>/dev/null)
      [ -n "$lock" ] && rm -f "$lock"
    fi
    echo "killed $2"
  else
    echo "stopped $2"
  fi
  exit 0 ;;
*) die "unknown command: $1" ;;
esac

# --- report ---------------------------------------------------------------------------
agents=$(claude agents --json 2>/dev/null) || agents='[]'
timer=none; deadline=-
if [ -f "$dir/timer" ] && pgrep -F "$dir/timer" -x sleep >/dev/null 2>&1; then
  timer=running; deadline=$(cut -d' ' -f2 "$dir/timer")
fi
AGENTS=$agents exec perl -MJSON::PP -e '
use strict; use warnings;
my ($dir, $project, $design, $beat, $stall, $timer, $deadline) = @ARGV;
my $now = time;
my %sess;
my $list = eval { JSON::PP->new->decode($ENV{AGENTS} || "[]") } || [];
$list = [] unless ref $list eq "ARRAY";
for my $a (@$list) { next unless ref $a eq "HASH" && defined $a->{name};
  $sess{$a->{name}} = join("/", grep { defined && length } $a->{status}, $a->{state}) || "-"; }

open(my $L, "<", "$dir/ledger.md") or die "beat.sh: no ledger.md in $dir\n";
my (%sec, $cur); my @order;
while (my $l = <$L>) { chomp $l;
  if ($l =~ /^## (.+)$/) { $cur = $1; next }
  next unless defined $cur; push @{ $sec{$cur} }, $l; }
close $L;
my $w = qr/(?![a-z0-9-])/;

# Units: newest entry per slug, continuation lines folded in.
my (%unit, @slugs, $last);
for my $l (@{ $sec{Units} || [] }) {
  if ($l =~ /^- ([a-z0-9-]+):/) { $last = $1; push @slugs, $1 unless exists $unit{$1}; $unit{$1} = $l; }
  elsif (defined $last && $l =~ /^\s+\S/) { $unit{$last} .= " " . ($l =~ s/^\s+//r); }
}
my @sup = @{ $sec{Supervision} || [] };
my @int = @{ $sec{Integration} || [] };

sub mtime { my @s = stat $_[0]; return @s ? $s[9] : undef }
sub newest_merged { my $u = shift; my $sha = "start";
  for (@int) { $sha = $1 if /^- merged \Q$u\E$w.*?@ ([0-9a-f]+)/ } return $sha }
sub fixround_open { my $u = shift; my $open = 0;
  for (@int) { $open = 1 if /^- fix round \Q$u\E$w/; $open = 0 if /^- merged \Q$u\E$w/ } return $open }

# Rows merged so far, in ledger order.
my %rowmerged;
my %produces;
for my $u (@slugs) { my ($p) = $unit{$u} =~ /produces: ([^)]*)/;
  $produces{$u} = [ grep { length && $_ ne "none" } map { s/^\s+|\s+$//gr } split /,/, ($p // "") ]; }
for (@int) {
  if (/^- merged ([a-z0-9-]+) row (\S+) @/) { $rowmerged{$2} = 1 }
  elsif (/^- merged ([a-z0-9-]+) @/) { $rowmerged{$_} = 1 for @{ $produces{$1} || [] } }
  elsif (/^- unmerged row (\S+?):/) { $rowmerged{$1} = 0 }
}

my %n = map { $_ => 0 } qw(watched absent evidence due overdue rows forks_running forks_gone fixrounds deferred questions resends);
for my $u (@slugs) {
  my ($st) = $unit{$u} =~ /status: ([a-z]+)/; $st //= "-";
  $n{deferred}++ if $st eq "deferred";
  my $fix = fixround_open($u);
  next unless $st eq "planning" || $st eq "admitted" || $fix;
  $n{watched}++; $n{fixrounds}++ if $fix;
  my $name = "$design-$u"; my $wt = "$project/.claude/worktrees/$name";
  my $alive = exists $sess{$name}; $n{absent}++ unless $alive;
  my $state = $alive ? $sess{$name} : "-";
  my $plan = (grep { /^- plan \Q$u\E$w/ } @sup) ? "yes" : "no";
  my $progress = !($st eq "planning" && $plan eq "yes");
  my $bf = "$dir/assignments/$u.beat"; my $af = "$dir/assignments/$u.asked";
  my $head = `git -C "$wt" rev-parse HEAD 2>/dev/null`; chomp $head;
  my $evidence = "no";
  if (!-e $bf) { $evidence = "new" }
  else {
    open(my $B, "<", $bf); my $old = <$B> // ""; close $B; chomp $old;
    if ($head ne $old) { $evidence = "yes" }
    elsif (-d $wt) {
      my $hit = `find "$wt" \\( -name .git -o -name node_modules \\) -prune -o -type f -newer "$bf" -print -quit 2>/dev/null`;
      $evidence = "yes" if length $hit;
    }
  }
  if ($evidence ne "no") { mkdir "$dir/assignments"; open(my $B, ">", $bf); print $B "$head\n"; close $B; $n{evidence}++; }
  my $quiet = int(($now - mtime($bf)) / 60);
  my $ask = "none"; my $asked = "-";
  my ($bm, $am) = (mtime($bf), mtime($af));
  if (defined $am && $am > $bm) {
    my $age = $now - $am; $asked = int($age / 60);
    my $busy = $state =~ /\bbusy\b/;
    $ask = ($age >= 2 * $beat || ($age >= $beat && !$busy)) ? "overdue" : "open";
  } elsif ($progress && $evidence eq "no" && $now - $bm >= $stall * $beat) { $ask = "due" }
  $n{due}++ if $ask eq "due"; $n{overdue}++ if $ask eq "overdue";
  my $since = newest_merged($u);
  my $rung = 1 + scalar grep { /^- restarted \Q$u\E$w.*rung \d+, since \Q$since\E$/ } @sup;
  printf "unit %s status %s session %s state %s evidence %s quiet %d ask %s asked %s plan %s fixround %s rung %d\n",
    $u, $st, ($alive ? "alive" : "absent"), $state, $evidence, $quiet, $ask, $asked, $plan, ($fix ? "open" : "none"), $rung;

  # Rows the SDD ledger shows passed review that no merge has delivered.
  for my $pp (glob("$wt/.superpowers/sdd/*/plan-path")) {
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

# Forks started and not yet seen to exit.
my (%fork, %fail, @fnames);
for (@{ $sec{Forks} || [] }) {
  next unless /^- fork (\S+) (started|exited)/;
  my ($f, $ev) = ($1, $2);
  push @fnames, $f unless exists $fork{$f}; $fork{$f} = $ev;
  $fail{$f}++ if $ev eq "exited" && /: no output\s*$/;
}
for my $f (@fnames) {
  next unless $fork{$f} eq "started";
  my $pg = ""; if (open(my $P, "<", "$dir/prompts/$f.pid")) { $pg = <$P> // ""; close $P; chomp $pg; }
  my $run = ($pg =~ /^\d+$/ && system("pgrep -g $pg >/dev/null 2>&1") == 0);
  printf "fork %s %s failures %d\n", $f, ($run ? "running" : "gone"), $fail{$f} // 0;
  $n{ $run ? "forks_running" : "forks_gone" }++;
}
# Question files with no ## Questions line, and sessions owed resends after a restart.
my @q = @{ $sec{Questions} || [] };
for my $qf (sort glob("$dir/questions/*.md")) {
  (my $id = $qf) =~ s{.*/}{}; $id =~ s/\.md$//;
  next if grep { /(?<![a-z0-9-])\Q$id\E(?![a-z0-9-])/ } @q;
  print "question $id\n"; $n{questions}++;
}
my (%owe, @owed);
for (@sup) {
  if (/^- (?:restarted|relaunched) ([a-z0-9-]+)(?![a-z0-9-])/) { my $s = "$design-$1"; push @owed, $s unless exists $owe{$s}; $owe{$s} = 1 }
  elsif (/^- resent to (\S+)\s*$/) { $owe{$1} = 0 }
}
for (@owed) { if ($owe{$_}) { print "resend $_\n"; $n{resends}++ } }
print "timer $timer deadline $deadline\n";
printf "beat: watched %d absent %d evidence %d due %d overdue %d rows %d forks running %d gone %d fixrounds %d deferred %d questions %d resends %d timer %s\n",
  @n{qw(watched absent evidence due overdue rows forks_running forks_gone fixrounds deferred questions resends)}, $timer;
' "$dir" "$project" "$design" "$BEAT" "$STALL_BEATS" "$timer" "$deadline"
