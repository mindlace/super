# Jev verify-stop Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make verify-stop calls labelable: persist what Jev judged, give labelers a command to see and record unlabeled calls in bulk, and recover state for the ~500 historical calls from Claude Code transcripts.

**Architecture:** A new log entry type `"state"` (`{type, call_id, ts, state, session_id, transcript_path, source}`) carries the judged state for a call. The Stop hook writes one right after its `ask`; a recovery command writes them for old calls by matching each call's `ts` to the transcript's `stop_hook_summary` entry. A new `jev label` command lists unrecorded calls that have state (blind: no Jev verdict shown) and applies a JSONL file of verdicts as ordinary `record` entries. `build_report` ignores unknown entry types, so reports are unaffected.

**Tech Stack:** Python 3 stdlib (argparse, json, datetime), unittest; plugin at `plugins/superpowers-jev`.

**Spec:** This plan is the spec. Requirements, from the 2026-10-19 session:
1. Persist the verify-stop judged state + `session_id` + `transcript_path` alongside each call.
2. Add `jev label verify-stop` that lists unrecorded verify-stop calls with their state for batch labeling by a subagent; point the question notes and skills at it.
3. Recover state for existing unrecorded verify-stop calls by matching call timestamps to transcripts in `~/.claude/projects/<slug>/*.jsonl`, then label them.

## Global Constraints

- Hooks never fail or block a session: every new hook path is inside the existing `run()` try/except and fails open.
- `state` entries live in the same gitignored `log.jsonl`; they add no new data beyond what is already sent to TypeSafe.
- No change to `ask()`'s signature or the `call` entry shape.
- Label output must not include Jev's verdict, confidence, or raw answers (labelers stay blind).
- Valid verify-stop labels: `"block"` or `"allow"`, recorded as `{"verdict": "<label>"}`.
- Tests: `sh tests/run.sh` (shell + `python3 -m unittest discover -s tests/jev -t tests/jev`) stays green; baseline is 207 tests OK, 2 skipped.
- Bump `plugins/superpowers-jev/.claude-plugin/plugin.json` version `0.2.0` → `0.3.0`.

## Review Focus

1. A transcript with two Stop summaries near one call (fast consecutive turns): recovery must pick a unique match or skip, never assign one summary to two calls → test in Task 3.
2. Concurrent sessions in a sibling repo with the same name prefix (`sfhousing` vs `sfhousing2`): cwd filter must reject them → test in Task 3.
3. Timezone: call `ts` is local `%z` (`-0700`), transcript `timestamp` is UTC `...Z` with ms → test in Task 3 with mixed offsets.
4. Re-running recovery or label `--apply` twice must not duplicate state entries or create conflicting records → tests in Tasks 3 and 2.
5. `--apply` with an unknown call_id, a non-verify-stop call_id, or a label outside {block, allow} must reject that line and report it, applying the rest → test in Task 2.

---

