#!/bin/sh
# Structural checks for SKILL.md frontmatter and required sections
set -e
skill="$(cd "$(dirname "$0")/.." && pwd)/plugins/supersonic/skills/superconductor/SKILL.md"

test -f "$skill" || { echo "FAIL: SKILL.md missing"; exit 1; }
head -1 "$skill" | grep -qx -- '---' || { echo "FAIL: no opening frontmatter delimiter"; exit 1; }
fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
printf '%s\n' "$fm" | grep -qx 'name: superconductor' || { echo "FAIL: bad or missing name"; exit 1; }
keys=$(printf '%s\n' "$fm" | grep -c '^[a-z][a-z-]*:')
[ "$keys" -eq 2 ] || { echo "FAIL: frontmatter must have exactly name and description, found $keys keys"; exit 1; }
desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
case "$desc" in "Use when"*) ;; *) echo "FAIL: description must start with 'Use when'"; exit 1;; esac
[ "${#desc}" -le 500 ] || { echo "FAIL: description over 500 chars (${#desc})"; exit 1; }

# Section headings, exactly, in this order.
expected='## Hard rules
## Phase 0 — Resume check
## Phase 1 — Package intake
## Phase 2 — Admission
## Supervision
## Composer forks
## Optional Jev judgments
## Context economics
## Integration
## Ledger format'
printf '%s\n' "$expected" | while IFS= read -r h; do
  grep -qxF -- "$h" "$skill" || { echo "FAIL: SKILL.md missing section heading: $h"; exit 1; }
done
got=$(grep -xF -f /dev/stdin "$skill" <<EOF
$expected
EOF
)
[ "$got" = "$expected" ] || { echo "FAIL: SKILL.md section headings out of order"; exit 1; }

# The text with line breaks folded, so phrases that wrap still match.
flat=$(tr '\n' ' ' < "$skill" | tr -s ' ')
need() { printf '%s\n' "$flat" | grep -qF -- "$1" || { echo "FAIL: SKILL.md missing: $1"; exit 1; }; }
forbid() { printf '%s\n' "$flat" | grep -qF -- "$1" && { echo "FAIL: SKILL.md must not contain: $1"; exit 1; }; return 0; }

need 'operator-briefing.md'
need 'supercomposer'
need 'supersonic:supercomposer'
forbid 'back to supercomposer'
grep -q -e 'frame-defect' -e 'Frame-defect' "$skill" || { echo "FAIL: SKILL.md missing the frame-defect tally"; exit 1; }
need "this skill's \`budget.sh\`"
need 'budget state MUST NOT be an input to tier selection'
grep -qi 'opus' "$skill" \
  && { echo "FAIL: operator tier must not be hardcoded to a specific model (Opus found)"; exit 1; }
need 'rationale'

# Sessions, admission, bands, resume.
for s in 'claude --bg -n' '--allowedTools="' 'notify_when_idle' 'claude agents --json' 'claude stop' \
         'BAND:' 'LOWER' 'seven_day' 'assignments/<unit-slug>.md' '<design-slug>-<unit-slug>' \
         'build graph' 'Never send a message or schedule a wakeup solely to keep a cache warm'; do
  need "$s"
done
# The launch line sets its cwd with env -C, never with a separate cd.
need 'env -C "<unit worktree>" claude --bg -n <design-slug>-<unit-slug>'
# The launch list allows what SDD runs: its three scripts by absolute path, merge-base, branch,
# and the project's own commands (not the plan's); a relaunch is a procedure, not a death.
for s in 'Bash(bash <sdd scripts dir>/sdd-workspace:*)' 'Bash(bash <sdd scripts dir>/task-brief:*)' \
         'Bash(bash <sdd scripts dir>/review-package:*)' 'Bash(git merge-base:*)' 'Bash(git branch:*)' \
         'Bash(<project command>:*)' 'SDD scripts: <absolute path>' 'Project commands: <commands>' \
         '/skills/subagent-driven-development/scripts' 'installed_plugins.json' 'never from a plan' \
         'Relaunching with a longer list' 'A relaunch is not a death' \
         'until its name is no longer listed'; do
  need "$s"
