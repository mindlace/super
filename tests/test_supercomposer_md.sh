#!/bin/sh
# Structural checks for the supercomposer SKILL.md
set -e
skill="$(cd "$(dirname "$0")/.." && pwd)/plugins/supersonic/skills/supercomposer/SKILL.md"

test -f "$skill" || { echo "FAIL: supercomposer SKILL.md missing"; exit 1; }
head -1 "$skill" | grep -qx -- '---' || { echo "FAIL: no opening frontmatter delimiter"; exit 1; }
fm=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
printf '%s\n' "$fm" | grep -qx 'name: supercomposer' || { echo "FAIL: bad or missing name"; exit 1; }
keys=$(printf '%s\n' "$fm" | grep -c '^[a-z][a-z-]*:')
[ "$keys" -eq 2 ] || { echo "FAIL: frontmatter must have exactly name and description, found $keys keys"; exit 1; }
desc=$(printf '%s\n' "$fm" | sed -n 's/^description: //p')
case "$desc" in "Use when"*) ;; *) echo "FAIL: description must start with 'Use when'"; exit 1;; esac

for s in 'Hard rules' 'Phase C0' 'Phase C1' 'Phase C2' 'Phase C3' 'Phase C4' 'Phase C5' 'Red flags'; do
  grep -q "## .*$s" "$skill" || { echo "FAIL: supercomposer SKILL.md missing section: $s"; exit 1; }
done
# The load-bearing artifacts of the composition package must be named.
for t in 'Traceability table' 'Coverage table' 'delegation check' 'ledger'; do
  grep -qi "$t" "$skill" || { echo "FAIL: supercomposer SKILL.md never mentions: $t"; exit 1; }
done
# Composition ends at handoff; conduction must not start here.
grep -qF 'superconductor' "$skill" || { echo "FAIL: supercomposer SKILL.md never references superconductor"; exit 1; }
grep -qF 'supersonic:superconductor' "$skill" \
  || { echo "FAIL: supercomposer must hand off to supersonic:superconductor"; exit 1; }
for s in 'superpowers-jev:jev' 'jev ask citation' 'jev coverage' 'still runs every leg' 'jev record' 'only when the result is `confident`'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: supercomposer SKILL.md Jev points missing: $s"; exit 1; }
done
tr '\n' ' ' < "$skill" | tr -s ' ' | grep -qF 'jev ask citation --state <state file>' \
  || { echo "FAIL: supercomposer citation must ask with --state <state file>"; exit 1; }
for s in 'docs/superpowers/design/YYYY-MM-DD-HHMM-<topic>.html' 'docs/superpowers/specs/YYYY-MM-DD-<slug>-design.html' \
         'spec-format.md' 'tbl-traceability' 'tbl-interfaces' 'tbl-coverage'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: supercomposer SKILL.md missing HTML package text: $s"; exit 1; }
done
grep -qF -- '-<topic>.md' "$skill" && { echo "FAIL: supercomposer still names a .md design doc"; exit 1; }
grep -qF -- '-design.md`' "$skill" && { echo "FAIL: supercomposer still names a .md spec"; exit 1; }
# Package cutting: contracts first, write sets, row edges, the build graph, the partner's reasons.
flat=$(tr '\n' ' ' < "$skill" | tr -s ' ')
for s in 'Contracts' 'Write sets' 'build graph' 'Longest chain' 'names interface rows' "partner's reasons" 'never a spec' 'its own unit' 'as fine as the dependencies allow'; do
  printf '%s\n' "$flat" | grep -qF -- "$s" || { echo "FAIL: supercomposer SKILL.md missing: $s"; exit 1; }
done
if grep -qF 'Dependency order' "$skill"; then
  echo "FAIL: supercomposer SKILL.md still has a Dependency order section; order derives from edges"; exit 1
fi
printf '%s\n' "$flat" | grep -qF -- '-build-graph.md' \
  || { echo "FAIL: supercomposer SKILL.md must name the <design-file-stem>-build-graph.md path"; exit 1; }