### Task 1: Stop hook writes a `state` entry

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/log.py` (add helper)
- Modify: `plugins/superpowers-jev/lib/jevlib/hooks.py` (`stop_verify`)
- Test: `tests/jev/test_hooks.py` (`StopVerifyTest`)

**Interfaces:**
- Produces: `log.state_entry(call_id: str, state: dict, session_id: str | None, transcript_path: str | None, source: str) -> dict` returning `{"type": "state", "call_id", "ts": ask.now(), "state", "session_id", "transcript_path", "source"}` (import `now` lazily or move nothing — `ask` imports `log`, so build `ts` with the same `time.strftime("%Y-%m-%dT%H:%M:%S%z")` format inside log.py to avoid a cycle).
- Produces: `log.states_by_call(entries: list[dict]) -> dict[str, dict]` — latest `state` entry per call_id.
- `source` values: `"hook"` (Task 1), `"recovered"` (Task 3).

- [ ] **Step 1: Write failing tests** in `StopVerifyTest`:
  - `test_shadow_logs_state_entry`: with `StubServer(ok(noul=0.9))`, after `hooks.stop_verify(self.inp(), env)`, the last entry is `type == "state"`, its `call_id` equals the preceding `call` entry's `call_id`, `session_id == "sess-1"`, `transcript_path == str(FX / "transcript.jsonl")`, `source == "hook"`, and `state["last_message"]` starts with `"Fixed: corrupt configs"`.
  - `test_no_state_entry_when_off`: with `make_env(None, SUPERPOWERS_JEV="off")`, `stop_verify` returns None and `log.read_entries(env) == []`.
  - `test_state_entry_on_api_error`: with a server responding 500, `stop_verify` returns None, the log holds a `call` entry with `error` followed by a `state` entry for the same call_id (`label` skips errored calls).
  - `test_states_by_call_latest_wins` in `tests/jev/test_report.py` or a new `tests/jev/test_log.py`: two state entries for one id → the later one returned.
- [ ] **Step 2: Run** `python3 -m unittest discover -s tests/jev -t tests/jev -k StopVerify -k states_by_call` → FAIL.
- [ ] **Step 3: Implement.** In `stop_verify`, after `res = ask_mod.ask(...)`: if `res.get("call_id")` and resolved mode is not `off`, `log.safe_append(log.state_entry(res["call_id"], state, inp.get("session_id"), inp.get("transcript_path"), "hook"), env, inp.get("cwd"))`. Add `state_entry` and `states_by_call` to log.py.
- [ ] **Step 4: Run** the full suite → PASS.
- [ ] **Step 5: Commit** `feat(jev): log verify-stop judged state from the Stop hook`.

### Task 2: `jev label` command

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/label.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/cli.py` (`command_modules` list)
- Test: `tests/jev/test_label.py`

**Interfaces:**
- Consumes: `log.read_entries`, `log.states_by_call` (Task 1), `report.record`, `report.build_report`-style record lookup.
- Produces: `label.unlabeled(entries: list[dict], point: str = "verify-stop", since: str | None = None) -> tuple[list[dict], int]` → (`[{"call_id", "ts", "state"}]` for unrecorded, non-error calls of `point` that have state, sorted by ts; count of unrecorded calls lacking state).
- Produces: `label.apply(lines: list[str], entries: list[dict], env, cwd=None, point: str = "verify-stop") -> tuple[int, list[str]]` → (records written, error messages). Each line is `{"call_id": ..., "verdict": "block"|"allow"}`.
- CLI: `jev label verify-stop [--since YYYY-MM-DD] [--root DIR]` prints one JSON object per line to stdout and `"<n> unrecorded verify-stop calls have no state"` to stderr when n > 0. `jev label verify-stop --apply FILE [--root DIR]` prints `"recorded <n>"` and each error to stderr; exit 0 if no errors else 1. `--root` is passed as `cwd` to `log.read_entries`/`report.record`. The `point` positional uses `choices=["verify-stop"]`.

- [ ] **Step 1: Write failing tests** (`LabelTest`, using `support.make_env()` and `log.append` to seed entries):
  - `test_lists_unrecorded_with_state_only`: calls A (state, no record), B (state, recorded), C (no state), D (error, state) → `unlabeled` returns only A; missing count 1.
  - `test_output_is_blind`: the listed object's keys are exactly `{"call_id", "ts", "state"}`.
  - `test_since_filters`: call with ts `2026-10-10...` excluded by `since="2026-10-11"`.
  - `test_apply_records_and_rejects`: lines for A (`block`), unknown id, a `tier` call id, A with `"maybe"` → 1 record written with `claude_verdict == {"verdict": "block"}`, 3 errors.
  - `test_apply_twice_no_duplicate`: applying A's line a second time writes nothing and returns one error naming A as already recorded; the log holds exactly one record for A.
  - `test_cli_roundtrip`: `cli.main(["label", "verify-stop"], env)` prints A's line; `cli.main(["label", "verify-stop", "--apply", path], env)` returns 0 and `jev report --point verify-stop` (via `report.build_report`) shows 1 recorded.
