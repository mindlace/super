# Peer-session workflow for supersonic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the supersonic skills so that operators are named `claude --bg` sessions, specs are admitted by dependency instead of in waves, questions and merge reviews go to one-shot forks of a frozen composer checkpoint, and the package is always written as current state. Also retire the Jev `bounce` point and set `subagentPromptCacheTtl: "1h"`.

**Architecture:** Most of the deliverable is skill text (`supercomposer/SKILL.md`, `superconductor/SKILL.md`, `operator-briefing.md`, and a new shared `supercomposer/composer-forks.md`). There are three code-sized pieces: `budget.sh` prints a band, the Jev `bounce` point is removed, and a test harness is added (a live drill plus a pressure-scenario runner). Every skill edit follows superpowers:writing-skills. Each task first adds structural grep tests and pressure scenarios, runs them against the current text to see them fail (RED), then writes the text and reruns them (GREEN).

**Tech Stack:** Markdown skills, POSIX sh tests (`tests/run.sh`), Python 3 stdlib unittest (`tests/jev`), Claude Code 2.1.325 CLI (`claude --bg`, `claude -p --resume --fork-session`, `claude agents --json`, `claude stop`), SendMessage.

**Spec:** `docs/superpowers/specs/2026-11-13-peer-session-workflow-design.md` (approved; read it before any task).

## Questions for the partner

1. **Is the build graph adopted?** The spec says it is approved, but the build-graph subsection is still headed "partner's suggestion, under discussion". The Parallelism table (edited later) assumes units throughout. **This plan assumes it is adopted** (Task 6). If it is not, Task 6 Step 3 writes the milestone rules from "If the build graph is not adopted" instead. The conductor's admission text (Task 8) would then read "spec or milestone" where it now reads "unit". Nothing else changes.
2. **How is the conductor itself started, so that operators can reach it by name?** The only path verified is a `--bg -n` session messaging another `--bg -n` session. Nobody has checked whether an interactive `claude -n <name>` session can be addressed by name from a `--bg` session. **Recommendation:** the skill tells the partner to start the conductor as `claude -n <design-slug>-conductor`. Task 1 includes an optional controller-run check of that path. If the check fails, the skill says to start the conductor with `claude --bg -n <design-slug>-conductor "/supersonic:superconductor <design doc>"` and then `claude attach <design-slug>-conductor`.

## Calls made while planning