done
forbid "per command the plan's tasks run"
forbid 'Bash(<test command>:*)'
# The live drill launches its operator with this exact list (scripts dir and project command
# substituted), so the drill's PASS covers the list the skill writes.
drill="$(dirname "$skill")/../../../../tests/drill_peer_sessions.sh"
skill_list=$(sed -n 's/.*claude --bg -n <design-slug>-<unit-slug> .*--allowedTools="\([^"]*\)".*/\1/p' "$skill" \
  | sed -e 's|<sdd scripts dir>|$sdd|g' -e 's|<project command>|true|g' -e 's|<skill dir>|$skill|g')
drill_list=$(sed -n 's/^op_tools="\([^"]*\)"$/\1/p' "$drill")
[ -n "$skill_list" ] && [ "$skill_list" = "$drill_list" ] \
  || { echo "FAIL: drill op_tools does not mirror the skill's launch list"; printf '%s\n%s\n' "$skill_list" "$drill_list"; exit 1; }
# The live drill checks what beat.sh and the skill assume about real sessions.
for s in 'fork drill-limit env -C' 'fork drill-normal env -C' 'claude logs "$opid"' 'claude logs "$op2id"' \
         'run_in_background true' 'TaskStop' 'beat.sh changed' 'drill-$pid-nobody' 'sleep-woke.txt' 'msg-read.txt' \
         '30 s after its last step' 'stopped session transcript' 'no-such-model-drill' 'relaunch under a failed session' 'stopped sessions still listed' 'DRILL_DEADLINE' 'peer-session-drill-result.txt'; do
  grep -qF -- "$s" "$drill" || { echo "FAIL: live drill lacks: $s"; exit 1; }
done
for s in 'VERDICT: STOP' 'VERDICT: HOLD' 'scope gate' 'agentId' 'Operators from prior sessions are dead' \
         'rate-limits.json' 'defer-only' 'specs completed'; do
  forbid "$s"
done
grep -qiw -e 'wave' -e 'waves' "$skill" && { echo "FAIL: SKILL.md still speaks of waves"; exit 1; }

# Ledger sections, in order.
ledger=$(awk '/^## Ledger format/{f=1} f' "$skill")
lexp='Package worktree:
Build graph:
## Checkpoints
## Units
## Supervision
## Questions
## Forks
## Frame-defect tally
## Integration
## Cost'
lgot=$(printf '%s\n' "$ledger" | sed -n -e 's/^    \(Package worktree:\).*/\1/p' -e 's/^    \(Build graph:\).*/\1/p' \
  -e 's/^    \(## Checkpoints\)$/\1/p' -e 's/^    \(## Units\)$/\1/p' -e 's/^    \(## Supervision\)$/\1/p' \
  -e 's/^    \(## Questions\)$/\1/p' -e 's/^    \(## Forks\)$/\1/p' \
  -e 's/^    \(## Frame-defect tally\)$/\1/p' -e 's/^    \(## Integration\)$/\1/p' -e 's/^    \(## Cost\)$/\1/p')
[ "$lgot" = "$lexp" ] || { echo "FAIL: ledger format sections missing or out of order"; printf '%s\n' "$lgot"; exit 1; }
for s in 'status: launching | planning | admitted | complete | stopped | replaced (ruling <id>) | deferred' \
         '[defect-class: <slug>]' 'changes contract: yes|no' 'seven_day <pct>' 'session <id>'; do
  printf '%s\n' "$ledger" | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$s" \
    || { echo "FAIL: ledger format missing: $s"; exit 1; }
done

# Hand-back siblings keep their rows and their plan, and know each other.
need '- Plan: none | <plan path> at <sha>, tasks <numbers> (already written)'
need '- Siblings: <session names, or none>'
need "only that sibling's merge counts"
need 'remove them from'
need 'Sibling notice'
need '`Produces rows others wait on:` the rows from step 1'

# Every conductor->operator message template ends in an imperative, never a bare pointer.
need 'Re-read'
forbid 'ruling ready'

# Composer forks: questions, rulings, merge review, re-checkpoint, replacement.
for s in 'composer-forks.md' '--fork-session' 'questions/<id>.md' 'rulings/<id>.md' \
         'first task that no longer holds' 'five' 'Changes contract' 'one writer' 'No agent loads'; do
  need "$s"