for c in 'unit' 'implements (spec §)' 'writes' 'needs rows' 'produces rows others wait on'; do
  printf '%s\n' "$flat" | grep -qF -- "| $c |" || printf '%s\n' "$flat" | grep -qF -- "| \`$c\` |" \
    || { echo "FAIL: build graph table missing column: $c"; exit 1; }
done
# Checkpoint and one-shot forks replace the long-lived reappraisal session.
for s in 'composer-forks.md' '--fork-session' 'checkpoint' 'current state' 'Disk wins' 'never resumed in place' 'Longest chain:'; do
  printf '%s\n' "$flat" | grep -qF -- "$s" || { echo "FAIL: supercomposer SKILL.md missing: $s"; exit 1; }
done
for s in 'delta section' 'reappraisal session' 'reappraisal'; do
  if printf '%s\n' "$flat" | grep -qiF -- "$s"; then
    echo "FAIL: supercomposer SKILL.md still says: $s"; exit 1
  fi
done
grep -q '^## Composer forks' "$skill" || { echo "FAIL: supercomposer SKILL.md missing section: Composer forks"; exit 1; }
# composer-forks.md: four sections, each with its command line and cwd.
forks="$(dirname "$skill")/composer-forks.md"
test -f "$forks" || { echo "FAIL: supercomposer/composer-forks.md missing"; exit 1; }
section() { awk -v h="## $1" '$0==h{on=1; next} on && /^## /{exit} on{print}' "$forks" | tr '\n' ' ' | tr -s ' '; }
for h in 'Checkpoint' 'Adjudication fork' 'Merge-review fork' 'Build-graph fork'; do
  grep -qx "## $h" "$forks" || { echo "FAIL: composer-forks.md missing heading: ## $h"; exit 1; }
  body=$(section "$h")
  printf '%s\n' "$body" | grep -qw 'cwd' || { echo "FAIL: composer-forks.md ## $h never states cwd"; exit 1; }
  printf '%s\n' "$body" | grep -qF -- '--allowedTools="' \
    || { echo "FAIL: composer-forks.md ## $h must write --allowedTools=\"...\" (the flag is variadic)"; exit 1; }
  printf '%s\n' "$body" | grep -qF 'already in the package worktree' \
    || { echo "FAIL: composer-forks.md ## $h prompt must say it is already in the package worktree"; exit 1; }
  if [ "$h" = 'Checkpoint' ]; then
    printf '%s\n' "$body" | grep -qF -- '--fork-session' && { echo "FAIL: the checkpoint is not a fork"; exit 1; }
    printf '%s\n' "$body" | grep -qF -- '--output-format json' || { echo "FAIL: checkpoint must use --output-format json"; exit 1; }
    printf '%s\n' "$body" | grep -qF -- '## Checkpoints' || { echo "FAIL: checkpoint id must go to ledger ## Checkpoints"; exit 1; }
  else
    printf '%s\n' "$body" | grep -qF -- '--fork-session' || { echo "FAIL: composer-forks.md ## $h lacks --fork-session"; exit 1; }
    printf '%s\n' "$body" | grep -qF -- '--resume <checkpoint id>' || { echo "FAIL: composer-forks.md ## $h must resume <checkpoint id>"; exit 1; }
    printf '%s\n' "$body" | grep -qiF 'disk wins' || { echo "FAIL: composer-forks.md ## $h prompt must say disk wins"; exit 1; }
  fi
done
for h in 'Adjudication fork' 'Build-graph fork'; do
  section "$h" | grep -qF 'No "previously", no "changed from", no changelog' \
    || { echo "FAIL: composer-forks.md ## $h lacks the current-state phrase"; exit 1; }
