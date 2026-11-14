# Jev Evaluation Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Jev call persist what Jev saw and the context it ran in, tag every verdict with its source, and aggregate reports across repos. Also tell sessions when to reach for Jev, and give project code a safe way to get the key.

**Architecture:** Two new leaf modules, `state.py` and `ctx.py`, are best-effort: they never raise into `ask`. `ask()` calls both before it logs, so every entry path that goes through `ask` gets `state_sha` and `ctx` (hooks, `--state FILE`, `--state -`). `jev coverage` stores one composite blob. Readers use `state.load`/`state.loader` (blob first, then legacy inline `state` entries) and `transcript.locate`. `report.py` gains record sources, `--truth`, `--by`, `--all` (through a new `registry.py`), a labels-on-current-model column and `RETIRED`.

**Tech Stack:** Python 3 stdlib only (json, gzip, hashlib, fcntl, os, glob, argparse), unittest. Plugin at `plugins/superpowers-jev`.

**Spec:** `docs/superpowers/specs/2026-11-13-jev-eval-persistence-design.md`. In scope: Goal 0, Goals 1–3 and 6, the stale-transcript-path fix, `RETIRED`, and the version bump. **Out of scope:** adjudication entries, `jev adjudicate`, `jev label` for other points, `--sample`, strata, verify-stop window/evidence/rule changes, the `rules/` dir, `import-eval`/backfill, and scoring with adjudications.

## Global Constraints

- Python stdlib only, following the existing `lib/jevlib` layout.
- Tests: `sh tests/run.sh` must stay green. The baseline on this branch is `Ran 243 tests ... OK (skipped=2)`. New tests go in `tests/jev/test_*.py` and import `support` first.
- Run commands from the worktree root `/Users/mindlace/Projects/super/.claude/worktrees/jev-eval-persistence`. Issue `cd` as its own command; never `cd … && cmd`. Single test files: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_<name>.py'`.
- `jev ask` stays fail-open. Persisting state and ctx is best-effort: any failure is swallowed, `ask` still prints one JSON object and exits 0, and stdout stays exactly one JSON line. Diagnostics go to stderr only. The added cost stays under about 10 ms.
- `ask.py` must not import command modules or `builders/*`. `builders/__init__` imports `cli`, which imports `ask`, so that would be a cycle. New modules `ask` imports (`state`, `ctx`) import only `log`, `key` and the stdlib.
- Logs, state blobs and the registry stay local. Every log dir carries its `.gitignore` (`*`). Blobs live under `<log dir>/states/`.
- Blob path: `<log dir>/states/<sha[:2]>/<sha>.json.gz`, where sha = sha256 hex of the canonical JSON of the stored payload. Cap: `MAX_BLOB_BYTES = 256 * 1024` uncompressed. Over the cap, store `{"truncated": true, "bytes": N, "head": "<first 256 KB>"}`.
- `ctx` keys, always all present (null when unknown): `session_id, transcript_path, cwd, git_head, git_branch, plugin_version`.
- Record `source` ∈ `in_session | blind_label | auto_hook | import`. A legacy record with no `source` is `auto_hook` when its call's point is `prompt-route`, otherwise `in_session`.
- `--truth` ∈ `in_session | auto_hook | blind | best`. `best` = blind_label > in_session > auto_hook. Latest record wins per (call, source).
- Registry: `$JEV_REGISTRY`, else `$HOME/.superpowers/jev/registry.json`. **No registration at all when `JEV_LOG_DIR` is set and `JEV_REGISTRY` is not.** Tests must never touch the real registry. `support.make_env` sets `JEV_LOG_DIR` and a temp `HOME`, so that holds by default.
- `jev with-key` never prints the key, and there is no export or print mode.
- Commits: Conventional Commits (`feat(jev):`, `test(jev):`, `docs(jev):`, `chore(jev):`). **Never add Claude attribution:** no `Co-Authored-By` trailer, no "Generated with" line, no session links.

## Review Focus

1. **Unwritable log dir, full disk, or a state that won't serialize:** `ask` still returns its normal result, and the call entry is logged with `state_sha: null` if the log itself is writable. Tests: Task 2 (`test_safe_write_swallows_*`) and Task 4 (`test_blob_failure_does_not_break_ask`).
2. **Hostile or odd session ids** (`*`, `/`, `..`, empty): `locate` must not glob across sessions or escape the projects dir. It returns the hint if that exists, otherwise None. Test: Task 3 (`test_locate_rejects_glob_and_path_chars`).
3. **Git layouts:** a worktree `.git` file with a relative `gitdir:`, a branch that exists only in `packed-refs`, a detached HEAD, a non-repo cwd, or a garbage `.git` file. Each yields the right sha/branch or nulls, never an exception, and no subprocess runs. Tests: Task 3 (`test_git_*`).
4. **Registry file corrupt, missing, or listing deleted dirs:** registration rewrites a valid file, and `report --all` silently skips missing dirs. A registry failure never breaks a log append. Tests: Task 7 (`test_corrupt_registry_is_rewritten`, `test_register_failure_never_breaks_append`) and Task 8 (`test_report_all_aggregates_and_skips_missing`).
5. **Same state written twice, or concurrently:** one blob file, no leftover temp files, and dict key order doesn't change the sha. Test: Task 2 (`test_identical_states_dedupe`).

---

### Task 1: Reach for Jev: session note and `jev with-key`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/hooks.py:18-23` (`SESSION_NOTE`)
- Modify: `plugins/superpowers-jev/lib/jevlib/cli.py:51-69` (add `cmd_with_key` and its parser next to `cmd_key`)
- Test: `tests/jev/test_hooks.py` (`SessionStartTest`), new `tests/jev/test_with_key.py`

**Interfaces:**
- Consumes: `key.resolve_key(env) -> (key|None, source)` (`key.py:37`).
- Produces: `hooks.REACH_FOR_JEV: str`. `SESSION_NOTE` stays a `%s` format string (mode) and is now `<existing two lines> + "\n" + REACH_FOR_JEV`. The note is 3 lines in total, so the existing `test_shadow_injects_at_most_three_lines` (`test_hooks.py:32`) still holds. `cli.cmd_with_key(args, env) -> int`.

- [ ] **Step 1: Write the failing tests**