done
# Replacement: the assignment names kept commits and the superseded plan; cut rows are unmerged.
need '- Replaces: none | an earlier operator; kept commits <base sha>..<kept sha> stand and are not redone; superseded plan <plan path>'
need 'Bash(git rm:*)'
need 'Write nothing else about the old approach in the assignment'
need '- unmerged row <row id>: cut by ruling <id>'
need 'so nothing new is admitted on it'
# Cut commits that had merged are reverted (not the merge commit) under the one-writer slot.
need 'revert those commits, not the merge commits'
need 'rev-list --no-merges --first-parent <cut-to sha>..<merged sha>'
need 'while you hold the one-writer slot'
need '- reverted <unit-slug> <cut-to sha>..<merged sha> for ruling <id>'
need "\`start\` commit on its \`## Units\` line"
need 'start <sha>, model'
forbid 'Do not revert the earlier merge'
forbid "the fresh report's merge supersedes it"
forbid 'merge-base HEAD superconductor'
need 'only for the merge commit you just made in step 1'
# A ruling naming a first task for any family member replaces the whole family.
need 'replaces the whole family'
need "move every sibling's \`produces:\` rows back to \`<unit-slug>\`'s line"
need 'pass `<unit-slug>`'
# Every design change reruns the build graph, which may add rows.
need 'If `Changes design: yes`, run `## Build-graph fork`'
need "the ruling's \`## Build graph\` lines"
forbid 'and `## Affected units` lists any unit, run'
# Restarts keep their plan; branches are brought up to date before a launch.
need "\`Plan:\` naming the plan it already wrote"
need 'Bringing a branch up to date'
need 'merge --no-ff --no-edit superconductor/<design-slug>'
forbid 'merge --no-edit superconductor/<design-slug>'
# A unit's start is HEAD after the bring-up merge; every merge into a unit branch is --no-ff,
# so the revert's --first-parent range never reaches integration-branch commits.
need 'just before the first launch, after any bring-up-to-date merge'
need 'Every merge of the integration branch into a unit branch is `--no-ff`'
forbid 'the commit its worktree was created at'
# A restart names only a plan present at the branch head, never the superseded one.
need 'Name only a plan file present at the branch head'
need 'never the superseded plan its `Replaces:` line names'
need '`Plan:` stays `none` and `Replaces:` stays as it is'
forbid 'If no plan was committed yet'
# Resume reconciles the package worktree before restarting operators, interrupted reverts included.
need 'Reconcile the package worktree first'
need 'revert --abort`, which takes out the reverts'
need 'the untested merge at the branch'"'"'s head that Phase 0 takes out'
# Resume finishes a replacement the last conductor left unfinished, from ledgered steps.
need 'Ledger every member `replaced (ruling <id>)` in one append, then stop'
need '- cut <member> to <cut-to sha> for ruling <id>'
# Routing is write-ahead: a begun line before step 1, a done line after step 5, and every
# step skips what the ledger shows done, so resume routes an unfinished ruling from the top.
for s in '- routing <id>: rulings/<id>.md, commit <sha|none>' '- relayed <id> to <session name>' \
         '- build graph for <id> @ <sha|none>' '- routed <id>' '[| ruling <id>]'; do
  printf '%s\n' "$ledger" | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$s" \
    || { echo "FAIL: ledger format missing: $s"; exit 1; }
done
need 'Before step 1, append `- routing <id>: rulings/<id>.md, commit <sha|none>`'
need 'append `- routed <id>` under `## Questions`'
need 'routing begun'
need 'routing done'
need 'A ruling with a `routing <id>` line and no `routed <id>` line is routed again from the top'
# An unrouted ruling is one whose question line lacks its completion part, true on any ledger (I-3, N-7).
need 'line does not yet end with its `(commit <sha|none>, changes contract: yes|no)` part is a ruling whose fork exited'
need 'A question line that ends with that part and has no `routing <id>` line was routed in full'
forbid 'exists but which has no `routing <id>` line'
forbid 'Once every ruling has its `routed <id>` line'
forbid 'has no commit recorded yet'
# Replacing records each step's progress explicitly; routing again resumes at the first step with no
# done line, so a death after step 1 stops a live operator still cuts, reverts and relaunches (C-1).
printf '%s\n' "$ledger" | tr '\n' ' ' | tr -s ' ' | grep -qF -- '- replacing <unit-slug> for <id>: step <n> done' \
  || { echo "FAIL: ledger format missing the replacing step done line"; exit 1; }
