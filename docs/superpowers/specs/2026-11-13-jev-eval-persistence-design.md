# Jev: persist everything a shadow→on evaluation needs

Status: DRAFT. This is the discussion surface; edit inline. Open questions are marked **OPEN**.

## Why

On 2026-11-13 we evaluated about 5.8k shadow-mode Jev calls across 15 repos to decide which points to promote to `on`. The logs alone could not support that decision:

- **The inputs were gone.** Only `verify-stop` logs the state Jev judged. For `tier`, `report-evidence` and `severity`, adjudicators had to rebuild the inputs from `~/.claude/projects` transcripts by matching timestamps. Transcripts expire after 30 days by default: nothing from before June survives, and today's sample only worked because it was recent.
- **"Right" meant "agrees with Claude."** Claude's recorded verdicts turned out to be a biased ground truth. Blind adjudication reversed the picture for `verify-stop`: most of Jev's "wrong" blocks were right. It also showed that Claude's in-session `severity` verdicts anchor on the reviewer. The log can't tell an anchored in-session verdict from a blind label, and there was nowhere to store the adjudications.
- **The labels were for the wrong model.** All 518 labeled `verify-stop` calls were jev-1.13.0, and the 1706 calls on 1.14.0 had no labels at all. Nothing surfaced that.
- **The verify-stop window was distorted.** The verify-stop window was cut short by memory and notes edits. Real verification that came before such an edit disappeared, which made faithful reports look unverified.
- **Everything was hand-rolled.** Building blinded case files, sealing the answer key, scoring and aggregating across repos were all one-off scripts in a session scratchpad. They are now saved at `~/.claude/plugins/data/superpowers-jev-super/evals/2026-11-13/`.

Success: the next evaluation runs from data Jev itself persisted, with no transcript archaeology, using `jev` commands rather than one-off scripts. Its accuracy numbers say what the truth source was.

## Goals

1. **Every ask persists the exact state Jev saw.** This covers every point and every entry path: hooks, `--state <file>`, piped `--state -`, and `jev coverage`'s per-spec asks. Supersonic gets this for free, because all its points go through `jev ask`.
2. **Every call is linked to its context:** session id, transcript path, cwd, git HEAD and branch, and the plugin version.
3. **Every verdict says where it came from.** `record` entries get a `source` and an optional `rule_version`.
4. **Adjudication is a first-class part of the log.** Adjudications have their own entry type. `jev report` shows adjudicated accuracy next to plain agreement, and says which truth source each number uses.
5. **Blind labeling and adjudication are built in, for any point.** Building on persisted state, `jev label` works for every point, not just `verify-stop`. A new `jev adjudicate export|apply` pair produces blinded A/B case files with a sealed key and imports the rulings.
6. **Reports work across repos.** Each log dir registers itself in a global registry, and `jev report --all` aggregates across them, broken down by `model`.
7. **verify-stop gets a fixed window and a versioned rule.** Non-code edits no longer reset `commands_since_last_edit`. Rule v2, written for today's labeling run, ships in the plugin, and labels record which rule version they used.
8. **Today's results are kept.** The 2026-11-13 adjudications and the jev-1.14.0 blind labels are imported into the logs, with provenance, so the next evaluation starts from them.

## Non-goals

- Promoting any point to `on`. That is a separate decision, made from the data this produces.
- Changing any Jev question template. The one exception is the verify-stop `version` bump, because the state it is given changes.
- Measuring cost or rework per finished task. The 2026-04 fork lesson says that is the real metric for step-removing points. It needs task-outcome data from subagent-driven-development and superconductor, which is a bigger change, so it is deferred.
- Migrating the inline `state` entries already in the logs. They stay readable as they are.

## Anti-goals

- **`jev ask` getting slower or less reliable.** Persisting state is best-effort: any failure is swallowed, `ask` still exits 0, and the added cost stays under about 10 ms.
- **Evaluation data in git.** Logs, state blobs and eval dirs stay local and gitignored, as the log is today. State contains agent-written text.
- **Leaking the answer key into blind work.** Sealed keys live where `jev label` and `jev adjudicate export` never print them, and every case file says which files not to read.

## Approaches: storing state