done
adj=$(section 'Adjudication fork')
for s in '# Ruling <id>' 'Package commit: <sha|none>' 'Changes design: yes|no' 'Changes contract: yes|no' \
         '## Ruling' '## Re-read' '## Affected units' ': clarification' 'first task that no longer holds' \
         'jev ask citation --state <state file>'; do
  printf '%s\n' "$adj" | grep -qF -- "$s" || { echo "FAIL: adjudication fork missing: $s"; exit 1; }
done
# Every design change names the build-graph rows to rewrite or add; the build-graph fork may add rows.
for s in '## Build graph' '- new: <what the specs now need' 'running or not yet started'; do
  printf '%s\n' "$adj" | grep -qF -- "$s" || { echo "FAIL: adjudication fork missing: $s"; exit 1; }
done
bg=$(section 'Build-graph fork')
for s in 'new: <what>' 'none named' 'add the rows the specs need'; do
  printf '%s\n' "$bg" | grep -qF -- "$s" || { echo "FAIL: build-graph fork missing: $s"; exit 1; }
done
# The checkpoint's model: the most capable available, recorded for every fork to reuse.
printf '%s\n' "$flat" | grep -qF 'most capable model available' \
  || { echo "FAIL: C5 must say which model the checkpoint runs on"; exit 1; }
tr '\n' ' ' < "$forks" | tr -s ' ' | grep -qF 'The checkpoint runs on the most capable model available' \
  || { echo "FAIL: composer-forks.md must say which model the checkpoint runs on"; exit 1; }
qf=$(tr '\n' ' ' < "$forks" | tr -s ' ')
for s in '# Question <id> — from <name>' '## Question' '## What the package says' '## What I found' '## Options I see' '## Blocking'; do
  printf '%s\n' "$qf" | grep -qF -- "$s" || { echo "FAIL: composer-forks.md question format missing: $s"; exit 1; }
done
mr=$(section 'Merge-review fork')
for s in 'No drift @ <sha>' 'questions/merge-<unit-slug>-<short-sha>.md'; do
  printf '%s\n' "$mr" | grep -qF -- "$s" || { echo "FAIL: merge-review fork missing: $s"; exit 1; }
done
mr_tools=$(printf '%s\n' "$mr" | sed -n 's/.*--allowedTools="\([^"]*\)".*/\1/p')
[ -n "$mr_tools" ] || { echo "FAIL: merge-review fork has no --allowedTools list"; exit 1; }
case ",$mr_tools," in *,Edit,*|*'git commit'*|*'git add'*)
  echo "FAIL: merge-review fork is read-only on the package; tools were: $mr_tools"; exit 1;; esac
printf '%s\n' "$(section 'Build-graph fork')" | grep -qF 'Longest chain:' \
  || { echo "FAIL: build-graph fork must report Longest chain:"; exit 1; }
# No agent loads rulings/: the build-graph runner fills the unit names itself.
section 'Build-graph fork' | grep -qF 'rulings/' && { echo "FAIL: build-graph fork must not read rulings/"; exit 1; }
# Each prompt states its permission mode and tools; each tool list is the command's list.
for h in 'Checkpoint' 'Adjudication fork' 'Merge-review fork' 'Build-graph fork'; do
  body=$(section "$h")
  printf '%s\n' "$body" | grep -qF 'Your tools are exactly' \
    || { echo "FAIL: composer-forks.md ## $h prompt does not state its tools"; exit 1; }
  tools=$(printf '%s\n' "$body" | sed -n 's/.*--allowedTools="\([^"]*\)".*/\1/p')
  [ -n "$tools" ] || { echo "FAIL: ## $h has no --allowedTools list"; exit 1; }
  oldifs=$IFS; IFS=','
  for t in $tools; do
    IFS=$oldifs
    case "$t" in
      Bash\(*) cmd=$(printf '%s' "$t" | sed 's/^Bash(\(.*\):\*)$/\1/')
               printf '%s\n' "$body" | grep -qF -- "\`$cmd" \
                 || { echo "FAIL: ## $h prompt does not list allowed command: $cmd"; exit 1; } ;;
      *) printf '%s\n' "$body" | sed -n 's/.*Your tools are exactly\(.*\)/\1/p' | grep -qw -- "$t" \
           || { echo "FAIL: ## $h prompt does not list allowed tool: $t"; exit 1; } ;;
    esac
  done
  IFS=$oldifs
  if [ "$h" != 'Checkpoint' ]; then
    printf '%s\n' "$body" | grep -qF 'Permission mode acceptEdits' \
      || { echo "FAIL: ## $h prompt does not state its permission mode"; exit 1; }
  fi