need 'Each step below ends by appending its done line under `## Questions`: `- replacing <unit-slug> for <id>: step <n> done`'
need 'Routing again runs the steps for a family from the first step with no done line'
need 'Replacing an operator runs from its first step with no done line'
forbid 'When routing again, never stop the fresh operator this ruling already started'
forbid 'skip steps 1-6'
forbid 'skip steps 1-3'
# After step 6 is done the fresh operator is an ordinary unit, restarted if it died (N-1).
need 'until the ledger holds that replacement'"'"'s `- replacing <unit-slug> for <id>: step 6 done` line'
need 'Once step 6 is done, the fresh operator is an ordinary unit: if it is dead, restart it here'
need 'once step 6 is done, it is an ordinary unit, which Phase 0 restarts like any other if it dies'
need 'and step 6'"'"'s done line'
# A rule commit with no ruling file is undone with a fixed subject, independent of revert config (I-2, N-4, N-5).
need "git -C <package worktree> log -1 --format=%H --grep='^docs(<design-slug>): rule <id>\$'"
need "--grep='^docs(<design-slug>): unrule <id>\$' <that sha>..HEAD"
need 'revert --no-commit <that sha>'
need 'commit -m "docs(<design-slug>): unrule <id>"'
need '- unruled <sha> for <id>: no ruling file'
need 'is not one: the Questions bullet ledgers it'
forbid 'This reverts commit'
need "--grep='^docs(<design-slug>): rule ' <checkpoint package sha>..HEAD"
need "less the \`unrule\` commits Phase 0 made in that range"
forbid "--grep='): rule '"
# Ids are slugs and are matched as whole words (N-2, N-6).
need 'uses only `[a-z0-9-]`'
need 'stands in it as a whole word'
# A launch that may never have happened is finished without counting a death (N-3, M-1).
need 'If `claude agents --json` lists `<design-slug>-<unit-slug>` and not in state `failed`, start nothing'
need 'lists its worktree, step 1 is done: go on from step 2'
need '**Ledger** the unit line (`## Units`) before the launch, then run `sh <skill dir>/beat.sh <ledger dir> launching <unit-slug>`'
need 'The line has status `launching`'
need 'This is a first launch, not a restart, and counts no death'
need 'launch it (Phase 2, Starting an operator, step 4)'
need 'Restart no member of a family that a ruling still to be routed'
need "--grep='^docs(<design-slug>): build graph\$' <package commit>..HEAD"
# The start of a brought-up branch is HEAD after that merge, before step 3 ledgers it.
need 'before Starting an operator, step 3, ledgers its `start`'
need 'drop a leading `<unit worktree>/` (an absolute path) or `./`'
need 'Routing a ruling again after a death is still routing it'
need 'unless a `relayed <id> to <session name>` line records it'
need 'unless a `build graph for <id>` line is in the ledger'
need 'unless a `## Checkpoints` line names `ruling <id>`'
need 'Skip a member that has a `- cut <member>'
need 'that has no `- reverted` line for ruling <id>'
need 'revert-<member>-<ruling id>'
need 'Phase 0 already launched it from its `launching` line: launch nothing'
# One package writer at a time: resume finishes all routing before any other package writer.
need 'Phase 0 finishes all routing, the build-graph forks it runs included, before it starts or restarts any other fork that writes the package worktree, and before it merges anything'
need "start the next once the running one's ruling is routed"
forbid 'start the next when the running one exits'
forbid 'no later start line'
forbid '**Replacements.**'
forbid 'Finish it from the first step its ledger does not show done'
# The superseded plan's SDD workspace is removed at the cut, so no plan can resume it.
need 'remove the superseded plan'"'"'s SDD workspace'
need "grep -lxF -- '<plan path>' <unit worktree>/.superpowers/sdd/*/plan-path"
forbid 'Move your plan to a new path'
need 'git add it, git rm the old path and commit'
# The restart reads a repo-relative plan path.
need 'Take the repo-relative path from the `plan-path` file'
# <merged sha> is the unit-side commit, never the integration merge commit.
need 'the unit commit that `## Integration` step 1 merged, never the merge commit'
need 'never the merge commit on the integration branch'
# No rebase; a dead owner on a failing merge is restarted by the restart rule.
forbid 'or rebase on'
need 'handle it as `## Supervision`, Operator death, says; the restart'"'"'s resends carry the fix round'
forbid 'with the failure output path added'
forbid "that merge's commit"
need 'Merge superconductor/<design-slug> into your branch first, then bring the tasks'
# The tally re-checkpoints on the event, not the standing state.
need "brought a class's frame-defect tally to three"
forbid 'the frame-defect tally reached three of one class'
# Resume reconciles forks, rulings, the package worktree and merge reviews.
need 'Uncommitted edits there are a dead fork'
need 'is a ruling whose fork exited while no conductor ran: route it'
need 'start its merge-review fork'
# The high band wakes for the reset with real work, not as a keep-warm ping.
need 'Waiting for the reset'
need 'not a keep-warm ping'
# Re-checkpoints use the most capable model available, named nowhere here.
need 'the most capable model available to this session'
for s in 'Bounce rule' 'jev ask bounce' '**bounce**' 'Adjudicate yourself' 'exact delta'; do
  forbid "$s"