| | Approach | Trade-off |
|---|---|---|
| A | Inline `state` log entries for every point, as verify-stop does today | Simplest. But the log grows about 2× and `read_entries` loads the whole file: sfhousing is already 12.8 MB, half of it inline verify-stop state. Each prompt-route state repeats the full skills list. |
| **B (pick)** | **Content-addressed, gzipped blobs at `<log dir>/states/<sha256[:2]>/<sha256>.json.gz`. The `call` entry carries `state_sha`.** | Keeps the log small and identical states dedupe. Costs one extra file write per ask. |
| C | SQLite (in the stdlib) | Better querying, but it is a migration plus a second storage format, and nothing needs queries that JSONL can't answer. |

My call is **B**. Builders may split large repeated parts, such as prompt-route's skills list, into their own blob referenced by sha. That is left to the builder.

## Design

### Log entries (schema additions)

- **`call`** gains:
  - `state_sha`
  - `ctx`: `{session_id, transcript_path, cwd, git_head, git_branch, plugin_version}`. Fields that can't be found are null.
  - Session id resolution:
    1. an explicit hook input;
    2. `CLAUDE_CODE_SESSION_ID`, which Claude Code exports to Bash;
    3. null.
  - `transcript_path` comes from the hook input. Without one it is derived as `~/.claude/projects/<munged cwd>/<session_id>.jsonl` only if that file exists.
  - **Logged paths go stale.** In the jev-1.14.0 sample, 51 of 75 logged paths no longer existed. In every case the session had run inside a `.claude/worktrees/<name>` checkout, and its transcript later lived under the main project's directory. Every reader therefore resolves transcripts through a `transcript.locate(session_id, hint)` helper: try the hint first, then glob `~/.claude/projects/*/<session_id>.jsonl`. `jev label` and `jev adjudicate export` emit the resolved path. This covers `recover-states` and anything else that opens a transcript later.