In `test_hooks.py` `SessionStartTest`:
```python
def test_note_carries_reach_for_jev_guidance_in_shadow_and_on(self):
    for extra in ({}, {"SUPERPOWERS_JEV": "on"}):
        code, out = run_hook("session-start", {"hook_event_name": "SessionStart"},
                             support.make_env(**extra))
        text = json.loads(out)["hookSpecificOutput"]["additionalContext"]
        for needle in ("jev with-key --", "TYPESAFE_API_KEY", "typesafe:typesafe-ai",
                       "https://docs.typesafe.ai/llms.txt", "regex"):
            self.assertIn(needle, text, (extra, needle))

def test_reach_for_jev_is_short(self):
    self.assertLessEqual(len(hooks.REACH_FOR_JEV.split()), 120)
    self.assertNotIn("%", hooks.REACH_FOR_JEV)
```
`test_off_is_silent` (`test_hooks.py:27`) already covers off mode.

New `tests/jev/test_with_key.py`. Run `[sys.executable, str(support.JEV), "with-key", "--", sys.executable, "-c", CHILD, out_path]` with `env = {"PATH": ..., "HOME": tmp}` plus the case's own variables. `CHILD` writes `os.environ.get("TYPESAFE_API_KEY", "")` to `sys.argv[1]` and exits with `int(sys.argv[2])` if that is given. `SECRET = "sk-secret-value-456"`. Write the key file with mode 0o600, as `test_key.write_key` does.
```python
def test_child_sees_key_from_file_and_jev_never_prints_it(self):
    p = run(["--", py, "-c", CHILD, out], {"JEV_KEY_FILE": str(keyfile)})
    self.assertEqual(p.returncode, 0)
    self.assertEqual(Path(out).read_text(), SECRET)
    self.assertNotIn(SECRET, p.stdout + p.stderr)

def test_env_key_passes_through(self):            # TYPESAFE_API_KEY=SECRET in env -> child sees SECRET
def test_child_exit_code_passes_through(self):    # CHILD exits 3 -> returncode 3
def test_no_key_exits_2_without_running(self):    # no key: returncode 2, out file absent, "no key" in stderr
def test_missing_command_exits_127(self):         # command "no-such-cmd-xyz": returncode 127, SECRET not in output
def test_no_command_is_usage_error(self):         # `jev with-key` or `jev with-key --`: returncode 2
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_with_key.py'`, then the same with `-p 'test_hooks.py'`.
Expected: FAIL. `with-key` is an invalid choice, and `REACH_FOR_JEV` is not defined.

- [ ] **Step 3: Implement**

`REACH_FOR_JEV` is one line (no `\n`, no `%`) of at most 120 words, carrying exactly the spec's "Reach for Jev" content:
- **when:** a semantic judgment repeated over many items: categorizing records, picking a value out of messy text, deciding whether two records are the same thing, flagging what looks wrong, scoring relevance;
- **before what:** before writing regexes, keyword lists or exception files, or running an LLM call per item;
- **warning signs:** a growing override file, negation windows, keyword lists retuned after false positives, a "couldn't classify" bucket;
- **how:** a separate labeling step that saves answers, confidence and input hash as data; low-confidence answers go to review; measure against existing labels first;
- **the key:** project code gets the key by running under `jev with-key -- <command> [args]` and reads `TYPESAFE_API_KEY` from its own environment, never the plugin's key file;
- **learn more:** load `typesafe:typesafe-ai` if it is installed, otherwise https://docs.typesafe.ai/llms.txt.

`cmd_with_key`:
- The parser is `sub.add_parser("with-key", ...)` with `command` as `nargs=argparse.REMAINDER`. Strip one leading `"--"`. An empty command means stderr usage and return 2.
- If `resolve_key(env)` returns no key, write `jev with-key: no key available (see jev key)` to stderr and return 2.
- Otherwise `os.execvpe(cmd[0], cmd, dict(env, TYPESAFE_API_KEY=key))`. On `OSError` (not found or not executable), write `jev with-key: cannot run <cmd[0]>: <strerror>` to stderr and return 127. Never interpolate the key or the child env into a message.

- [ ] **Step 4: Run the tests and confirm they pass**

Run the two commands from Step 2, then `sh tests/run.sh`.
Expected: all OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/hooks.py plugins/superpowers-jev/lib/jevlib/cli.py tests/jev/test_hooks.py tests/jev/test_with_key.py
git commit -m "feat(jev): reach-for-Jev session note and jev with-key"
```

---

### Task 2: Content-addressed state blobs and the `state.load` accessor

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/state.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/log.py:57-85` (add `read_dir` and `state_ref_entry`; `read_entries` delegates to `read_dir`)
- Test: new `tests/jev/test_state.py`

**Interfaces:**
- Consumes: `log.log_dir(env, cwd)` (`log.py:27`), `log.states_by_call(entries)` (`log.py:79`).
- Produces:
  - `state.MAX_BLOB_BYTES = 262144`
  - `state.canonical(obj) -> bytes`: `json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")`
  - `state.blob_path(log_dir: Path, sha: str) -> Path`
  - `state.write_blob(obj, log_dir: Path) -> str` (sha). Raises on failure.
  - `state.read_blob(sha: str, log_dir: Path) -> dict | None`. Returns None for a missing or corrupt blob, or a sha that isn't 64 lowercase hex.
  - `state.safe_write(obj, env, cwd=None) -> str | None`. Never raises; on failure writes one stderr line `jev: state write failed: ...`.
  - `state.loader(entries, log_dir: Path) -> Callable[[str], dict | None]`. Indexes the entries once.
  - `state.load(call_id, env, cwd=None, entries=None) -> dict | None`
  - `log.read_dir(d: Path) -> list[dict]`
  - `log.state_ref_entry(call_id, state_sha, session_id, transcript_path, source) -> dict`. Same shape as `state_entry`, but it carries `state_sha` and has no `state` key.

`load` resolution order: the call entry's `state_sha` blob; then the latest `state` entry for the call (`states_by_call`), using its `state_sha` blob if it has one, else its inline `state`; then None. A `state_sha` whose blob is missing falls through to the next source.

- [ ] **Step 1: Write the failing tests** (`test_state.py`; `d = Path(tempfile.mkdtemp())`)