done

# Stall detection. Messages are hints; the heartbeat reconciles from state, through beat.sh.
need 'Messages are hints; state is the truth.'
need '`BEAT=600` seconds, `STALL_BEATS=1`, and the forks'"'"' `FORK_LIMIT=2700`'
for s in 'BEAT=' 'STALL_BEATS=' 'FORK_LIMIT='; do
  grep -qE "^ *(- )?$s[0-9]" "$skill" && { echo "FAIL: SKILL.md must not set $s itself; beat.sh holds it"; exit 1; }
done
test -x "$(dirname "$skill")/beat.sh" || { echo "FAIL: beat.sh missing or not executable"; exit 1; }
# The beat is one command; its lines are specified here.
need 'A beat** is one command, `sh <skill dir>/beat.sh <ledger dir>`'
need 'A beat with nothing to do is two tool calls whatever the number of units'
need 'unit <unit-slug> status <status> session alive|absent|unknown evidence yes|no|new quiet <minutes> ask none|due|open|overdue asked <minutes>|- plan yes|no fixround open|none rung <n> investigated yes|no restart pending|none wait none|until-<epoch>|over movable yes|no'
need 'row <unit-slug> <row id> task <N> head <sha7>'
need 'fork <fork name> running|gone|unstarted failures <n>'
need 'beat: sessions ok|unknown watched <n> absent <n> evidence <n> due <n> overdue <n> rows <n> forks running <n> gone <n> fixrounds <n> deferred <n> questions <n> waiting <n> next-reset <epoch>|- movable <n> timer running|none'
need 'sh <skill dir>/beat.sh <ledger dir> timer <seconds>'
need 'the exit of a timer you stopped is not a beat'
need 'Then run one beat (`## Supervision`, Heartbeat), which starts the heartbeat timer if anything can move'
need 'The heartbeat is not a keep-warm ping: every beat does the whole reconcile'
forbid 'pgrep -F <ledger dir>/timer'
forbid '-mmin +'
# P1: one quiet beat triggers the ask; the bounds are stated.
need 'no evidence for `STALL_BEATS` × `BEAT` (10 minutes)'
need 'So a silent operator is asked 10 to 20 minutes after its last evidence'
# I7: the timer runs only while something can move without the partner.
need 'Keep exactly one heartbeat timer while something can move without your partner'
need 'When nothing can move, start no timer'
need 'start the timer if none is running and something can move'
need 'Other wakes do not reset a running timer'
# P4/M10: a handled message rewrites the beat file at once.
need 'when you handle one, run `sh <skill dir>/beat.sh <ledger dir> seen <unit-slug>`'
need 'when you handle it, run `sh <skill dir>/beat.sh <ledger dir> seen <unit-slug>`'
# I3: Phase 0 restarts beat files and drops old asks before its first beat.
need 'sh <skill dir>/beat.sh <ledger dir> resume'
need 'drops every open status ask, so no ask or quiet spell the dead conductor left is acted on'
need "\`Delivers row <row id>\`"
need '`Task <N>: complete (commits <base7>..<head7>`'
need 'but only while no amending fork runs and no ruling is being routed'
need 'A `question` line: a file in `<ledger dir>/questions/` with no `## Questions` line'
need '`restart pending`: its newest `restarted` or `relaunched` line has no'
need 'also when there was nothing to send: that line is what marks the restart seen through'
# N1: an unreadable session list handles no death.
need 'On a beat whose summary says `sessions unknown`, handle neither'
need 'Handle no death and no stall on this beat'
need 'append `- resent to <session name>`'
# I6: fix rounds are watched, restarted and resent.
need 'and the fix-round message of its open `fix round` line'
need 'or whose fix round is open'
need 'the restart'"'"'s resends carry the fix round'
need 'Your own commands.'
forbid '`kill` (a hung process'
forbid 'kill <pid>'
# notify_when_idle is an optimisation, never the only detection.
need 'It is an optimisation only'
forbid 'Learn of idle with `notify_when_idle`, never by polling'
# Forks: limit through beat.sh, write-ahead ledger, stale exits ignored, relaunched once.
need 'Ledger `- fork <fork name> started <date-time>` under `## Forks`, then run its command line'
need 'the time limit, `env -C "<package worktree>"`'
need 'exit status 124'
# I2/N3: attempts are named apart; staleness is read from the ledger, not the process group.
need 'if the newest line for that attempt'"'"'s name is already an `exited` line, this is a stale notice: do nothing'
need 'Each attempt after the first appends `@<k>` (`rule-q7@2`)'
need 'The fork'"'"'s exit is decided by the fork process'
forbid 'still shows its group running, this is a'
need 'fork … unstarted'
need 'No output, first time:'
need 'No output, second time'
need 'a fork that failed twice'
need 'stop-fork <name>`, which sends TERM to its process group, waits, escalates to KILL'
need 'A read-only fork (`review-…`, `checkpoint-<n>`) writes nothing to the package: leave it running'
need 'exited: stopped at resume'
need 'holds while the fork'"'"'s watchdog'
forbid 'holds even when no conductor is running'
need 'If it failed twice, append `- build graph for <id> @ none`'
need '`checkpoint-<n>`, whose output is a session id'
# P2/P3/I1/C1/N2: the escalation ladder. beat.sh is the one place the rung is computed and the
# restart line written; the prose says what each rung does, not how to count.
need '**Rung 1: restart**, with cause `death` or `stall`.'
need '**Rung 2: investigate, apply the remedy, restart.**'
need '**Rung 3: stop.** Do not restart. If its name is listed (a stall, or a `failed` entry), stop it'
forbid 'claude logs'
forbid 'busy'
need 'Read <the report'"'"'s transcript file> (the end of its transcript'
need 'The copy keeps the investigation inside the project and ledger dirs'
# R3-1: a session that never appears is a failed start that climbs.
need 'A session that never appears or fails is a failed start: `launched` ledgers `- launch failed <unit-slug>`'
forbid 'run it again a few seconds later'
# R3-3: kill-strays only kills the named command.
need 'kill-strays <unit-slug>`, which reads the command line from the `.cause` file (never through a shell)'
need 'Write its answer, as given, to `<ledger dir>/assignments/<unit-slug>.cause` with the Write tool'
forbid '"<the command line it named>"'
# Round-4 drill: a session that cannot start stays listed in state failed; alive excludes it.
need 'Alive means listed under its name and not in state `failed`'
need '`session failed`: it is listed in state `failed`'
need 'stores the session id only if the session is alive at the last look and never failed in between'
need 'A session that comes up after that line is owed its resends like any restart'
need 'operator launching, launch failed, operator replaced'
need 'With no command named, it kills nothing: treat the cause as `unknown`'
need 'found again at the time it runs, never by a remembered pid'
# R3-8: a usage-limited stall is stopped before it waits.
need 'If its name is listed (a stall, or a `failed` entry), stop it first (Stopping an operator) and wait until it is no longer listed. Then run `sh <skill dir>/beat.sh <ledger dir> wait'
# R3-9: the script says whether an investigation for this rung is ledgered.
need 'If the report shows `investigated yes`'
forbid 'line with no later `restarted <unit-slug>` line is in the ledger'
# R3-2: every launch forgets the previous session id.
need 'relaunched <unit-slug>` (it appends `- relaunched <unit-slug>` under `## Supervision` and forgets the old session id)'
need 'transcript <unit-slug> <path>|none'
need 'sh <skill dir>/beat.sh <ledger dir> launched <unit-slug>'
need 'handled as stalled one beat later: 20 to 30 minutes.'
need 'cause: denied command <command> | usage limit | hung process <the command line it ran, as the transcript shows it> | defect <the task and what it keeps hitting> | unknown'
need 'It reads only, so a death mid-investigation just dispatches it again'
need 'the report'"'"'s `rung` field is the rung this one is on'
need 'so you never count lines or copy a key yourself'
need 'sh <skill dir>/beat.sh <ledger dir> restart <unit-slug> <cause>'
need 'launch it again from step 4 below, with no new rung'
need 'Ledger the unit `stopped` only when it will not be restarted'
forbid 'second consecutive'
forbid 'Ledger it as `stopped`.'
forbid 'one more than the `- restarted'
# N4: a usage limit waits for the reset, unwatched, and restarts with no rung.
need 'sh <skill dir>/beat.sh <ledger dir> wait <unit-slug> <minutes>'
need 'At `wait over`, restart it with cause `usage-limit`, which climbs no rung'
# m3: strays are found again when killed, never by a remembered pid.
# m7: the worktree comes from the Units line.
need 'worktree <absolute path>, start <sha>'
for s in '- fork <fork name> started <date-time>' '- fork <fork name> exited [<status>]: output | no output | stopped at resume' \
         '- status asked <unit-slug>' '- stalled <unit-slug>' \
         '- restarted <unit-slug>: <cause>, rung <n>, since <sha|start> gen <k>' \
         '- restarted <unit-slug>: usage-limit, since <sha|start> gen <k>' \
         '- waiting reset <unit-slug> until <epoch>' \
         '- investigated <unit-slug>: <cause> — <remedy>' \
         '- stopped <unit-slug>: rung 3' '- plan <unit-slug>: <plan path> at <sha>' \
         '- resent to <session name>' '- notified <session name>: sibling <sibling name>' \
         '- fix round <unit-slug> @ <sha>: <one line>; output <path>' '- build graph for <id> @ <sha|none>'; do
  printf '%s\n' "$ledger" | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$s" \
    || { echo "FAIL: ledger format missing: $s"; exit 1; }