- **`record`** gains:
  - `source`: `in_session` (CLI `jev record`), `blind_label` (`jev label --apply`), `auto_hook` (prompt-route's Stop auto-record), or `import`.
  - `rule_version`: required for `blind_label`.
  - `labeler`: free text, for example `subagent:investigator`.
  - Older entries with no `source` are treated as `in_session`. The prompt-route ones are `auto_hook`, which can be inferred from the point.
- **`adjudication`** is new: `call_id`, `ts`, `item` (index for per-item points, null otherwise), `truth` (the verdict judged correct, in the point's verdict shape), `ruling` (`jev`, `claude`, `both_defensible`, or `undeterminable`), `rule_version`, `judge`, `reason`, and `batch` (the export batch id).
- `build_report`'s latest-record-wins rule applies within each `source`, never across sources. Adjudications never overwrite records.

### Registry

The first log write in a log dir appends its path to `~/.superpowers/jev/registry.json`, which is deduped and written under flock. `jev report --all` reads the registry and silently skips dirs that no longer exist.

### `jev report`

- `--truth in_session|blind|adjudicated|best`. The default is `best`: adjudication, then blind label, then in-session.
- Every column says which truth it used, and each row shows its truth mix, for example `adj 42 / blind 150 / in-session 300`.
- `--by model` splits each row by Jev model.
- A **`labels on current model`** column makes "the current model has no labels" visible.
- Retired points, such as `operator-tier`, are listed in a `RETIRED` constant and shown greyed out.

### `jev label <point>` (all points)

- **Listing.** It prints blind objects (`call_id`, `ts`, `state`, `ctx`) for unrecorded calls, or with `--sample N --stratify verdict,confident` for a stratified sample. Jev's verdict is never printed.
  - `--sample` picks among calls regardless of existing records.
  - The stratum sizes go to stderr, so rates can be reweighted.
- **Applying.** `--apply <file> --rule-version V --labeler L` validates the verdict shape for each point. Per-item points need one entry per item, in `state` order.
- **Rules ship with the plugin.** Labeling rules live in `plugins/superpowers-jev/rules/<point>.v<N>.md`. `jev label` prints the current rule path on stderr. Points without a rule file can still be labeled, but `--rule-version` is then `none`.

### `jev adjudicate`

- **`export`** writes a batch dir:
  - Command: `export <point> [--since] [--model] [--confident-only] [--sample N] --out <dir>`.
  - It picks calls where Jev's verdict and the chosen truth disagree. `--against blind|in_session` sets that truth; the default is `best` minus adjudication.
  - For per-item points, each disagreeing item becomes its own case.
  - Each case carries the state blob contents, `ctx`, and the two verdicts randomised as A and B.
  - Output files:
    - `cases.json`;
    - `README.md` with the rubric pointers and the "don't read" list;
    - the sealed key, at `<log dir>/sealed/<batch>.json`, outside `--out`.
- **`apply <results.jsonl> --batch B --judge J --rule-version V`** unseals the key and writes `adjudication` entries. Each results line is `{case, correct: A|B|both_defensible|undeterminable, reason}`.

### verify-stop window (gap e)

- **Which edits count.** In `builders/transcript.py` `stop_state`, an `Edit`/`Write`/`MultiEdit`/`NotebookEdit` call doesn't reset the window when its `file_path` matches an exclusion list. The list is:
  - `**/memory/**`, `MEMORY.md`, `**/.superpowers/**`, `~/.claude/**`;
  - `*.md` under `docs/`, `notes/`, `handoff*`, `*ledger*`, `*progress*`;
  - and `JEV_VERIFY_STOP_IGNORE`, which takes extra globs.
- **Window cap.** The window cap goes from 10 to 20 commands, so a long verification run is still in the window.
- **Evidence that isn't a Bash command.** Today the window holds only Bash calls. That leaves out the two kinds of evidence orchestrators actually use: subagent results (the implementer's or reviewer's hand-back, an Agent tool result) and reads of artifacts (Read of a review file). Rule v2 counts reading a review as verifying "passed review", so Jev can never see that evidence. Add `evidence_since_last_edit`: Agent/Task tool results, subagent hand-back messages, and Read results, each truncated to about 1.5 KB, with a 20 KB cap overall. It sits alongside `commands_since_last_edit`, which is unchanged for compatibility.
- **Version bump.** `questions/verify-stop.json` `version` goes to 2, because the state shape changes. `jev recover-states` uses the same function, so recovered states get the fix too.

### Rule v2

The rule written for the 2026-11-13 labeling run becomes `rules/verify-stop.v2.md`. It defines what counts as a claim, which evidence verifies which claim, and the window. The prose in `skills/jev/SKILL.md` and `skills/jev-gates/SKILL.md` is replaced by a pointer to it.

### Backfill (one-time, goal 8)

`jev import-eval <dir>` reads the 2026-11-13 eval dir and writes:
- `adjudication` entries, with batch `2026-11-13-r1` and `2026-11-13-r2`, judge `subagent:investigator`, and rule `verify-stop.v1` or `v2`;
- the `blind_label` records for the 150 jev-1.14.0 calls, with rule v2.

Each entry goes to the right repo's log via `call_id`. The command stays in the CLI, because future hand-run evals can use the same format. The eval dir itself moves to `~/.superpowers/jev/evals/2026-11-13/`.

### Docs

`skills/jev/SKILL.md` gets a short **Evaluating** section: `report --all --by model`, then `label --sample` for the current model, then `adjudicate export`, a subagent, `adjudicate apply`, and `report --truth best`. It also gives the promotion bar used on 2026-11-13: confident-wrong measured against adjudicated truth, with a stricter bar for points whose `on` behavior removes a step.

### Scoring with adjudications (my call)

- **Population.** Accuracy is computed over calls that have a label: a blind or in-session record, or `auto_hook` for prompt-route.
  - Per call, truth is the adjudication if one exists, otherwise the label.
  - If a disagreement was never adjudicated, the label stands. The report then shows an **`unresolved N`** count. When N > 0, accuracy against the label is a lower bound for Jev.
- **Rulings.**
  - `both_defensible` counts as agreement and is also reported in its own column. Its `truth` is `null`.
  - `undeterminable` is excluded and counted separately.
- **Sampling frame.** `label --sample` and `adjudicate export` write a `sample` entry: `batch`, the filter, `strata` with `{key: [population_size, n]}`, and the seed.
  - Records and adjudications carry `batch`.
  - With `--reweight`, the report weights per-stratum rates by population size. Unweighted is the default, and the report says which it used.
- **Splits.** `--by` takes `model`, `template_version`, `rule_version` or `source`, and they can be combined.
  - The "labels on current model" column means labels whose call has the current `model` **and** the current `template_version`. Labels made on v1 states don't count toward v2.

### Truth sources (my call)

- `--truth` takes `in_session`, `auto_hook`, `blind`, `adjudicated` or `best`.
- `best` uses adjudication, then blind, then in-session, then auto_hook.
- Legacy records with no `source` are `auto_hook` for prompt-route and `in_session` for everything else.
- Latest-wins applies per (call, source). A blind relabel under a newer rule supersedes an older blind label.

### Units for each compare kind (my call)

- An adjudication's `item` is the unit key: an integer index for `items` points, the question key for `picks` points (for example `"implementer"`), the requirement index for `coverage`, and null for `verdict`.
- `truth` is that unit's value only.
- `export` makes one case per disagreeing unit. A and B are the two unit values, so randomising them is the same for every compare kind.

### Legacy state and the ask path (my call)

- **One accessor.** `state.load(call_id)` prefers the `state_sha` blob and falls back to an inline `state` entry. Old calls stay labelable, which the 1.14.0 backfill needs.
- **New writes.** `recover-states` writes blobs from now on.
- **Failure paths.** Errored calls (invalid state, over budget, Jev unavailable) get a blob too, but it is capped: blobs over 256 KB are stored truncated, with `truncated: true` set.
- **`ctx` cost and source.**
  - `ctx` uses the hook's `cwd` when there is one, otherwise the process cwd.
  - `git_head` and `git_branch` come from reading `.git` directly: HEAD, plus the `gitdir` pointer for worktrees. There is no subprocess.
  - `main_repo_root`'s existing git call stays as it is.

### Registry details (my call)

- The registry path is `$JEV_REGISTRY` if set, otherwise `~/.superpowers/jev/registry.json`.
- When `JEV_LOG_DIR` is set and `JEV_REGISTRY` isn't, the run doesn't register at all, so tests never pollute the real registry.
- `jev register --scan <root>...` seeds the registry from existing `.superpowers/jev/log.jsonl` files. It is also run once during rollout over `~/Projects`.

### Blinding (my call)

- `label` and `export` include `ctx.transcript_path`, resolved through `locate`. Adjudicators need it, because Jev's state lacks briefs and diffs.
- Their README, and `label`'s stderr notice, tell the reader to ignore `jev record`/`jev label` text and Jev hook messages, and to stop at the call's `ts`.
- Labels are about what was true, not what Jev saw, so having extra context is intended.

### Backfill inputs (answered)

All backfill inputs are in `~/.claude/plugins/data/superpowers-jev-super/evals/2026-11-13/`:

- **Answer key.** `sealed/key.json` maps each case to its `call_id`, which A/B side was Jev, and `jev_confident`. The case-id prefix gives the point: `verify-stop-`, `report-evidence-`, `tier-`, `severity-`, `sevc-`, `vs14-`.
- **Case files.** `adj/cases-*.json` and `adj/label-vs14-*.json`. Severity cases carry `finding_index`, and tier cases carry the role in A/B.
- **Results.** `adj/results-*.jsonl` are adjudications. Every round-1 file was judged under rule v1, the prose in SKILL.md. `results-severity-confident.jsonl` is round 2. `adj/labels-vs14-*.jsonl` are blind labels under rule v2.
- **Rule text.**
  - `adj/verify-stop-rule-v2.md` is the v2 text, which becomes `rules/verify-stop.v2.md`.
  - `rules/verify-stop.v1.md` is the current SKILL.md prose, extracted as it is.
  - Other points start with rubric pointers only, and their rule version is `none`.
- **Repo lookup.** `call_id` → repo is found by scanning registered logs, after `register --scan`.
- **Copying.** `import-eval` copies the dir into `~/.superpowers/jev/evals/<date>/`; it doesn't move it.

## Constraints

- Python stdlib only, following the existing `lib/jevlib` layout.
- Tests: `sh tests/run.sh`, with new unittest files in `tests/jev/`.
- Bump `plugins/superpowers-jev/.claude-plugin/plugin.json` to 0.6.0. The marketplace pulls from GitHub, so the change takes effect only after merging to `main`.
- Supersonic needs no code change. Its skill prose may drop the `<state file>` hand-off advice where it was only there to keep state around.

## Left to the builder

- The blob module layout, and whether blob writes share the log's flock or use write-then-rename.
- The exact report column layout.
- Whether prompt-route's skills list gets split into its own blob.
- Glob matching details for the exclusion list.

## OPEN

1. **Transcript retention (outside this repo).** Transcripts are still the only record of context Jev didn't see, such as task briefs and full diffs. Today's adjudicators leaned on them. Setting `cleanupPeriodDays` to 365 in `~/.claude/settings.json` would keep them. That's your config, not the plugin's: do you want it?
2. **Scope check.** Goals 1–3, 6 and 7 are the persistence core. Goals 4, 5 and 8 build today's hand-rolled workflow into the tool, which is roughly half the work. My pick is to keep them, because otherwise the next evaluation repeats today's scripts. They could be split into a second PR.