```python
def test_roundtrip_and_layout(self):
    sha = state.write_blob({"a": 1}, d)
    p = d / "states" / sha[:2] / (sha + ".json.gz")
    self.assertTrue(p.is_file())
    self.assertEqual(json.loads(gzip.decompress(p.read_bytes())), {"a": 1})
    self.assertEqual(state.read_blob(sha, d), {"a": 1})
    self.assertEqual(sha, hashlib.sha256(state.canonical({"a": 1})).hexdigest())

def test_identical_states_dedupe(self):
    a = state.write_blob({"a": 1, "b": 2}, d); b = state.write_blob({"b": 2, "a": 1}, d)
    self.assertEqual(a, b)
    files = [f for f in (d / "states").rglob("*") if f.is_file()]
    self.assertEqual(len(files), 1)          # no leftover temp files

def test_oversize_state_is_truncated(self):
    sha = state.write_blob({"x": "y" * 300000}, d)
    got = state.read_blob(sha, d)
    self.assertIs(got["truncated"], True)
    self.assertGreater(got["bytes"], state.MAX_BLOB_BYTES)
    self.assertLessEqual(len(got["head"].encode("utf-8")), state.MAX_BLOB_BYTES)

def test_read_blob_rejects_bad_sha(self):            # "../../etc/passwd", "abc", "" -> None
def test_safe_write_swallows_unserializable(self):   # safe_write({"x": object()}, env) -> None, no raise
def test_safe_write_swallows_unwritable_dir(self):   # chmod 0o500 on log dir (skip if os.geteuid()==0) -> None

def test_load_prefers_blob_then_inline(self):
    env = support.make_env(); d = log.log_dir(env)
    sa = state.write_blob({"v": "blob-A"}, d); sc = state.write_blob({"v": "blob-C"}, d)
    entries = [
        {"type": "call", "call_id": "A", "state_sha": sa},
        log.state_entry("A", {"v": "inline-A"}, None, None, "hook"),
        {"type": "call", "call_id": "B"}, log.state_entry("B", {"v": "inline-B"}, None, None, "hook"),
        {"type": "call", "call_id": "C"}, log.state_ref_entry("C", sc, None, None, "recovered"),
        {"type": "call", "call_id": "D"},
        {"type": "call", "call_id": "E", "state_sha": "0" * 64},
        log.state_entry("E", {"v": "inline-E"}, None, None, "hook"),
    ]
    for e in entries: log.append(e, env)
    self.assertEqual(state.load("A", env)["v"], "blob-A")
    self.assertEqual(state.load("B", env)["v"], "inline-B")
    self.assertEqual(state.load("C", env)["v"], "blob-C")
    self.assertIsNone(state.load("D", env))
    self.assertEqual(state.load("E", env)["v"], "inline-E")
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_state.py'`
Expected: FAIL with `ImportError: cannot import name 'state'`.

- [ ] **Step 3: Implement `state.py` and the two `log.py` helpers**

- `write_blob`:
  - Build the payload: the object itself, or the truncation wrapper when `len(canonical(obj)) > MAX_BLOB_BYTES`. `head` is `canonical(obj)[:MAX].decode("utf-8", "ignore")`.
  - Compute the sha over `canonical(payload)`. If the blob already exists, return the sha.
  - Otherwise `mkdir -p` the shard dir, write `gzip.compress(canonical(payload), mtime=0)` to a `tempfile.mkstemp(dir=shard, prefix=".tmp-")` file, then `os.replace` it into place.
  - Builder's call: write-then-rename, not the log's flock. A rename is atomic, and identical content makes races harmless.
- `safe_write` resolves its dir with `log.log_dir(env, cwd)`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_state.py'`, then `-p 'test_log.py'`.
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/state.py plugins/superpowers-jev/lib/jevlib/log.py tests/jev/test_state.py
git commit -m "feat(jev): content-addressed gzipped state blobs with legacy-aware loader"
```

---

### Task 3: Call context (`ctx`) and `transcript.locate`

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/ctx.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/transcript.py` (add `projects_dir`, `locate`)
- Modify: `plugins/superpowers-jev/lib/jevlib/recover.py:32-34` (`slug = ctx.project_slug`, so the logic lives in one place)
- Test: new `tests/jev/test_ctx.py`

**Interfaces:**
- Consumes: `key.PLUGIN_ROOT` (`key.py:14`).
- Produces:
  - `ctx.CTX_KEYS = ("session_id", "transcript_path", "cwd", "git_head", "git_branch", "plugin_version")`
  - `ctx.project_slug(path) -> str`. This is `recover.slug`'s rule (`recover.py:32-34`): every non-alphanumeric character becomes `-`.
  - `ctx.git_info(cwd) -> tuple[str | None, str | None]` (head sha, branch). It only reads files and never runs a subprocess.
  - `ctx.plugin_version() -> str | None`. Reads `PLUGIN_ROOT/.claude-plugin/plugin.json` `version`, cached at module level.
  - `ctx.collect(env, hook=None, cwd=None) -> dict`
  - `ctx.safe_collect(env, hook=None, cwd=None) -> dict`. Never raises; returns all `CTX_KEYS` as null on failure.
  - `transcript.projects_dir(env) -> Path`: `Path(env HOME or ~)/.claude/projects`.
  - `transcript.locate(session_id, hint=None, projects_dir=None) -> str | None`

Rules for `collect`:
- `cwd` = `hook["cwd"]`, else the `cwd` argument, else `os.getcwd()`.
- `session_id` = `hook["session_id"]`, else `env["CLAUDE_CODE_SESSION_ID"]`, else None.
- `transcript_path` = `hook["transcript_path"]`, else `transcript.projects_dir`-equivalent `HOME/.claude/projects/<project_slug(cwd)>/<session_id>.jsonl`, but only if that file exists, else None.
  - `ctx.py` builds that path itself. Importing `builders.transcript` from `ctx` is forbidden by Global Constraints.

`git_info`:
- Walk up from cwd to the first dir containing `.git`.
- If `.git` is a file, read its `gitdir: <p>` line and resolve `p` relative to the dir containing `.git`.
- Read `<gitdir>/HEAD`. A `ref: refs/heads/<b>` line gives the branch `<b>`. Look up its sha in `<gitdir>/<ref>`, then `<common>/<ref>`, then `<common>/packed-refs`. `<common>` is `<gitdir>/commondir` resolved relative to gitdir, if that file exists, else gitdir.
- A bare 40/64-hex HEAD means detached: `(sha, None)`.
- Any `OSError` or unexpected content gives `(None, None)` or a partial result, never an exception.