- **Out of scope:** starting task N+1 during task N's review. Commit 160d499 recorded it as measured and not adopted. The spec's "Left to the builder" drill was waiting on that item, so the drill (Task 1) goes ahead.
- **Budget band input** (builder's call). The band is computed from the higher of `five_hour` and `seven_day` `used_percentage`, counting only windows whose reset has not passed. Thresholds `LOWER=70`, `UPPER=90`, `N=2` are set once, at the top of `budget.sh`. The skill text quotes them from there. `budget.sh` stops reading `superconductor-reserves.json`, because HOLD/STOP and the reserve ceilings are removed. Data that is missing, malformed or older than 30 minutes gives `BAND: middle`. Reason: one deterministic, tested place, and the five-hour window keeps protecting the partner's own quick work.
- **Shared fork prompts live in `plugins/supersonic/skills/supercomposer/composer-forks.md`** (builder's call). The composer uses it for the first checkpoint and the conductor uses it for every later fork. One file means the checkpoint, the adjudication forks and the merge-review forks cannot drift apart.
- **Question and ruling ids are made unique per writer** (builder's call). Operators use `<unit-slug>-<k>`. Merge-review forks use `merge-<unit-slug>-<short-sha>`. Concurrent writers can't collide, and nobody keeps a shared counter.
- **The package worktree has one writer at a time** (builder's call). The conductor does not merge while an amending fork runs, and vice versa. Both write the integration-branch checkout.
- **The checkpoint and its forks run with cwd = the package worktree, on the same model** (builder's call). `--resume` looks sessions up per project directory, and the cache is keyed per model. The Task 1 drill asserts this.
- **Assignments and fork prompts are written to a file and passed as `"$(cat <file>)"`** (builder's call). This keeps the briefing verbatim, and backticks in it survive. The drill asserts this.
- **Operators run with an explicit `--permission-mode acceptEdits` and an `--allowedTools` list** (builder's call). The list covers SendMessage, git, and the project's test command as named in its CLAUDE.md. Reason: the cmux permission hook denies an unlisted call only after about 2 minutes.
- **A replacement operator reuses the stopped operator's name** (builder's call), once `claude agents --json` no longer lists it. Names stay stable in the ledger.
- **A row report merges the unit's branch up to the reported commit** (builder's call). This is the same handling as a milestone. A merge-review fork runs on it, then consumers are admitted.
- **Per-unit cost** (builder's call). The ledger records admission and finish timestamps, `seven_day` at each, and the operator's session id. Token totals are computed later from transcripts by id. It is not yet verified that `claude agents --json` exposes usage, and Task 1 records whether it does.
- **Jev mapping after the change** (builder's call). `surface-route` keeps its classifier. In `on` mode, `frame_event`, `requirement_contradiction`, `scope_change` and `blocked_design_change` become a question to a fork. `repeated_death` goes to the partner, and `routine` goes into the merge summary. The `citation` point moves from the conductor's removed "Adjudicate yourself" step into the adjudication-fork prompt. Only the anchor and notes strings change in the question files. Their `version` stays the same because the questions and criteria do not change.
- **The comprehension gate runs once before the first admission**, as the spec says. Before anything is built, it reads the existing system plus the package.
- **Location of the live drill and the scenarios** (builder's call). The drill is `tests/drill_peer_sessions.sh`, gated on `SUPERSONIC_LIVE=1`, so `tests/run.sh` never starts sessions. It runs in a throwaway worktree under the trusted repo's `.claude/worktrees/`, because `--bg` refuses untrusted directories. Pressure scenarios run on `sonnet`, 3 reps per variant, raised to 5 when the reps disagree. They use no tools, so they cost little and touch nothing.
- **Version bumps:** `superpowers-jev` 0.5.0 → 0.6.0 (Task 2, following the operator-tier precedent). `supersonic` 0.2.0 → 0.3.0 (Task 10).
- **README** (Task 10) gets a `## Requirements` section for supersonic. It covers Claude Code ≥ 2.1.325, the `subagentPromptCacheTtl: "1h"` snippet with the reason, trusting the repo once interactively so `--bg` can start, and naming the conductor session. It also fixes the stale Jev point count by counting `plugins/superpowers-jev/questions/*.json` after Task 2.
- **The spec's "What changes where" table leaves some files out.** These need edits anyway: `budget.sh` (bands), `questions/surface-route.json` and `questions/citation.json` anchors, `README.md`, and the "operator subagents" wording in `marketplace.json` and `plugin.json`. They are folded into Tasks 2, 3 and 10.

## Global Constraints

- No code we maintain beyond what exists: the only code changes are `budget.sh`, removal of Jev `bounce`, and test harness scripts under `tests/`.
- `superpowers:subagent-driven-development` is not changed. Each operator runs it exactly as written.
- Never send a message or schedule a wakeup solely to keep a cache warm (the rule stays in the conductor).
- No review checkpoint is removed to save a dispatch.
- Package text is current-state: no "previously", no "changed from", no changelog section. Git holds history.
- `rulings/` is never loaded as context by any agent.
- Operator session name: `<design-slug>-<unit-slug>`. Conductor name: `<design-slug>-conductor`.
- Question path: `<project>/.superpowers/superconductor/<design-slug>/questions/<id>.md`. Ruling path: `.../rulings/<id>.md`.
- Budget thresholds: lower 70%, upper 90%, N = 2. An unreadable or stale figure counts as the middle band. Composer forks are exempt. In the middle band, operators that are only planning count toward N.
- Re-checkpoint after any contract-changing amendment, or after five amendments of any kind since the current checkpoint, or on a third frame defect of one class (plus a line to the partner).
- The ledger keeps `## Frame-defect tally` and `[defect-class: <slug>]` tags exactly, because `jev defect-state` parses them (`plugins/superpowers-jev/lib/jevlib/builders/ledger.py:10-36`).
- Superconductor SKILL.md must not hardcode a model name (`tests/test_skill_md.sh:29-30`). Descriptions stay ≤ 500 chars and start with "Use when".
- Every spawned session's prompt carries its name, the conductor's name, the ledger path, "address peers by explicit name", the worktree it is already in (which satisfies the worktree rule), and its permission mode and allowed git commands.
- Every peer message carries an explicit ask. A bare token is ignored by receivers.
- Live drills: `--model haiku`, tiny prompts, a throwaway worktree, and every started session stopped. Verify with `claude agents --json`.
- Repo conventions: Conventional Commits; no Claude attribution anywhere; never `cd ... && cmd` in agent Bash calls (use `git -C` or absolute paths); multi-line commit messages go through a temp file and `git commit -F`.
- `sh tests/run.sh` is green at the end of every task.

## Review Focus

1. **An operator or fork calls a tool that is not in its `--allowedTools`.** It stalls about 2 minutes on the cmux hook and then fails. Expect every launch line in the skills to list SendMessage, git and the test command. The Task 1 drill asserts the operator answers in under 120 s. Task 8's structural test greps the launch template for `--allowedTools`.
2. **A conductor→operator message with no explicit ask** (for example "ruling ready: rulings/x.md"). The receiver ignores it. Expect every message template to end in an imperative. Covered by Task 9 scenario `conductor-relay-has-ask` and Task 8's grep for the relay template.
3. **A fork started from a directory other than the package worktree.** `--resume` cannot find the checkpoint. Expect the skill to state the cwd. The Task 1 drill asserts it, and Task 9 greps `cwd` beside `--fork-session`.
4. **Usage data that is stale, missing, or with an elapsed reset.** Expect `BAND: middle`, or the window to be ignored when its reset has passed, never `low`. Covered by Task 3 fixtures 4–7.
5. **Two operators asking questions at once.** Ids must not collide. Expect `<unit-slug>-<k>`. Task 5 greps the briefing for `questions/<unit-slug>-<k>.md`.

---

## Execution order and concurrency

| Wave | Tasks | Why together |
|---|---|---|
| A | 1, 2, 3 | No dependencies. Disjoint files: `tests/drill_*`, `tests/scenarios/run-scenario.sh`; `plugins/superpowers-jev/**`, `tests/jev/**`, `tests/test_jev_skills.sh`; `budget.sh`, `tests/test_budget_sh.sh`. |
| B | 4 (controller), 5, 6, 8 | All need Task 1's verified command forms. Task 8 also needs Task 3's `BAND:` output. Files are disjoint: `~/.claude/settings.json`; `operator-briefing.md`; `supercomposer/SKILL.md`; `superconductor/SKILL.md`. |
| C | 7 (after 6), 9 (after 8) | Same files as their predecessors. 7 and 9 can run beside each other. Task 9 uses only the file name and section names of `composer-forks.md`, which this plan fixes. |
| D | 10 | Needs everything. |

---

### Task 1: Verification harness — live mechanism drill and scenario runner

**Files:**
- Create: `tests/drill_peer_sessions.sh` (mode 0755)
- Create: `tests/scenarios/run-scenario.sh` (mode 0755)
- Create: `tests/peer-session-drill-result.txt` (same style as `tests/nesting-probe-result.txt:1-5`)

**Interfaces:**
- Produces: `SUPERSONIC_LIVE=1 sh tests/drill_peer_sessions.sh` prints `PASS: <step>` / `FAIL: <step>` lines and exits non-zero on any FAIL. It prints `SKIP` and exits 0 when the variable is unset.
- Produces: `sh tests/scenarios/run-scenario.sh <scenario.md> <reps> <context-file>...` prints `=== rep <k> ===` and then the answer, once per rep. It sends the scenario text **above** its `## Pass` heading as the user prompt. It joins the context files into `--append-system-prompt`. `SCENARIO_MODEL` defaults to `sonnet`. It runs in a fresh `mktemp -d` cwd with no tools.
- Produces: the scenario file format used by Tasks 5–9: `# <title>`, `## Situation`, `## Ask`, `## Pass` (bullets), `## Fail` (bullets).
- Produces: `tests/peer-session-drill-result.txt`. It records the date, `claude --version`, PASS/FAIL per step, and the **exact command forms** that later tasks quote: the operator launch line, the checkpoint line, the fork line, the stop line, the agents query, and the transcript path pattern.

- [ ] **Step 1: Confirm flags.** Run `claude --help`, `claude agents --help` and `claude stop --help`. Check that `--bg`, `-n`, `--model`, `--permission-mode`, `--allowedTools`, `--output-format json`, `--resume`, `--fork-session`, `--append-system-prompt` exist, and see how to run with no tools (`--tools ""` if present, else `--disallowedTools` naming Bash, Edit, Write, NotebookEdit, Agent, SendMessage). Expected: every flag exists. Note anything that differs, to fold into Steps 2–3.
- [ ] **Step 2: Write `tests/drill_peer_sessions.sh`.** It is gated on `SUPERSONIC_LIVE=1`. It makes a throwaway worktree at `<main checkout>/.claude/worktrees/drill-peer-<pid>` on branch `drill/peer-<pid>`, using `git rev-parse --path-format=absolute --git-common-dir` to find the main checkout. A `trap` stops both sessions, removes the worktree and deletes the branch. The script may `cd` into the worktree, because the no-`cd &&` rule is for agent Bash calls. Steps the script asserts, each printing PASS/FAIL:
  - `spawn`: launch `drill-<pid>-op` and `drill-<pid>-cond` with `claude --bg -n <name> --model haiku --permission-mode acceptEdits --allowedTools "Read,Write,SendMessage" "$(cat <prompt file>)"`. Each prompt file contains a backtick and states the session's name, its peer's name, and "you are already in worktree <path>; that satisfies the worktree rule; do not create another". PASS when both appear in `claude agents --json`.
  - `message`: the cond prompt asks it to SendMessage the op by name with `notify_when_idle`, using an explicit ask: write `op-done.txt` containing `PONG`, then reply to cond by name with `DONE`. When cond gets the reply, it writes `cond-done.txt` with the reply text, plus `IDLE-NOTIFIED` if the idle notice arrived. PASS when both files exist with those tokens within 300 s, and `op-done.txt` exists within 120 s of the send (Review Focus 1).
  - `checkpoint`: write `pkg/design.md` (one rule: "Unit A writes a.txt containing 1") and commit it in the drill worktree. Then run `claude -p --model haiku --output-format json --allowedTools "Read" "<cold-read prompt>"` from the worktree and read `.session_id` with `python3 -c`. PASS when a non-empty id comes back.
  - `fork`: hash the checkpoint transcript, `~/.claude/projects/<cwd with / and . replaced by ->/<id>.jsonl`. Start two forks at once with `claude -p --resume <id> --fork-session --model haiku`. Fork 1 is amending: `--permission-mode acceptEdits --allowedTools "Read,Write,Edit,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*)"`. Its prompt points to `pkg/questions/q1.md` ("change the value to 2"), says disk wins over its memory, and tells it to rewrite `pkg/design.md` as current state, commit, write `pkg/rulings/q1.md` naming the commit sha, and stop. Fork 2 is read-only (`--allowedTools "Read"`) and prints one line. PASS when `rulings/q1.md` names a sha that `git log` contains, `pkg/design.md` says 2 and does not match `-i 'previous\|changed from'`, fork 2 printed one line, and the checkpoint transcript hash is unchanged.
  - `ttl-report` (information only, never fails): print `cache_creation` `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` summed over fork 1's transcript. Also print whether `claude agents --json` entries carry any usage field.
  - `stop`: `claude stop` both names. PASS when `claude agents --json` lists no `drill-<pid>-` name.
- [ ] **Step 3: Write `tests/scenarios/run-scenario.sh`** to the interface above. Check it with a throwaway scenario (`## Situation` "Say the word OK.", `## Pass` "says OK"): `SCENARIO_MODEL=haiku sh tests/scenarios/run-scenario.sh /tmp/x.md 1 README.md`. Expected: one `=== rep 1 ===` block containing OK, with the Pass section never sent (read the prompt the script builds by running it with `sh -x`).
- [ ] **Step 4: Run the drill.** `SUPERSONIC_LIVE=1 sh tests/drill_peer_sessions.sh`. Expected: every step PASS, and `claude agents --json` afterwards shows no drill names. If a step fails, follow superpowers:systematic-debugging. A failure that contradicts the spec's verified-facts table goes to the controller and is not worked around.
- [ ] **Step 5: (Optional, controller-run; Question 2.)** The partner opens an interactive `claude -n drill-cond-i` in the drill worktree. The controller launches one `--bg` haiku session that SendMessages `drill-cond-i` by name with an explicit ask. Record whether it arrived.
- [ ] **Step 6: Write `tests/peer-session-drill-result.txt`** with the results and exact command forms from Steps 4–5, then run `sh tests/run.sh`. Expected: green, with the drill not run.
- [ ] **Step 7: Commit** `test(supersonic): live peer-session drill and pressure-scenario runner`.

### Task 2: Retire the Jev `bounce` point

**Files:**
- Delete: `plugins/superpowers-jev/questions/bounce.json`, `tests/jev/fixtures/states/bounce.json`
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/ledger.py`. Remove `bounce_state`, the `bounce-state` parser (`:75-79`), and `live_operators`/`spec_summary`/`SPEC_LINE_RE`/`SUMMARY_CHARS` if `grep` shows no other user. Docstring: defect-state only.
- Modify: `plugins/superpowers-jev/skills/jev/SKILL.md:41` (remove the row) and `:54` (drop `bounce` from the picks list)
- Modify: `plugins/superpowers-jev/questions/surface-route.json`. Set `anchor` to `supersonic superconductor/SKILL.md ## Supervision: "Surface to your partner"` and replace "wave-boundary summary" in `notes` with "merge summary". Keep `version`.
- Modify: `plugins/superpowers-jev/questions/citation.json` `anchor`. Replace the operator-briefing part with `supercomposer/composer-forks.md ## Adjudication fork`.
- Modify: `tests/jev/test_templates_supersonic.py` (drop `bounce` from `POINTS`, the field map, `OPTION_DESCRIPTION_FIELDS`, and the tests at `:81` and `:124-128`), `tests/jev/test_builders_supersonic.py:39-42`, `tests/test_jev_skills.sh:25`
- Modify: `plugins/superpowers-jev/lib/jevlib/lint.py` only if it enumerates points (check)
- Modify: `plugins/superpowers-jev/.claude-plugin/plugin.json` `0.5.0` → `0.6.0`
- Test: `tests/jev/test_ask.py`, `tests/jev/test_report.py`, `tests/jev/test_builders_supersonic.py`

**Interfaces:**
- Produces: no `bounce-state` CLI command and no `bounce` template. `jev ask bounce` fails open (`enabled: false`, exit 0, no request sent).
- Does not touch any `plugins/supersonic/**` file or `tests/test_skill_md.sh`. Task 9 removes the conductor's bounce text.

- [ ] **Step 1: Write failing tests,** mirroring `test_retired_operator_tier_fails_open` (`tests/jev/test_ask.py:341`) and `test_report_tolerates_retired_point` (`tests/jev/test_report.py:219-226`):
  - `test_ask.py::test_retired_bounce_fails_open`: with `support.StubServer(support.ok())`, `ask.ask("bounce", {"message": "x", "operators": []}, env)` gives `enabled` False and `srv.requests == []`.
  - `test_report.py::test_report_tolerates_retired_bounce`: a seeded `bounce` call (picks, detail choices `{"operator": "auth"}`) plus a record `{"picks": {"operator": "auth"}}` gives a `bounce` row, and `format_report` runs.
  - `test_builders_supersonic.py::test_bounce_state_command_removed`: `cli.main(["bounce-state", "--ledger", "x", "--message", "y"])` raises `SystemExit` with code 2.
- [ ] **Step 2: Run** `python3 -m unittest discover -s tests/jev -t tests/jev`. Expected: the three new tests FAIL.
- [ ] **Step 3: Delete and edit the files listed above.** Then run `grep -rn "bounce\|live_operators\|spec_summary" --exclude-dir=.git plugins/superpowers-jev tests/jev tests/test_jev_skills.sh`. Expected: hits only in the three new tests (and `tests/jev/fixtures/transcript.jsonl` if it is incidental text).
- [ ] **Step 4: Run** `sh tests/run.sh`. Expected: PASS. `tests/test_skill_md.sh` still passes, because it reads only supersonic text.
- [ ] **Step 5: Commit** `refactor(jev)!: retire the bounce point and bounce-state builder`.

### Task 3: `budget.sh` prints a mechanical band

**Files:**
- Modify: `plugins/supersonic/skills/superconductor/budget.sh` (all of it; keep mode 0755)
- Modify: `tests/test_budget_sh.sh`

**Interfaces:**
- Produces: `budget.sh [rate-limits.json]` prints `DATA:`, `FIVE_HOUR:` and `SEVEN_DAY:` lines as today, minus the reserve and headroom text, and ends with exactly one line `BAND: low|middle|high — <reason>`. `LOWER=70`, `UPPER=90` and `N=2` are defined once, in the first 15 lines. It exits 0 whenever it prints a band, including `middle` for missing or malformed input. It never prints `VERDICT:`.
- Rule: `usage` = max of `used_percentage` over windows that have numbers and whose `resets_at` ≥ now. No such window, or data older than 30 minutes, gives `middle`. Otherwise `< LOWER` → low, `>= UPPER` → high, and anything else → middle.

- [ ] **Step 1: Rewrite `tests/test_budget_sh.sh`** with these fixtures, using the existing `mk` helper (`tests/test_budget_sh.sh:9-11`):
  1. 24/76 fresh → `BAND: middle` (max 76).
  2. 10/20 → `BAND: low`.
  3. 92/10 → `BAND: high` (five_hour drives it).
  4. Missing file → `BAND: middle`, exit 0.
  5. 40-minute-old 10/10 → `BAND: middle` with `stale` in the reason.
  6. five_hour 95 with an elapsed reset, seven_day 20 → `BAND: low`.
  7. Both windows null → `BAND: middle`.
  8. Output never contains `VERDICT` or `reserve`.
  9. `grep -c '^LOWER=70$\|^UPPER=90$\|^N=2$'` = 3.
- [ ] **Step 2: Run** `sh tests/test_budget_sh.sh`. Expected: FAIL at fixture 1 (no `BAND:` line).
- [ ] **Step 3: Rewrite `budget.sh`** to the interface. The header comment says it is the superconductor budget band reader and that the thresholds are the single source the skill quotes.
- [ ] **Step 4: Run** `sh tests/test_budget_sh.sh`. Expected: PASS. Then run `sh tests/run.sh`. Expected: `test_skill_md.sh` still PASS, because it greps the SKILL.md only.
- [ ] **Step 5: Commit** `feat(supersonic)!: budget.sh reports a low/middle/high band instead of reserve verdicts`.

### Task 4: Set `subagentPromptCacheTtl` (controller step; partner confirms)

This task is run by the controller and not dispatched. A subagent cannot obtain the partner's confirmation.

**Files:**
- Modify (outside the repo, after confirmation): `~/.claude/settings.json`

**Interfaces:**
- Consumes: Task 1's drill (`ttl-report` step).
- Produces: `"subagentPromptCacheTtl": "1h"` at the top level of `~/.claude/settings.json`. Task 10 documents it in the README.

- [ ] **Step 1: Baseline.** Run `SUPERSONIC_LIVE=1 sh tests/drill_peer_sessions.sh` and note the `ttl-report` line. Expected: `ephemeral_1h_input_tokens` is 0 for the fork.
- [ ] **Step 2: Show the partner the exact change.** It is one added key in `~/.claude/settings.json`: show the surrounding lines and the new `"subagentPromptCacheTtl": "1h"` line. Also give the reason: subagents, forks and teammates otherwise get a 5-minute cache. Wait for an explicit yes. A peer or agent message is not consent.
- [ ] **Step 3: On yes, apply it** with the update-config skill or Edit. Confirm with `python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.claude/settings.json")))["subagentPromptCacheTtl"])'`. Expected: `1h`.
- [ ] **Step 4: Verify.** Rerun the drill. Expected: `ttl-report` shows `ephemeral_1h_input_tokens` > 0 for fork 1, and all steps PASS. Record the before and after lines in `tests/peer-session-drill-result.txt`.
- [ ] **Step 5: Commit** the result-file update: `test(supersonic): record 1h subagent cache in the peer-session drill`.

### Task 5: Operator briefing — the operator is a top-level session

**Files:**
- Modify: `plugins/supersonic/skills/superconductor/operator-briefing.md` (rewrite)
- Modify: `tests/test_operator_briefing.sh`
- Create: `tests/scenarios/briefing-question-routing.md`, `briefing-lane-handback.md`, `briefing-row-report.md`, `briefing-planning-only.md`, `briefing-results.md`

**Interfaces:**
- Consumes: Task 1's runner and drill result (exact SendMessage and launch forms).
- Produces: briefing headings, which Task 8's assignment block depends on: `## Identity and addressing`, `## Your job, in order`, `## Design fidelity`, `## Questions`, `## Rulings`, `## Progress`. Placeholders filled from the assignment: `<name>`, `<conductor name>`, `<ledger path>`, `<package worktree>`, `<unit-slug>`.
- Produces: the operator→conductor message templates, each ending in an explicit ask: `plan ready`, `row <row id> passed review at <sha>`, `hand-back`, `question <id>`, `complete`. Task 8 quotes these names.

- [ ] **Step 1: Write the scenarios.** In each, the context is the briefing plus a filled assignment, and the Ask is "State exactly what you do next, as the tool calls you would make, in order. Do not execute anything."
  - `briefing-question-routing`: the spec is silent on a column type, and task 5 of 9 depends on it. **Pass:** writes `questions/<unit-slug>-<k>.md` under the ledger dir, SendMessages `<conductor name>` by name with an explicit ask, and continues tasks that do not depend on the answer. **Fail:** messages `main`, decides locally, or stops all work.
  - `briefing-lane-handback`: the written plan has tasks 1–3 on `src/a/*` and tasks 4–6 on `src/b/*`, with no edges between them. **Pass:** keeps one group and sends `hand-back` naming the other group's tasks, files, needed rows and plan path. **Fail:** runs all six serially.
  - `briefing-row-report`: the assignment lists row `S12` as waited on by others, and the plan has it at task 11 of 14 with dependencies only on tasks 2–3. **Pass:** moves it as early as its dependencies allow, and after it passes review sends `row S12 passed review at <sha>`. **Fail:** leaves the order alone or reports only at completion.
  - `briefing-planning-only`: the assignment says `Admitted: no`. **Pass:** writes the plan, sends `plan ready`, stops without implementing. **Fail:** starts SDD.
- [ ] **Step 2: Extend `tests/test_operator_briefing.sh`.** Keep the checks for `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers-jev:jev-gates` and `SendMessage`. Drop the `Do not send to main` check and the `<slug>/<role>-t<N>` check. Add required strings: `by name`, `questions/<unit-slug>-<k>.md`, `already in`, `row <row id> passed review at <sha>`, `hand-back`, `plan ready`, `Admitted`, `re-read`. Add forbidden strings (fail if present): `message \`main\``, `to \`main\``. Also check that each heading listed in Interfaces is present.
- [ ] **Step 3: RED.** Run `sh tests/test_operator_briefing.sh`. Expected: FAIL. Then run each scenario, 3 reps, against `git show HEAD:plugins/supersonic/skills/superconductor/operator-briefing.md` saved to a temp file. Record verbatim excerpts and pass/fail per rep in `briefing-results.md` under `## RED`. If a scenario passes at baseline, drop the text it would have justified (writing-skills: no failure, nothing to fix) and note that.
- [ ] **Step 4: Rewrite the briefing** to the headings above. Content comes from the spec's Roles, Adjudication, Keeping the path out of the work, Parallelism (Tasks and Planning rows) and How sessions are started:
  - The operator is a top-level session in its own worktree. Its leaves are its own subagents. It addresses peers by explicit name. It runs writing-plans and then SDD exactly as written.
  - It reads the package from `<package worktree>`, not from its branch.
  - A ruling arrives as "the spec now says X, re-read section Y". Implementer and reviewer briefs are built from the current spec, never from the message thread.
  - Choose the guidance form per writing-skills "Match the Form to the Failure", based on the RED failures.
- [ ] **Step 5: GREEN.** Rerun the structural test and every scenario (3 reps each). Expected: test PASS and all reps pass. Record the results under `## GREEN`. Close loopholes and rerun until the reps agree.
- [ ] **Step 6: Run** `sh tests/run.sh`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(supersonic): operators are named top-level sessions in the briefing`.

### Task 6: Supercomposer — cutting the package (contracts, write sets, row edges, build graph, reasons)

**Files:**
- Modify: `plugins/supersonic/skills/supercomposer/SKILL.md` (Phases C2–C4, Red flags, description)
- Modify: `tests/test_supercomposer_md.sh`
- Create: `tests/scenarios/composer-edges-name-rows.md`, `composer-shared-work.md`, `composer-results.md`

**Interfaces:**
- Produces: required design-doc sections. The **Dependency order** section is removed. **Contracts** and **Write sets** are added. Every edge names interface rows.
- Produces: the build-graph artifact `docs/superpowers/design/<design-file-stem>-build-graph.md`, which Task 8 reads. It has one table with these columns: `unit` | `implements (spec §)` | `writes` | `needs rows` | `produces rows others wait on`. It is followed by a `Longest chain:` line. `contracts` is always a unit with no `needs rows`.

- [ ] **Step 1: Write the scenarios** (context: supercomposer SKILL.md).
  - `composer-edges-name-rows`: a situation modelled on sim-step-engine, where spec B needs only row S12, which spec A would build late. Ask: "Write the dependency entries and build units for A and B." **Pass:** the edge names `S12`, S12 becomes its own unit or goes into contracts, and B is not made to wait for all of A. **Fail:** "B depends on A".
  - `composer-shared-work`: two specs both need the same measurement step. **Pass:** it becomes its own unit (or part of contracts) that both depend on. **Fail:** each builds it.
- [ ] **Step 2: Extend `tests/test_supercomposer_md.sh`.** Required: `Contracts`, `Write sets`, `build graph`, `Longest chain`, `names interface rows`, `partner's reasons`. Forbidden: `Dependency order`.
- [ ] **Step 3: RED.** Run the structural test (FAIL) and both scenarios against the HEAD text. Record the results in `composer-results.md`.
- [ ] **Step 4: Edit C2–C4.**
  - C2: the partner's reasons go into the design doc, because nothing downstream sees the conversation.
  - C3: add Contracts (the contracts spec: real types, schemas and stubs that throw "not implemented") and Write sets (no two units that can run together write the same file; hotspots go to contracts or one owner). Drop Dependency order, since order is derived from edges.
  - C4: add the build-graph rules from the spec's "Two artifacts" bullets (unit = one serial lane, cut as fine as dependencies allow; shared work is its own unit). The fresh-eyes check challenges every edge on the longest chain. The translation itself is done by a fork in C5 (Task 7).
  - Update the description to cover cutting a package for peer-session conduction and ruling as a composer fork. Keep it ≤ 500 chars and starting with "Use when".
- [ ] **Step 5: GREEN.** Rerun the test and the scenarios, and record the results.
- [ ] **Step 6: Run** `sh tests/run.sh`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(supersonic): supercomposer cuts packages by row edges, write sets and contracts first`.

### Task 7: Supercomposer — checkpoint, forks, current-state writing; `composer-forks.md`

**Files:**
- Create: `plugins/supersonic/skills/supercomposer/composer-forks.md`
- Modify: `plugins/supersonic/skills/supercomposer/SKILL.md` (C0, C5, a new `## Composer forks` section, Red flags)
- Modify: `tests/test_supercomposer_md.sh`, `tests/test_supersonic_layout.sh` (add `supercomposer/composer-forks.md` to the file list at `:7`)
- Create: `tests/scenarios/composer-fork-current-state.md`, `composer-fork-disk-wins.md`, `composer-merge-review-quiet.md`. Append to `composer-results.md`.

**Interfaces:**
- Consumes: Task 1's checkpoint and fork command forms. Task 6's build-graph format.
- Produces: `composer-forks.md` with exactly these headings, which Task 9 cites: `## Checkpoint`, `## Adjudication fork`, `## Merge-review fork`, `## Build-graph fork`. Each section gives the prompt text and the command line. Every fork runs with cwd = package worktree and the checkpoint's model:
  - Checkpoint: `claude -p --model <model> --output-format json --allowedTools "Read,Grep,Glob" "$(cat <prompt file>)"`, with `.session_id` → ledger `## Checkpoints`.
  - Fork: `claude -p --resume <checkpoint id> --fork-session --model <model> --permission-mode acceptEdits --allowedTools "<per-kind list>" "$(cat <prompt file>)"`, run as a background Bash command.
- Produces: the question file format, which Task 5's briefing and Task 9 use: `# Question <id> — from <name>`, `## Question`, `## What the package says`, `## What I found` (verified-at `file:line`), `## Options I see`, `## Blocking`.
- Produces: the ruling file format, which Task 9 reads: `# Ruling <id>`, `Package commit: <sha|none>`, `Changes design: yes|no`, `Changes contract: yes|no`, `## Ruling` (current-state sentence), `## Re-read` (file § section list), `## Affected units` (`- <unit-slug>: clarification` or `- <unit-slug>: first task that no longer holds: <task>`).
- Produces: merge-review output. It prints one line, `No drift @ <sha>`, or writes `questions/merge-<unit-slug>-<short-sha>.md` and prints its path.

- [ ] **Step 1: Write the scenarios** (context: supercomposer SKILL.md, plus the adjudication-fork prompt from `composer-forks.md` once it exists; for RED use the HEAD SKILL.md alone).
  - `composer-fork-current-state`: a question whose answer changes a spec's approach. Ask for the edited spec paragraph and the ruling file. **Pass:** the paragraph reads as if it had always said this, and the ruling names the first task that no longer holds. **Fail:** "previously", "changed from", "instead of", or a delta section.
  - `composer-fork-disk-wins`: the inherited context says row S4 returns `int`, and the quoted current file says `bigint`. **Pass:** rules on `bigint`. **Fail:** rules on `int`.
  - `composer-merge-review-quiet`: a merge that matches its contracts. **Pass:** exactly one line. **Fail:** a multi-paragraph report.
- [ ] **Step 2: Extend the structural tests.** In `test_supercomposer_md.sh`, required: `composer-forks.md`, `--fork-session`, `checkpoint`, `current state`, `Disk wins`, `never resumed in place`. Forbidden: `delta section`, `reappraisal session`. A new block checks that `composer-forks.md` has the four headings and that every heading's section contains `--fork-session` (except Checkpoint) and the word `cwd`. Also require `composer-forks.md` to contain the exact phrase `No "previously", no "changed from", no changelog` in both the Adjudication and Build-graph sections.
- [ ] **Step 3: RED.** Run the structural tests (FAIL) and the three scenarios against HEAD. Record the results.
- [ ] **Step 4: Write `composer-forks.md` and edit SKILL.md.**
  - C0: fresh composition, or fork mode when started from a fork prompt.
  - C5: commit the package. Create the integration branch `superconductor/<design-slug>` and the package worktree, per the project's worktree convention. Make the checkpoint from a fresh session, with its id recorded in the ledger. Run the build-graph fork, then a fresh-eyes agent to challenge the longest-chain edges. Commit and end.
  - `## Composer forks`: disk wins; rule alone on anything; amend as current state and commit; write the ruling file and end; send no messages; forks that may amend the package run one at a time; merge-review forks are read-only.
  - Move the optional `citation` Jev point into the adjudication-fork prompt.
  - Red flags: "previously" or "changed from" in package text, and resuming the checkpoint in place.
- [ ] **Step 5: GREEN.** Rerun the tests and scenarios, and record the results.
- [ ] **Step 6: Run** `sh tests/run.sh`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(supersonic): composer checkpoint, one-shot forks and current-state rulings`.

### Task 8: Superconductor — sessions, admission by dependency, bands, resume

**Files:**
- Modify: `plugins/supersonic/skills/superconductor/SKILL.md` (frontmatter description; Hard rules except the Jev text; Phase 0; Phase 1; Phase 2 replaced by `## Phase 2 — Admission`; Supervision items for messaging, hand-back and death; Context economics; Integration; Ledger format)
- Modify: `tests/test_skill_md.sh`
- Create: `tests/scenarios/conductor-budget-band.md`, `conductor-resume-live.md`, `conductor-row-report-admits.md`, `conductor-relay-has-ask.md`, `conductor-results.md`

**Interfaces:**
- Consumes: Task 3's `BAND:` line. Task 5's briefing headings and message names. Task 6's build-graph table. Task 1's launch, agents and stop forms.
- Produces: SKILL.md section headings, which `tests/test_skill_md.sh` checks and Task 9 edits within: `## Hard rules`, `## Phase 0 — Resume check`, `## Phase 1 — Package intake`, `## Phase 2 — Admission`, `## Supervision`, `## Composer forks` (stub heading; Task 9 fills it), `## Optional Jev judgments`, `## Context economics`, `## Integration`, `## Ledger format`.
- Produces: the ledger format. Sections, in order: header lines `Package worktree:` and `Build graph:`; `## Checkpoints`; `## Units` (`- <unit-slug>: <session name> — status: planning | admitted | running | complete | stopped | replaced | deferred (+ branch, worktree, model — rationale: <signal>, needs: <rows>, produces: <rows>)`); `## Questions` (`- <date> <id> from <unit-slug> [defect-class: <slug>]: <question> → rulings/<id>.md (commit <sha|none>, changes contract: yes|no)`); `## Frame-defect tally` (unchanged form); `## Integration`; `## Cost` (`- <unit-slug>: admitted <ts> seven_day <pct> | finished <ts> seven_day <pct> | session <id>`).
- Produces: the launch template. It is written to `<ledger dir>/assignments/<unit-slug>.md` as the briefing verbatim plus `## Your assignment`. That block contains: Name, Conductor, Ledger, Package worktree, Your worktree, Unit, Implements, Writes, Needs rows (with the merge sha of each), Produces rows others wait on, Admitted yes|no, Permission mode, and Allowed git commands. Launch: separate `cd <worktree>` call, then `claude --bg -n <design-slug>-<unit-slug> --model <model> --permission-mode acceptEdits --allowedTools "<list>" "$(cat <assignment file>)"`.

- [ ] **Step 1: Write the scenarios** (context: superconductor SKILL.md plus budget output where relevant).
  - `conductor-budget-band`: the `BAND: middle` output, 4 ready units, 1 operator running, 1 operator only planning. **Pass:** starts none, because planning counts toward N = 2. It does not ask the partner, and the merge summary states the band. **Fail:** asks for a scope decision, or starts 2.
  - `conductor-resume-live`: a ledger lists 2 running units, and `claude agents --json` output shows one idle and one absent. **Pass:** keeps the live one (messages it with an explicit ask for status) and restarts only the absent one. **Fail:** redispatches both or treats both as dead.
  - `conductor-row-report-admits`: operator A sends `row S12 passed review at abc123`, and unit F needs only S12. **Pass:** merges A up to abc123 in the package worktree, starts a merge-review fork, and admits F. **Fail:** waits for A to finish.
  - `conductor-relay-has-ask`: ruling `world-core-2` affects unit X as a clarification. **Pass:** sends X a message that names the sections to re-read and ends in an imperative. **Fail:** a bare pointer, or a diff from the old approach.
- [ ] **Step 2: Rewrite `tests/test_skill_md.sh`.**
  - Keep: the frontmatter checks; `operator-briefing.md`; `supercomposer`, `supersonic:supercomposer`, and the absence of `back to supercomposer`; frame-defect; `this skill's \`budget.sh\``; `budget state MUST NOT be an input to tier selection`; the no-Opus check; `rationale`; the Optional Jev section; `defect-class`, `surface-route` and `citation` (Task 9 adjusts the Jev lines).
  - Sections: the heading list from Interfaces.
  - Required: `claude --bg -n`, `--allowedTools`, `notify_when_idle`, `claude agents --json`, `claude stop`, `BAND:`, `LOWER`, `assignments/<unit-slug>.md`, `<design-slug>-<unit-slug>`, `build graph`, `Never send a message or schedule a wakeup solely to keep a cache warm`.
  - Forbidden: `\bwave` (case-insensitive), `VERDICT: STOP`, `VERDICT: HOLD`, `scope gate`, `agentId`, `Operators from prior sessions are dead`.
  - Drop: `rate-limits.json`, `seven_day`, `defer-only`, `specs completed`. Re-add `seven_day` as required, because the Cost ledger line names it.
- [ ] **Step 3: RED.** Run the structural test (FAIL) and the four scenarios against the HEAD text. Record the results.
- [ ] **Step 4: Edit SKILL.md** to the Interfaces:
  - Hard rules: the bounce rule becomes "address peers by explicit name; every message carries an explicit ask". Operators are sessions started from the assignment file.
  - Phase 0: reconcile with `claude agents --json`, `git worktree list` and the ledger. Live operators are kept.
  - Phase 1: intake checks the build graph, `Package worktree:` and a checkpoint id. Run the comprehension gate once before the first admission. Run the trust check by starting the first operator; if it is refused, tell the partner plainly that the repo needs trusting once.
  - Phase 2: admit every unit whose needed rows have merged. Start planning-only operators for units that are not ready. Apply the band table, quoting `budget.sh`'s thresholds. Composer forks are exempt. Keep the tier choice and its invariant, recorded per unit.
  - Supervision: learn of idle with `notify_when_idle`, not polling. On a row report, merge and re-derive. On a hand-back, start sibling operators with their plan slice. Keep mechanical rulings (for example which branch to rebase on). Death handling moves to the session form, with a second consecutive death surfaced to the partner.
  - Integration: merge in the package worktree, one writer at a time, and post a merge summary with the band.
  - Context economics: replace the "size operator work so leaf round-trips come back inside the TTL" bullet with the spec's "Why sessions stay warm" bullets. The operator is a main session with the 1-hour cache, and leaves get it from the setting. Keep the no-keep-warm rule and the two-tier flattening bullet for mechanical phases.
- [ ] **Step 5: GREEN.** Rerun the test and scenarios, and record the results.
- [ ] **Step 6: Run** `sh tests/run.sh`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(supersonic)!: superconductor runs operators as named sessions admitted by dependency`.

### Task 9: Superconductor — composer forks, merge review, re-checkpoint, operator replacement, Jev

**Files:**
- Modify: `plugins/supersonic/skills/superconductor/SKILL.md` (`## Composer forks`; Supervision items for questions, frame defects, unmodeled discoveries and replacement; `## Optional Jev judgments`)
- Modify: `tests/test_skill_md.sh`
- Create: `tests/scenarios/conductor-question-to-fork.md`, `conductor-approach-change-replaces.md`, `conductor-recheckpoint.md`. Append to `conductor-results.md`.

**Interfaces:**
- Consumes: `composer-forks.md` headings, and the question and ruling formats (Task 7). The ledger format (Task 8).
- Produces: the conductor's fork procedure. The conductor names the composer fork prompt file by plugin-relative path, `../supercomposer/composer-forks.md` (in "this plugin's `skills/supercomposer/composer-forks.md`" form).

- [ ] **Step 1: Write the scenarios.**
  - `conductor-question-to-fork`: an operator's question `x-1` asks which of two designs the specs leave open. **Pass:** starts an adjudication fork with cwd = package worktree on that file, in the background, and does not rule itself. **Fail:** answers the question.
  - `conductor-approach-change-replaces`: ruling `x-1` says unit X's "first task that no longer holds: Task 4", and X is on Task 6. **Pass:** `claude stop` X, cuts the branch back to the commit before Task 4, and starts a fresh operator with the same name on the amended spec. **Fail:** messages warm X with the delta.
  - `conductor-recheckpoint`: the ledger shows 4 design-changing rulings since the checkpoint, and a fifth arrives with `Changes contract: no`. **Pass:** builds a new checkpoint per `composer-forks.md ## Checkpoint` and records it; running forks finish on the old one. **Fail:** keeps the old checkpoint.
- [ ] **Step 2: Extend `tests/test_skill_md.sh`.**
  - Required: `composer-forks.md`, `--fork-session`, `questions/<id>.md`, `rulings/<id>.md`, `first task that no longer holds`, `five`, `Changes contract`, `one writer`, `No agent loads`.
  - Forbidden: `Bounce rule`, `jev ask bounce`, `**bounce**`, `Adjudicate yourself`, `exact delta`.
  - Change the Jev point loop at `:41` to `defect-class surface-route`, and remove `jev ask bounce` and `jev ask citation` from the list at `:44-45` and the check at `:50-51`, because `citation` moved to the fork prompt (Task 7).
- [ ] **Step 3: RED.** Run the structural test (FAIL) and the three scenarios against the post-Task-8 text. Record the results.
- [ ] **Step 4: Edit SKILL.md.**
  - `## Composer forks`: adjudication, merge review after each merge (including row merges), re-checkpoint rules, one amending fork at a time, relaying a pointer plus explicit ask to each affected operator, and the fact that `rulings/` is the partner's record that no agent loads.
  - Supervision: anything the specs do not answer, including unmodeled discoveries and interface change requests, goes to a fork. A third same-class defect means re-checkpoint plus a line to the partner, not a stop. On an approach change, apply the replacement rule. A clarification goes to the warm operator.
  - Jev: remove `bounce` and `citation`; remap `surface-route`'s `on` routes per the Calls; keep `defect-class`.
- [ ] **Step 5: GREEN.** Rerun the test and scenarios, and record the results.
- [ ] **Step 6: Run** `sh tests/run.sh`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(supersonic): questions and merge reviews go to composer-checkpoint forks`.

### Task 10: README, manifests, version, end-to-end checks

**Files:**
- Modify: `README.md` (plugin table row `:7`, Jev count `:8`, new `## Requirements` section after `## Install`)
- Modify: `.claude-plugin/marketplace.json:13`, `plugins/supersonic/.claude-plugin/plugin.json` (`description`, `version` 0.2.0 → 0.3.0, `keywords`: replace `subagents` with `sessions`)
- Test: `tests/test_manifests.sh` (unchanged; must pass)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the failing checks** to `tests/test_manifests.sh`: README contains `subagentPromptCacheTtl`, `## Requirements` and `claude --bg`; no file under `plugins/supersonic` or `.claude-plugin`, and not `README.md`, matches `operator subagents`; and the README's Jev count equals `ls plugins/superpowers-jev/questions/*.json | wc -l`. Run `sh tests/test_manifests.sh`. Expected: FAIL.
- [ ] **Step 2: Write the README Requirements section.** It covers:
  - Claude Code ≥ 2.1.325.
  - The JSON snippet `{"subagentPromptCacheTtl": "1h"}` for `~/.claude/settings.json`, with the one-line reason: implementers, reviewers and composer forks otherwise get a 5-minute cache.
  - Trusting the repo once in an interactive session before the first run, because `claude --bg` refuses untrusted directories.
  - Starting the conductor as a named session (the form settled by Question 2).
  - On machines where `claude` adds a permission hook, launch lines carry `--permission-mode` and `--allowedTools`.

  Also update the plugin table, the manifests and the Jev count, and bump the version.
- [ ] **Step 3: Run** `sh tests/run.sh`. Expected: PASS. Then run `SUPERSONIC_LIVE=1 sh tests/drill_peer_sessions.sh`. Expected: PASS, with `claude agents --json` clean afterwards.
- [ ] **Step 4: Run a consistency sweep.** `grep -rn -i 'wave\|agentId\|bounce\|reserve' plugins/supersonic README.md .claude-plugin`. Expected: no hits except words used in an unrelated sense (for example "reserve" in prose that has nothing to do with the budget). Read every hit.
- [ ] **Step 5: Commit** `docs(supersonic): document peer-session requirements; bump to 0.3.0`.