- [ ] **Step 2: Run** `python3 -m unittest tests/jev/test_label.py` from the worktree root (or `discover -k Label`) → FAIL (module missing).
- [ ] **Step 3: Implement** `label.py` with `unlabeled`, `apply`, `cmd_label(args, env) -> int`, `add_parser(sub)`; register `label` in `cli.command_modules()`.
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `feat(jev): add jev label for blind batch labeling of verify-stop calls`.

### Task 3: Recover state for historical calls

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/recover.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/transcript.py` (`load` gains `tail_bytes=TAIL_BYTES`; `None` reads the whole file)
- Modify: `plugins/superpowers-jev/lib/jevlib/cli.py` (register module)
- Create: `tests/jev/fixtures/recover/` (small synthetic project dir with two session transcripts)
- Test: `tests/jev/test_recover.py`

**Interfaces:**
- Consumes: `transcript.load`, `transcript.last_assistant_text`, `transcript.stop_state`, `log.state_entry(..., source="recovered")`, `log.states_by_call`.
- Produces:
  - `recover.parse_ts(s: str) -> datetime` — aware datetime from either `2026-10-12T09:40:13-0700` or `2026-10-12T16:40:13.415Z`.
  - `recover.slug(path: str) -> str` — Claude Code project-dir slug: every char not `[A-Za-z0-9]` becomes `-` (`/Users/m/Projects/sfhousing/.claude/worktrees/x` → `-Users-m-Projects-sfhousing--claude-worktrees-x`).
  - `recover.stop_summaries(projects_dir: Path, root: str) -> list[dict]` — from top-level `*.jsonl` in every dir under `projects_dir` whose name == `slug(root)` or starts with `slug(root) + "-"` (no `subagents/`), each `type == "system"`, `subtype == "stop_hook_summary"` entry whose `hookInfos[*].command` contains `"stop-verify"` and whose `cwd` == `root` or starts with `root + "/"`; returns `{"at": datetime, "session_id", "transcript_path", "index"}` (index of the summary in the fully loaded file).
  - `recover.match(calls: list[dict], summaries: list[dict], window=(-1, 15)) -> tuple[dict[str, dict], list[str]]` — call_id → summary, plus ambiguous/unmatched call_ids. A call's candidates are summaries with `at - parse_ts(call.ts)` in `[-1s, +15s]`; take the nearest. A call with zero candidates is unmatched; a summary claimed by two calls makes both ambiguous (neither is matched).
  - `recover.recover(env, root: str, projects_dir: Path, point="verify-stop") -> dict` — for every non-error `point` call with no state entry (recorded or not): match, rebuild state as `stop_state(entries[:index], last_assistant_text(entries[:index]))` (cache loaded transcripts per path), append a `state` entry with `source="recovered"`; returns `{"recovered": n, "unmatched": [...], "ambiguous": [...]}`.
  - CLI: `jev recover-states verify-stop [--root DIR] [--projects-dir DIR]`; `--root` defaults to `log.main_repo_root()`; `--projects-dir` defaults to `$HOME/.claude/projects`. Prints the result dict as JSON; exit 0.

- [ ] **Step 1: Build the fixture**: `tests/jev/fixtures/recover/-tmp-repo/s1.jsonl` with a prompt, an assistant Edit, a Bash `pytest` run + result, an assistant "Tests pass." message, then a `stop_hook_summary` (cwd `/tmp/repo`, `hookInfos: [{"command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" jev-hook stop-verify"}]`, timestamp `2026-10-12T16:40:14.200Z`), then a second turn and summary at `16:40:20.000Z`; `-tmp-repo2/s2.jsonl` with a summary at `16:40:14.300Z`, cwd `/tmp/repo2`.
- [ ] **Step 2: Write failing tests** (`RecoverTest`):
  - `test_parse_ts_mixed_offsets`: `parse_ts("2026-10-12T09:40:13-0700") < parse_ts("2026-10-12T16:40:14.200Z")`, difference 1.2 s.
  - `test_slug`: the example above.
  - `test_sibling_repo_excluded`: `stop_summaries(FX/"recover", "/tmp/repo")` returns only s1's two summaries.
  - `test_match_nearest_and_ambiguous`: call at `09:40:13-0700` matches the 16:40:14.200Z summary; two calls both nearest to the same summary → both ambiguous; a call 1 hour off → unmatched.
  - `test_recover_rebuilds_state`: seed a verify-stop call at `2026-10-12T09:40:13-0700` (no state) → after `recover`, a `state` entry with `source == "recovered"`, `session_id` from the transcript, `state["last_message"] == "Tests pass."`, `state["commands_since_last_edit"][0]["command"]` is the pytest command; and the second turn's messages are absent from the state.
  - `test_recover_idempotent`: second `recover` call returns `recovered == 0` and adds no entries.
  - `test_load_whole_file`: `transcript.load(path, tail_bytes=None)` returns the first line of a file larger than 256 KB.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** `recover.py`, the `load` parameter, and registration.
- [ ] **Step 5: Run** full suite → PASS.
- [ ] **Step 6: Commit** `feat(jev): recover verify-stop state from Claude Code transcripts`.

### Task 4: Docs, notes, version

**Files:**
- Modify: `plugins/superpowers-jev/questions/verify-stop.json` (`notes`)
- Modify: `plugins/superpowers-jev/skills/jev-gates/SKILL.md:54-56`
- Modify: `plugins/superpowers-jev/skills/jev/SKILL.md` (Calibration section)
- Modify: `README.md` (log section, ~lines 61-65)
- Modify: `tests/test_jev_skills.sh` (add `'jev label'` and `'jev recover-states'` to the mentioned-commands loop)
- Modify: `plugins/superpowers-jev/.claude-plugin/plugin.json` (`0.3.0`)

- [ ] **Step 1:** Add the two commands to `tests/test_jev_skills.sh`; run `sh tests/test_jev_skills.sh` → FAIL.
- [ ] **Step 2:** Rewrite the labeling guidance in all four docs to: the Stop hook logs the judged state; label with `jev label verify-stop` (blind JSONL of `call_id`, `ts`, `state`), decide `block` iff `last_message` claims completion/fix/passing AND no `commands_since_last_edit` output checks that claim, else `allow`; apply with `jev label verify-stop --apply <file>`; older calls first need `jev recover-states verify-stop`. Keep the verdict-shape table row unchanged. Bump version.
- [ ] **Step 3:** `sh tests/run.sh` → all pass.
- [ ] **Step 4: Commit** `docs(jev): document verify-stop labeling and recovery; bump to 0.3.0`.

### Task 5: Run recovery and label (operational, after merge-ready branch)

Run with the worktree's `plugins/superpowers-jev/bin/jev`, passing `--root` for each repo with a log: `sfhousing`, `planafoot`, `super`, `dotfiles`, `spec_reader` under `/Users/mindlace/Projects`.

- [ ] **Step 1:** `jev recover-states verify-stop --root <repo>` for each; record recovered/unmatched/ambiguous counts.
- [ ] **Step 2:** Spot-check 3 recovered states against the transcript by hand (the `last_message` is the turn's final text).
- [ ] **Step 3:** `jev label verify-stop --root <repo> > <scratchpad>/<repo>.jsonl`; split into batches of 25 lines.
- [ ] **Step 4:** Dispatch one labeling subagent per batch with the rubric from Task 4 Step 2 and the instruction to output `{"call_id", "verdict"}` JSONL only; never show Jev's verdict.
- [ ] **Step 5:** `jev label verify-stop --apply <batch-verdicts> --root <repo>` for each batch; then run `JEV_LOG_DIR=<repo>/.superpowers/jev jev report --point verify-stop` per repo and report agreement / conf-wrong to the user.