done
# Operators wait on leaves in the background, which the launch list must allow, narrowly.
need ',TaskStop,Bash(sleep:*),Bash(sh <skill dir>/beat.sh changed:*),'
need '- Allowed for waiting: sleep (run in the background), TaskStop, sh <skill dir>/beat.sh changed'
# Messages: status reply, denied command, anything else; repeats are idempotent.
need '| `status: plan <plan path> at <sha> \| none;'
need '| `need command: <command> for task <N>` |'
need 'A message that asks nothing (an acknowledgement, a report) is progress evidence only'
need 'and ledger it `from <unit-slug>`, so its ruling relay goes to that operator'
# I4: a held, routed question gets its relay again.
need 'one with a `routed <id>` line gets its ruling relay again'
# M9: only the resume ask asks for resends.
need '| Resume status ask (Phase 0) |'
need 'act on each only for what the ledger does not already show done'
need 'never hold a task waiting on its reply'
need 'Siblings may message each other by name, but nothing depends on it'
# Bands: the heartbeat is the next event; a stopped unit frees its slot.
need 'the next beat is the next event'
need 'its slot goes to the next unit'
need 'A restart or a relaunch keeps the unit'"'"'s status and its slot'
forbid 'start no wait: run `budget.sh` again at the next event'
# running was never set: it is not a status.
forbid 'planning, admitted or running'
# Resume of a launching unit keeps its assignment and finishes a sibling's hand-back steps (R2-1, R2-2).
need 'Keep its assignment as written, except that `Plan:` names a plan its own SDD workspace already holds'
need 'Launch no member of a family that a ruling still to be routed replaces'
need 'also finish Hand-back siblings, steps 3-4'
# The unrule conflict path files a real question and does not loop (R2-3).
need 'or the ledger has a `routed unrule-<id>` line'
need 'take its amendment out as current-state text'
need 'before anything else merges in Phase 0'
# Cut-work reverts get git's default subject whatever the config (R2-4).
need 'git -c revert.reference=false -C <package worktree> revert --no-edit'

# Jev section: bounce is retired; citation runs inside the adjudication fork.
grep -q '^## Optional Jev judgments' "$skill" \
  || { echo "FAIL: SKILL.md missing the Optional Jev judgments section"; exit 1; }
for pt in defect-class surface-route; do
  grep -qF "**$pt**" "$skill" || { echo "FAIL: SKILL.md never names Jev point $pt"; exit 1; }
done
for s in 'superpowers-jev:jev' 'jev record' 'jev ask defect-class' \
         'jev ask surface-route' \
         '"enabled": false'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: SKILL.md Jev section missing: $s"; exit 1; }
done
need 'Surface to your partner'
echo "PASS: SKILL.md structure"