`locate`:
- Return `hint` if `os.path.isfile(hint)`.
- If `session_id` doesn't fully match `[A-Za-z0-9_-]+`, return None.
- Otherwise glob `projects_dir/*/<session_id>.jsonl` and return the newest by mtime (builder's call: worktree and main-dir copies can both exist, and the newest is the live one). Return None if nothing matches.

- [ ] **Step 1: Write the failing tests** (`test_ctx.py`, using fake `.git` trees written with `Path.write_text`)

```python
SHA1, SHA2, SHA3 = "a" * 40, "b" * 40, "c" * 40

def test_git_plain_repo_from_subdir(self):        # main/.git/HEAD "ref: refs/heads/main\n", refs/heads/main SHA1
    self.assertEqual(ctx.git_info(str(main / "src" / "deep")), (SHA1, "main"))

def test_git_worktree_relative_gitdir_packed_ref(self):
    # wt/.git = "gitdir: ../main/.git/worktrees/wt\n"; main/.git/worktrees/wt/HEAD = "ref: refs/heads/feat/x\n"
    # main/.git/worktrees/wt/commondir = "../..\n"; main/.git/packed-refs has "SHA2 refs/heads/feat/x"
    self.assertEqual(ctx.git_info(str(wt)), (SHA2, "feat/x"))

def test_git_detached_head(self):                 # HEAD = SHA3 + "\n" -> (SHA3, None)
def test_git_none_outside_repo_or_garbage(self):  # tmp dir -> (None, None); .git file "nonsense" -> (None, None)

def test_git_info_never_spawns(self):
    with mock.patch("subprocess.run", side_effect=AssertionError("no subprocess")), \
         mock.patch("subprocess.Popen", side_effect=AssertionError("no subprocess")):
        self.assertEqual(ctx.git_info(str(main))[1], "main")

def test_session_id_precedence(self):
    env = support.make_env(CLAUDE_CODE_SESSION_ID="s-env")
    self.assertEqual(ctx.collect(env, {"session_id": "s-hook"})["session_id"], "s-hook")
    self.assertEqual(ctx.collect(env)["session_id"], "s-env")
    self.assertIsNone(ctx.collect(support.make_env())["session_id"])

def test_transcript_derived_only_when_file_exists(self):
    env = support.make_env(CLAUDE_CODE_SESSION_ID="sid1"); cwd = "/x/repo"
    self.assertIsNone(ctx.collect(env, cwd=cwd)["transcript_path"])
    p = Path(env["HOME"]) / ".claude" / "projects" / "-x-repo" / "sid1.jsonl"
    p.parent.mkdir(parents=True); p.write_text("")
    self.assertEqual(ctx.collect(env, cwd=cwd)["transcript_path"], str(p))
    self.assertEqual(ctx.collect(env, {"transcript_path": "/h.jsonl"})["transcript_path"], "/h.jsonl")

def test_all_keys_and_plugin_version(self):
    c = ctx.collect(support.make_env(), {"cwd": "/tmp"})
    self.assertEqual(set(c), set(ctx.CTX_KEYS))
    self.assertEqual(c["cwd"], "/tmp")
    self.assertEqual(c["plugin_version"], support.load_json(support.PLUGIN / ".claude-plugin" / "plugin.json")["version"])

def test_safe_collect_never_raises(self):         # patch ctx.git_info to raise -> all CTX_KEYS present

def test_locate_hint_then_glob(self):
    # projects/-main/sid1.jsonl exists; hint "/gone/sid1.jsonl" stale
    self.assertEqual(transcript.locate("sid1", "/gone/sid1.jsonl", projects), str(projects / "-main" / "sid1.jsonl"))
    self.assertEqual(transcript.locate("sid1", str(real_hint), projects), str(real_hint))
    self.assertIsNone(transcript.locate("nope", None, projects))

def test_locate_rejects_glob_and_path_chars(self):
    for sid in ("*", "sid*", "../sid1", "a/b", "", None):
        self.assertIsNone(transcript.locate(sid, None, projects), sid)
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_ctx.py'`
Expected: FAIL with `ImportError` for `ctx`.

- [ ] **Step 3: Implement `ctx.py`, `transcript.projects_dir`/`locate`, and the `recover.slug` alias**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_ctx.py'`, then `-p 'test_recover.py'` (`test_slug` still passes).
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/ctx.py plugins/superpowers-jev/lib/jevlib/builders/transcript.py plugins/superpowers-jev/lib/jevlib/recover.py tests/jev/test_ctx.py
git commit -m "feat(jev): call context collection and transcript.locate"
```

---

### Task 4: Every call carries `state_sha` and `ctx`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/ask.py:28-48` (`ask` signature and entry enrichment)
- Modify: `plugins/superpowers-jev/lib/jevlib/hooks.py:76,118-121` (pass `hook=inp`; drop the inline `state_entry` write)
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/spec.py:49-80` (composite blob and ctx on the aggregate call)
- Test: `tests/jev/test_ask.py`, `tests/jev/test_hooks.py`, `tests/jev/test_builders_supersonic.py`

**Interfaces:**
- Consumes:
  - `state.safe_write(obj, env, cwd)`, `state.load(call_id, env)`, `state.read_blob(sha, log_dir)` (Task 2);
  - `ctx.safe_collect(env, hook, cwd)`, `ctx.CTX_KEYS` (Task 3).
- Produces:
  - `ask.ask(point, state, env, call_id=None, cwd=None, post=None, write_log=True, hook=None)`. When `write_log` is set, every logged `call` entry (success and every `fail()` path) carries `state_sha` (str or None) and `ctx` (dict with all `CTX_KEYS`). With `write_log=False`, no blob is written.
  - The coverage aggregate `call` entry carries `state_sha` of the composite `{"requirements": [...], "specs": {"<spec path>": "<spec text>"}}` plus `ctx`. Each per-spec ask's exact state is `{"requirements": reqs, "spec_text": specs[path]}`, which can be rebuilt from that blob.
  - The Stop hook no longer writes inline `state` entries.

- [ ] **Step 1: Write the failing tests**

`test_ask.py` (`AskTest`, using the existing `toy_env`/`STATE`):
```python
def test_call_entry_has_state_sha_and_ctx(self):
    with support.StubServer(support.ok(noul=0.9)) as srv:
        env = toy_env(srv); env["CLAUDE_CODE_SESSION_ID"] = "s-env"
        ask.ask("toy", STATE, env)
    e = log.read_entries(env)[0]
    self.assertEqual(state.read_blob(e["state_sha"], log.log_dir(env)), STATE)
    self.assertEqual(set(e["ctx"]), set(ctx.CTX_KEYS))
    self.assertEqual(e["ctx"]["session_id"], "s-env")

def test_error_and_invalid_calls_still_persist_state(self):
    # http 500 -> entry["error"] set and state.load(call_id, env) == STATE
    # invalid state {"nope": 1} -> entry["error"] startswith "state invalid" and state.load(...) == {"nope": 1}

def test_blob_failure_does_not_break_ask(self):
    with mock.patch.object(state, "write_blob", side_effect=OSError("disk full")):
        ...  # out["enabled"] is True; entry["state_sha"] is None; entry["verdict"] == "flagged"

def test_write_log_false_writes_no_blob(self):    # ask(..., write_log=False) -> not (log dir / "states").exists()
```
`CliTest` (subprocess):
```python
def test_ask_file_and_stdin_both_persist_state(self):
    # run `jev ask toy --state <file>` and `jev ask toy --state -` with the same env
    # each logged call has a state_sha, and both shas are equal (identical state dedupes)
```
`test_hooks.py`:
- Replace `test_shadow_logs_state_entry` with `test_shadow_call_carries_state_and_hook_ctx`:
  - `state.load(call_id, env)["last_message"]` starts with `"Fixed: corrupt configs"`;
  - the call's `ctx` has session `"sess-1"`, `transcript_path == str(FX / "transcript.jsonl")` and `cwd == "/tmp"`;
  - there are no entries with `type == "state"`.
- Replace `test_state_entry_on_api_error` with `test_error_call_carries_state_sha`: on a 500, the only entry is a `call` with `error` and a non-null `state_sha`.
- Add `test_prompt_route_call_carries_state_and_ctx`: the `call` has `ctx["session_id"] == "sess-1"`, and `state.load(...)["skills"]` is non-empty.
- `test_no_state_entry_when_off` stays as is. Also assert that `(log.log_dir(env) / "states")` does not exist.

`test_builders_supersonic.py`: extend `test_coverage_counts_carriers_across_specs_and_logs_once`:
```python
st = state.load("cov-1", env)
self.assertEqual(st["requirements"], spec.traceability_requirements((FX / "design.md").read_text()))
self.assertEqual(set(st["specs"]), {str(FX / "spec-a.md"), str(FX / "spec-b.md")})
self.assertTrue(st["specs"][str(FX / "spec-a.md")].startswith("# Auth"))
self.assertEqual(set(entries[0]["ctx"]), set(ctx.CTX_KEYS))
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_ask.py'`, and the same for `test_hooks.py` and `test_builders_supersonic.py`.
Expected: the new tests FAIL with `KeyError: 'state_sha'` or `'ctx'`.

- [ ] **Step 3: Implement**

- In `ask()`, after building `entry` and only `if write_log`, call `entry.update(state_sha=state_mod.safe_write(state, env, cwd), ctx=ctx.safe_collect(env, hook, cwd))`. Do this before `_run`, so `fail()` entries carry both.
- In `hooks.prompt_route` and `stop_verify`, pass `hook=inp`. Delete `hooks.py:119-121`.
- In `spec.coverage`, read each spec's text once, reuse it for the per-spec state, and add `state_sha`/`ctx` to the aggregate entry.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `sh tests/run.sh`
Expected: OK. Nothing else asserts on inline `state` entries from hooks; `test_label`/`test_recover` seed their own.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/ask.py plugins/superpowers-jev/lib/jevlib/hooks.py plugins/superpowers-jev/lib/jevlib/builders/spec.py tests/jev/test_ask.py tests/jev/test_hooks.py tests/jev/test_builders_supersonic.py
git commit -m "feat(jev): persist state_sha and ctx on every call entry"
```

---

### Task 5: Record sources and `jev report --truth`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/report.py:25-29` (`record`), `:72-184` (`build_report`, `format_report`, CLI)
- Modify: `plugins/superpowers-jev/lib/jevlib/hooks.py:103` (`source="auto_hook"`)
- Modify: `plugins/superpowers-jev/lib/jevlib/label.py:38-99` (`blind_label`, `--rule-version`, `--labeler`)
- Test: `tests/jev/test_report.py`, `tests/jev/test_hooks.py`, `tests/jev/test_label.py`

**Interfaces:**
- Produces:
  - `report.SOURCES = ("in_session", "blind_label", "auto_hook", "import")`
  - `report.TRUTHS = {"in_session": ("in_session",), "auto_hook": ("auto_hook",), "blind": ("blind_label",), "best": ("blind_label", "in_session", "auto_hook")}`
  - `report.record(call_id, claude_verdict, env, cwd=None, source="in_session", rule_version=None, labeler=None)`. Raises `ValueError` for a source not in `SOURCES`. The entry always has `source`; `rule_version` and `labeler` are included only when not None.
  - `report.record_source(rec: dict, calls: dict) -> str`. Legacy inference per Global Constraints.
  - `report.select_truth(entries, truth="best") -> dict[call_id, tuple[source, claude_verdict]]`. Latest per (call, source), then the first source in `TRUTHS[truth]` order.
  - `report.build_report(entries, since=None, point=None, truth="best")`. Each row gains `truth_mix: {source: n_calls}`. `recorded`/`unrecorded` are relative to the selected truth.
  - `report.format_report(rows, truth="best")`. Appends a `truth-mix` column (for example `blind_label 1 / in_session 2`, or `-`). After the table, a footer line `truth: <truth> (<sources joined by " > ">)`. The header's first 8 columns are unchanged (`test_format_column_order`).
  - `label.apply(lines, entries, env, cwd=None, point="verify-stop", rule_version="none", labeler=None)`. Writes `source="blind_label"`. A line is a duplicate, and an error, only if the call already has a `blind_label` record with the same `rule_version`. A different rule version, or an `in_session` record, does not block it.
  - CLI: `jev report --truth {in_session,auto_hook,blind,best}` (default `best`); `jev label ... --apply F [--rule-version V] [--labeler L]`.

- [ ] **Step 1: Write the failing tests**

`test_report.py` (local helper `rec(cid, verdict, source=None, ts=None)` adds those keys when given):
```python
def test_record_writes_source_default_in_session(self):   # record(...) -> entry["source"] == "in_session", no rule_version key
def test_record_rejects_unknown_source(self):             # record(..., source="adjudicated") raises ValueError

def test_legacy_record_source_inferred(self):
    calls = {"p": {"point": "prompt-route"}, "t": {"point": "tier"}}
    self.assertEqual(report.record_source({"call_id": "p"}, calls), "auto_hook")
    self.assertEqual(report.record_source({"call_id": "t"}, calls), "in_session")
    self.assertEqual(report.record_source({"call_id": "t", "source": "blind_label"}, calls), "blind_label")

def test_latest_wins_within_source_not_across(self):
    es = [call("a", "verify-stop", "verdict", "block"),
          rec("a", {"verdict": "block"}, source="blind_label"),
          rec("a", {"verdict": "allow"}, source="in_session")]
    self.assertEqual(report.build_report(es)["verify-stop"]["agree"], 1)                    # best -> blind
    self.assertEqual(report.build_report(es, truth="in_session")["verify-stop"]["agree"], 0)
    es.append(rec("a", {"verdict": "allow"}, source="blind_label"))
    self.assertEqual(report.build_report(es)["verify-stop"]["agree"], 0)                    # newer blind wins

def test_truth_filters_population(self):   # only in_session records; truth="blind" -> recorded 0, unrecorded ["a"]
def test_truth_mix(self):                  # one call blind, one in_session -> truth_mix == {"blind_label": 1, "in_session": 1}
def test_format_footer_names_truth(self):  # "truth: best (blind_label > in_session > auto_hook)" in format_report(rows)
def test_cli_truth_flag(self):             # cli.main(["report", "--truth", "blind", "--json"], env) == 0;
                                           # "--truth", "adjudicated" -> SystemExit with code 2
```
`test_hooks.py`: in `test_records_prompt_route_verdict_from_transcript`, the expected record now also has `source="auto_hook"`.

`test_label.py`:
```python
def test_apply_writes_blind_label_with_rule_and_labeler(self):
    # apply([A block], ..., rule_version="verify-stop.v1", labeler="subagent:x")
    # -> record source "blind_label", rule_version "verify-stop.v1", labeler "subagent:x"
def test_apply_default_rule_version_is_none_string(self):   # rule_version == "none"
def test_apply_over_in_session_record_allowed(self):        # B (in_session record in base()) -> applies, n == 1
def test_relabel_under_new_rule_allowed(self):              # same line with rule "v1" then "v2" -> both written
```
`test_apply_twice_no_duplicate` keeps its current assertions. Extend `test_cli_roundtrip` to pass `--rule-version v1 --labeler me` and assert both on the record.

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_report.py'`, and the same for `test_label.py` and `test_hooks.py`.
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

Follow the Interfaces above. `build_report` replaces its `records` dict (`report.py:73-78`) with `select_truth(entries, truth)`. `import` records are written but are not in any `TRUTHS` tuple (builder's call: the spec's `best` order names only the three sources; adjudication and import scoring are deferred).

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `sh tests/run.sh`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/report.py plugins/superpowers-jev/lib/jevlib/hooks.py plugins/superpowers-jev/lib/jevlib/label.py tests/jev/test_report.py tests/jev/test_hooks.py tests/jev/test_label.py
git commit -m "feat(jev): record sources and report --truth"
```

---

### Task 6: Readers use persisted state and resolve transcripts (`label`, `recover-states`)

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/label.py:14-35,71-90` (listing via `state.loader`, with a resolved `ctx`)
- Modify: `plugins/superpowers-jev/lib/jevlib/recover.py:58-143` (pending calls, blob writes, session-located transcripts)
- Test: `tests/jev/test_label.py`, `tests/jev/test_recover.py`

**Interfaces:**
- Consumes:
  - `state.loader(entries, log_dir)`, `state.safe_write`, `log.state_ref_entry` (Task 2);
  - `transcript.locate`, `transcript.projects_dir` (Task 3).
- Produces:
  - `label.unlabeled(entries, point="verify-stop", since=None, log_dir=None, projects_dir=None) -> (rows, missing)`.
    - Rows are `{call_id, ts, state, ctx}`, never the verdict, confidence or raw answers.
    - `ctx` is the call's `ctx` (or, for legacy calls, `{session_id, transcript_path}` from the latest `state` entry), with `transcript_path` replaced by `transcript.locate(session_id, hint, projects_dir)`.
    - "Has state" means `state.loader(...)(cid)` is not None.
    - `log_dir=None` means only inline state entries can resolve. The CLI passes `log.log_dir(env, args.root)` and `transcript.projects_dir(env)`.
  - `recover.stop_summaries(projects_dir, root, extra_paths=())`. `extra_paths` are transcript files scanned in addition to the root-slug dirs, without the `_in_root` cwd filter (their session was identified by id), deduped by path.
  - `recover.recover(env, root, projects_dir, point="verify-stop")`.
    - A call is pending when it has no `state_sha` and no `state` entry.
    - For a pending call with `ctx.session_id`, `transcript.locate(sid, ctx.transcript_path, projects_dir)` joins `extra_paths`.
    - Each recovered state is written with `state.safe_write(state, env, root)` plus `log.state_ref_entry(cid, sha, sid, path, "recovered")`. If the blob write returns None, it falls back to the inline `log.state_entry` (builder's call: recovery should never lose a rebuilt state).
    - Any later open of a logged transcript path goes through `locate`.

- [ ] **Step 1: Write the failing tests**

`test_label.py`:
```python
def test_lists_calls_with_blob_state(self):
    d = log.log_dir(self.env); sha = state.write_blob({"last_message": "done"}, d)
    rows, missing = label.unlabeled([call("Z", state_sha=sha)], log_dir=d)
    self.assertEqual(rows[0]["state"], {"last_message": "done"}); self.assertEqual(missing, 0)

def test_listing_resolves_stale_transcript_path(self):
    projects = Path(tempfile.mkdtemp()); real = projects / "-main" / "sid1.jsonl"
    real.parent.mkdir(); real.write_text("")
    c = call("Z", state_sha=sha, ctx={"session_id": "sid1", "transcript_path": "/gone/sid1.jsonl"})
    rows, _ = label.unlabeled([c], log_dir=d, projects_dir=projects)
    self.assertEqual(rows[0]["ctx"]["transcript_path"], str(real))

def test_legacy_state_entry_supplies_ctx(self):   # call A + state("A") -> rows[0]["ctx"]["session_id"] == "sess"
```
In `test_listing_resolves_stale_transcript_path`, `d`/`sha` are set up as in the previous test.

Update `test_output_is_blind` to assert `set(listed[0]) == {"call_id", "ts", "state", "ctx"}`, and that none of `"verdict"`, `"confident"`, `"raw"` is a key of `listed[0]["ctx"]`.

`test_recover.py`:
- Update `test_recover_rebuilds_state`:
  - the state entry for A has `state_sha` and no `"state"` key;
  - `state.load("A", self.env)["last_message"] == "Tests pass."`;
  - the command and output assertions move onto the loaded state.
- `test_recover_skips_errors_states_and_other_points`: add `call("H", "2026-10-12T09:40:13-0700", state_sha="f" * 64)` and assert that H gets no new state entry.
- Add:
```python
def test_recover_uses_session_ctx_outside_root_dirs(self):
    projects = Path(tempfile.mkdtemp()); (projects / "-elsewhere").mkdir()
    shutil.copy(S1, projects / "-elsewhere" / "sess-1.jsonl")
    log.append(call("A", "2026-10-12T09:40:13-0700",
                    ctx={"session_id": "sess-1", "transcript_path": "/stale/s1.jsonl"}), self.env)
    res = recover.recover(self.env, "/tmp/other-root", projects)
    self.assertEqual(res["recovered"], 1)
    self.assertEqual(state.load("A", self.env)["last_message"], "Tests pass.")

def test_recover_falls_back_inline_when_blob_write_fails(self):
    with mock.patch.object(state, "write_blob", side_effect=OSError("ro")):
        self.seed_and_recover()
    self.assertEqual(log.states_by_call(log.read_entries(self.env))["A"]["state"]["last_message"], "Tests pass.")
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_label.py'`, then `-p 'test_recover.py'`.
Expected: the new and updated tests FAIL.

- [ ] **Step 3: Implement per Interfaces**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `sh tests/run.sh`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/label.py plugins/superpowers-jev/lib/jevlib/recover.py tests/jev/test_label.py tests/jev/test_recover.py
git commit -m "feat(jev): label and recover-states read blobs and locate transcripts"
```

---

### Task 7: Log-dir registry and `jev register --scan`

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/registry.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/log.py:34-47` (`append` registers on the first write in a dir)
- Modify: `plugins/superpowers-jev/lib/jevlib/cli.py:18-20` (add `registry` to `command_modules`)
- Test: new `tests/jev/test_registry.py`

**Interfaces:**
- Produces:
  - `registry.registry_path(env) -> Path | None`. None when `JEV_LOG_DIR` is set and `JEV_REGISTRY` is not.
  - `registry.load(env) -> list[str]`. Returns `[]` for a missing, corrupt or wrong-shaped file.
  - `registry.register(log_dirs, env) -> int`. Returns the number of dirs newly added. Paths are stored resolved and absolute. Takes `fcntl.flock` on `<registry>.lock`, writes a temp file and `os.replace`s it in. Creates the parent dir.
  - `registry.safe_register(log_dir, env) -> None`. Never raises.
  - `registry.existing(env) -> list[Path]`. The registered dirs that still exist.
  - `registry.scan(roots) -> list[Path]`. Each `<x>/.superpowers/jev` that holds a `log.jsonl`. Uses `os.walk(followlinks=False)` and prunes `node_modules`, `.git` and every dot-dir except `.superpowers` (builder's call: keeps a `~/Projects` scan fast; worktree logs live at the main checkout anyway).
  - File format (builder's call): `{"version": 1, "log_dirs": ["/abs/path/.superpowers/jev", ...]}`.
  - CLI: `jev register --scan ROOT [ROOT ...]` prints `{"found": N, "registered": M}` and exits 0. With no registry path, it writes `jev register: no registry (JEV_LOG_DIR is set; set JEV_REGISTRY)` to stderr and exits 2.
  - `log.append`: if `log.jsonl` did not exist before this write, call `registry.safe_register(d, env)` after it. Import inside the function to keep `ask`'s import surface small.

- [ ] **Step 1: Write the failing tests** (`test_registry.py`)

```python
def test_no_registration_when_log_dir_set_without_registry(self):
    env = support.make_env()
    self.assertIsNone(registry.registry_path(env))
    log.append({"type": "call", "call_id": "x"}, env)
    self.assertFalse((Path(env["HOME"]) / ".superpowers" / "jev" / "registry.json").exists())

def test_first_write_registers_once(self):
    env = support.make_env(JEV_REGISTRY=str(tmp / "reg.json"))
    log.append({"type": "call", "call_id": "x"}, env); log.append({"type": "call", "call_id": "y"}, env)
    self.assertEqual(registry.load(env), [str(Path(env["JEV_LOG_DIR"]).resolve())])

def test_default_path_when_no_log_dir_override(self):
    # env = {"HOME": h} -> registry_path == h/.superpowers/jev/registry.json
def test_corrupt_registry_is_rewritten(self):      # "not json" -> register([d]) == 1; json.loads(file)["log_dirs"] == [str(d)]
def test_register_failure_never_breaks_append(self):
    # JEV_REGISTRY points under a regular file (parent is a file) -> append succeeds; log has 1 entry
def test_existing_skips_missing(self):             # register two dirs, rmtree one -> existing == [the other]

def test_scan_finds_logs_and_prunes(self):
    # root/a/.superpowers/jev/log.jsonl            -> found
    # root/b/node_modules/x/.superpowers/jev/log.jsonl -> pruned
    # root/c/.superpowers/jev/ (no log.jsonl)      -> not found
    self.assertEqual(registry.scan([root]), [root / "a" / ".superpowers" / "jev"])

def test_cli_register_scan(self):                  # cli.main(["register", "--scan", str(root)], env) == 0; stdout found 1, registered 1
def test_cli_register_without_registry_exits_2(self):
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_registry.py'`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement per Interfaces**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `sh tests/run.sh`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/registry.py plugins/superpowers-jev/lib/jevlib/log.py plugins/superpowers-jev/lib/jevlib/cli.py tests/jev/test_registry.py
git commit -m "feat(jev): log-dir registry with first-write registration and register --scan"
```

---

### Task 8: `jev report --all`, `--by`, labels on current model, `RETIRED`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/report.py` (`build_report`, `format_report`, `cmd_report`, `add_parser`)
- Test: `tests/jev/test_report.py`

**Interfaces:**
- Consumes: `report.select_truth`/`TRUTHS` (Task 5), `registry.existing(env)`/`registry.registry_path(env)` (Task 7), `log.read_dir(d)` (Task 2).
- Produces:
  - `report.RETIRED = frozenset({"operator-tier"})`
  - `report.build_report(entries, since=None, point=None, truth="best", by=None)`, where `by ∈ (None, "model", "template_version")`.
  - Each row gains:
    - `retired: bool`;
    - `current_model`, `current_template_version`: from the non-error call of that point with the latest `ts` that has a `model`;
    - `labels_current`: calls with a selected-truth record whose `model == current_model` **and** `template_version == current_template_version`;
    - when `by` is set, `by: {str(value) or "-": subrow}`. A subrow has the same counters and rates as a row, but no nested `by`.
  - `format_report(rows, truth="best")`:
    - adds a `labels-cur` column (for example `0 @jev-1.14.0/v1`) before `truth-mix`;
    - lists retired points after active ones, with the point cell suffixed ` (retired)`;
    - prints each split as an indented line `  <by>=<value>` with the same columns.
  - CLI:
    - `jev report [--all] [--by {model,template_version}] [--truth ...]`.
    - `--all` builds the report from `log.read_dir(d)` for every `registry.existing(env)`, concatenated.
    - `--all` with no registry path writes `jev report --all: no registry (set JEV_REGISTRY)` to stderr and exits 2.

- [ ] **Step 1: Write the failing tests** (`test_report.py`)

```python
def test_by_model_splits(self):
    es = [call("a", "verify-stop", "verdict", "block", model="jev-1.13.0", template_version=1),
          call("b", "verify-stop", "verdict", "allow", model="jev-1.14.0", template_version=1),
          rec("a", {"verdict": "block"})]
    r = report.build_report(es, by="model")["verify-stop"]
    self.assertEqual(set(r["by"]), {"jev-1.13.0", "jev-1.14.0"})
    self.assertEqual((r["by"]["jev-1.13.0"]["recorded"], r["by"]["jev-1.14.0"]["recorded"]), (1, 0))

def test_by_template_version(self):               # keys "1" and "2"; a call missing the field lands under "-"

def test_labels_on_current_model_needs_model_and_template_version(self):
    es = [call("old", "verify-stop", "verdict", "block", model="jev-1.13.0", template_version=1, ts="2026-11-01T00:00:00"),
          call("tv", "verify-stop", "verdict", "block", model="jev-1.14.0", template_version=1, ts="2026-11-02T00:00:00"),
          call("cur", "verify-stop", "verdict", "block", model="jev-1.14.0", template_version=2, ts="2026-11-03T00:00:00"),
          rec("old", {"verdict": "block"}), rec("tv", {"verdict": "block"})]
    r = report.build_report(es)["verify-stop"]
    self.assertEqual((r["current_model"], r["current_template_version"], r["labels_current"]), ("jev-1.14.0", 2, 0))
    es.append(rec("cur", {"verdict": "allow"}))
    self.assertEqual(report.build_report(es)["verify-stop"]["labels_current"], 1)

def test_report_all_aggregates_and_skips_missing(self):
    reg = str(tmp / "reg.json")
    for name in ("r1", "r2"):
        log.append(call(name, "tier", "picks", {}), support.make_env(JEV_LOG_DIR=str(tmp / name), JEV_REGISTRY=reg))
    registry.register([tmp / "gone"], {"JEV_REGISTRY": reg})
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        self.assertEqual(cli.main(["report", "--all", "--json"], support.make_env(JEV_REGISTRY=reg)), 0)
    self.assertEqual(json.loads(out.getvalue())["tier"]["calls"], 2)

def test_report_all_without_registry_exits_2(self):   # make_env() (JEV_LOG_DIR set, no JEV_REGISTRY) -> 2
def test_cli_by_model_prints_split_lines(self):       # text output contains "  model=jev-1.14.0"
```
Extend `test_report_tolerates_retired_point`: `rows["operator-tier"]["retired"] is True`, `"operator-tier (retired)"` appears in `format_report(rows)`, and in a mixed report the retired line comes after the `tier` line.

- [ ] **Step 2: Run them and confirm they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_report.py'`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement per Interfaces**

Factor the per-call accumulation loop (`report.py:89-116`) into a helper applied to the row and, when `by` is set, to the split subrow, so the counting logic exists once.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `sh tests/run.sh`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/lib/jevlib/report.py tests/jev/test_report.py
git commit -m "feat(jev): report --all, --by model|template_version, labels on current model, retired points"
```

---

### Task 9: Version 0.6.0 and skill docs

**Files:**
- Modify: `plugins/superpowers-jev/.claude-plugin/plugin.json:3` (`"0.5.0"` → `"0.6.0"`)
- Modify: `plugins/superpowers-jev/skills/jev/SKILL.md` (Calibration section, plus a short "Persistence" note and a `with-key` line)
- Test: `tests/jev/test_ctx.py` (plugin version)

**Interfaces:**
- Consumes: everything above. Docs only name the commands and flags defined in Tasks 1–8.

- [ ] **Step 1: Write the failing test**

In `test_ctx.py`: `test_plugin_version_is_0_6_0`: `self.assertEqual(ctx.plugin_version(), "0.6.0")`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev -p 'test_ctx.py'`
Expected: FAIL (`'0.5.0' != '0.6.0'`).

- [ ] **Step 3: Bump the version and edit SKILL.md**

Keep the SKILL.md additions brief: one or two lines each.
- **Calibration:**
  - `jev report` flags `--truth in_session|auto_hook|blind|best` (default `best` = blind > in-session > auto-hook), `--by model|template_version` and `--all`;
  - the `labels-cur` column (labels on the current model *and* template version);
  - the `truth-mix` column;
  - retired points are marked `(retired)`.
- **Label:** `jev label verify-stop --apply F --rule-version V --labeler L` records `blind_label` verdicts. Listing rows include `ctx` with the resolved transcript path.
- **Registry:** `jev register --scan <root>...` seeds the registry. Log dirs register themselves on first write.
- **Persistence:** every `jev ask` stores the state Jev saw (`<log dir>/states/`) and the call's context. The existing per-item advice to save the state file stays, because it is about recording order.
- **Key for project code:** `jev with-key -- <command> [args]` runs a command with `TYPESAFE_API_KEY` set and never prints the key.

- [ ] **Step 4: Run the full suite**

Run: `sh tests/run.sh`
Expected: `OK (skipped=2)`, with roughly 243 + 60 tests.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-jev/.claude-plugin/plugin.json plugins/superpowers-jev/skills/jev/SKILL.md tests/jev/test_ctx.py
git commit -m "docs(jev): 0.6.0 skill notes for persistence, truth sources, registry, with-key"
```

---

## Open questions

1. **`jev with-key` with no key available.** The plan exits 2 without running the command. The alternative is to run it without the variable, for project code that has its own fallback. Recommendation: exit 2. A silent run without a key hides the misconfiguration.
2. **`import` source in `--truth best`.** No caller writes `import` records in this PR, and the spec's `best` order doesn't name it, so the plan leaves it out of every truth. Recommendation: decide this with the backfill PR, where imports become real.

## Follow-ups after release (manual, outside this repo)

- Remove the stopgap Jev paragraph from `~/.claude/CLAUDE.md` once 0.6.0 is installed.
- Run `jev register --scan ~/Projects` once.