done
# Forks that write the ledger declare it with --add-dir in its equals form.
for h in 'Adjudication fork' 'Merge-review fork'; do
  section "$h" | grep -qF -- '--add-dir="<ledger dir>"' \
    || { echo "FAIL: ## $h must pass --add-dir=\"<ledger dir>\""; exit 1; }
done
grep -qF -- '--add-dir <' "$forks" && { echo "FAIL: --add-dir must use the equals form"; exit 1; }
# A separate cd can silently not take effect: every command sets its launch dir with env -C,
# and nothing waits on the partner to add a directory.
for h in 'Checkpoint' 'Adjudication fork' 'Merge-review fork' 'Build-graph fork'; do
  section "$h" | grep -qF -- 'env -C "<package worktree>" claude -p' \
    || { echo "FAIL: ## $h command must launch with env -C \"<package worktree>\""; exit 1; }
done
# Every fork and the checkpoint run under beat.sh's time limit; output lines go to a file.
grep -qF 'sh <supersonic plugin dir>/skills/superconductor/beat.sh <ledger dir> fork <fork name>' "$forks" \
  || { echo "FAIL: <time limit> must be beat.sh's fork command"; exit 1; }
grep -qF 'stop-fork <fork name>' "$forks" || { echo "FAIL: composer-forks.md must name stop-fork"; exit 1; }
grep -qF 'perl -e' "$forks" && { echo "FAIL: the time limit lives in beat.sh, not inline perl"; exit 1; }
for h in 'Checkpoint' 'Adjudication fork' 'Merge-review fork' 'Build-graph fork'; do
  section "$h" | grep -qF -- '<time limit> env -C "<package worktree>" claude -p' \
    || { echo "FAIL: ## $h command must start with <time limit>"; exit 1; }
  section "$h" | grep -qF 'as a background Bash command' \
    || { echo "FAIL: ## $h must run as a background Bash command"; exit 1; }
done
for h in 'Adjudication fork' 'Merge-review fork' 'Build-graph fork'; do
  section "$h" | grep -qF -- '"$(cat <prompt file>)" > <ledger dir>/prompts/<fork name>.out 2>&1' \
    || { echo "FAIL: ## $h must write its output to <fork name>.out"; exit 1; }
done
printf '%s\n' "$flat" | grep -qF '(fork name `graph-all`)' || { echo "FAIL: C5 must name its build-graph fork"; exit 1; }
grep -qF 'No conversation found' "$forks" || { echo "FAIL: composer-forks.md must name the No conversation found failure"; exit 1; }
grep -qF '/add-dir' "$forks" && { echo "FAIL: composer-forks.md must not ask the partner to /add-dir"; exit 1; }
# C5 commits after branching land in the package worktree.
printf '%s\n' "$flat" | grep -qF 'git -C <package worktree>' \
  || { echo "FAIL: C5 must commit fixes in the package worktree"; exit 1; }
# C5 writes the ledger header lines the conductor's intake checks.
for s in '`Package worktree: <absolute path>`' '`Build graph: <build-graph path> @ <sha>`'; do
  printf '%s\n' "$flat" | grep -qF -- "$s" || { echo "FAIL: C5 must ledger the header line $s"; exit 1; }
done
desc_len=$(printf '%s' "$desc" | wc -c | tr -d ' ')
[ "$desc_len" -le 500 ] || { echo "FAIL: description is $desc_len chars (max 500)"; exit 1; }
echo "PASS: supercomposer SKILL.md structure"
