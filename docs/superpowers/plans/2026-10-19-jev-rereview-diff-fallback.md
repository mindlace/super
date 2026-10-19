# re-review: whole-diff fallback, `unclear` as abstention, offline evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Jev's `re-review` point the fix diff it needs, stop scoring its `unclear` answers as wrong, and measure offline whether Jev can be trusted to say "addressed" (the evidence for a later skip-on-all-addressed `on` mode).

**Architecture:** `rereview_state` adds a top-level `fix_diff` (the whole fix diff, capped) whenever any finding matched no changed file; the `re-review` question reads `fix_diff` for findings with empty `hunks`. `jev report` treats an `items` pick of `unclear` as an abstention. The evaluation is an operational task run against a scratch log: real (finding, fix) pairs plus synthetic negatives (finding paired with the pre-fix implementation diff it was raised against).

**Tech Stack:** Python 3 stdlib, unittest; plugin `superpowers-jev`.

**Spec:** This plan is the spec. From the 2026-10-19 re-review investigation:
1. 37/66 historical items reached Jev with `hunks: []` because hunks attach only to files named literally in the finding text; Jev correctly answered `unclear` on 35 of them. The fix diffs are small (1.6k–34k chars, ~8k typical) and fit in the state.
2. `unclear` is an abstention, but `jev report` scores it as a disagreement (labels are binary).
3. Before any `on`-mode change, measure Jev's discrimination: with a 98.5% "addressed" base rate, real data alone can't show whether a confident "addressed" is trustworthy. Synthetic negatives supply known not-addressed cases.
4. No change to `on`-mode behaviour or the jev-gates protocol in this plan.

## Global Constraints

- `sh tests/run.sh` stays green (baseline 234 OK, 2 skipped, plus shell tests).
- `fix_diff` is capped at `FIX_DIFF_MAX_CHARS = 60000` (truncated at a hunk boundary when possible, with a trailing `\n[... truncated ...]` marker when cut). It is omitted when every finding has hunks.
- The state stays under the existing 28,000-token budget for typical inputs; no budget change.
- Bump `questions/re-review.json` `"version"` 1 → 2; bump `plugins/superpowers-jev/.claude-plugin/plugin.json` `0.4.0` → `0.5.0`.
- `jev report` row keys unchanged; only how `items` `unclear` picks are classified changes.
- Evaluation writes only to a scratch `JEV_LOG_DIR`, never to a repo's real log.

## Review Focus

1. Every finding matches files → no `fix_diff` key (state identical to today's) → test in Task 1.
2. Diff larger than the cap → `fix_diff` ≤ cap + marker length, ends with the marker → test in Task 1.
3. Mixed: one finding matched, one not → matched finding keeps its hunks, unmatched has `hunks: []`, `fix_diff` present → test in Task 1.
4. Template schema accepts states with and without `fix_diff`; rejects unknown keys as before → test in Task 1.
5. A severity/citation item pick of `unclear` is an abstention too (rule is generic for `items`) → test in Task 2.

---

### Task 1: whole-diff fallback for re-review

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/review.py` (`rereview_state`, new constant `FIX_DIFF_MAX_CHARS`, helper `fix_diff(repo, base, head) -> str`)
- Modify: `plugins/superpowers-jev/questions/re-review.json` (schema: optional top-level `fix_diff` string; `status` question + `how_to_read` + `unclear` criterion read `fix_diff` when `findings[{i}].hunks` is empty; `version` 2)
- Modify: `tests/jev/fixtures/states/re-review.json` only if needed; Test: `tests/jev/test_builders_superpowers.py`, `tests/jev/test_templates_superpowers.py`

**Interfaces:**
- Produces: `rereview_state(findings_text, repo, base, head) -> {"findings": [{"text", "hunks"}], "fix_diff"?: str}`.

- [ ] **Step 1: Write failing tests** (use the existing temp-git-repo helpers in `test_builders_superpowers.py`):
  - `test_rereview_no_fix_diff_when_all_matched`: finding names the changed file → `"fix_diff" not in state`.
  - `test_rereview_fix_diff_when_unmatched`: finding text names no file → its `hunks == []` and `state["fix_diff"]` contains the changed line (`+...`).
  - `test_rereview_mixed_findings`: two findings, one names the file → first has hunks, second `[]`, `fix_diff` present.
  - `test_rereview_fix_diff_capped`: a change larger than `FIX_DIFF_MAX_CHARS` → `len(fix_diff) <= FIX_DIFF_MAX_CHARS + len(marker)` and endswith marker.
  - In `test_templates_superpowers.py`: `test_rereview_schema_accepts_fix_diff` (state with and without `fix_diff` validate; an extra unknown top-level key is refused) and `test_rereview_question_mentions_fix_diff` (the `status` question/instructions text contains `fix_diff`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `fix_diff` = `git diff -U3 base head` truncated per the constraint; added to the state only when some finding's `hunks` is empty. Question wording: judge the lines in `findings[{i}].hunks`; when that list is empty, judge the parts of `fix_diff` relevant to the finding; `unclear` only when neither shows the code the finding is about.
- [ ] **Step 4: Run** `sh tests/run.sh` → PASS.
- [ ] **Step 5: Commit** `fix(jev): give re-review the whole fix diff when a finding names no file`.

### Task 2: `unclear` item picks are abstentions in `jev report`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/report.py` (`units`, `items` branch); `plugins/superpowers-jev/skills/jev/SKILL.md` (Calibration: one line); `plugins/superpowers-jev/.claude-plugin/plugin.json` (0.5.0)
- Test: `tests/jev/test_report.py`

**Interfaces:**
- `units` for `items`: `jev_acted = None if pick == "unclear" else pick`; raw unchanged. Existing acted/abstain logic then counts it as `abstained` (Claude labels are never "none" for items).

- [ ] **Step 1: Write failing tests:**
  - `test_items_unclear_is_abstention`: items call, picks `[addressed (conf), unclear (conf)]`, Claude `[addressed, addressed]` → `acted_agree == 1`, `acted_units == 1`, `abstained == 1`, `confident_units == 1`, `confident_wrong == 0`, raw `agree == 1`.
  - `test_items_unclear_generic_for_severity`: a `severity`-point items call with an `unclear` pick → `abstained == 1`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `sh tests/run.sh` → PASS.
- [ ] **Step 5: Commit** `fix(jev): score unclear item picks as abstentions in jev report`.

### Task 3: Offline evaluation (operational; controller + one subagent; no code change)

Inputs: `/private/tmp/claude-501/-Users-mindlace-Projects/92e14ea6-4c5d-4426-850b-f685a6c3c898/scratchpad/rereview/` (`matched.json`, per-call `.state.json`/`.diff`, rebuild scripts) and `/Users/mindlace/Projects/sfhousing` git.

- [ ] **Step 1: Positives.** For each of the 20 historical calls, rebuild the state with the branch's builder (`plugins/superpowers-jev/bin/jev rereview-state`) from the same findings/base/head. Ground truth = the recorded re-reviewer labels (65 addressed, 1 not_addressed).
- [ ] **Step 2: Synthetic negatives.** For each finding, build a state pairing the finding with the diff of the implementation it was raised against (the task's review range, BASE..FIX_BASE — the code that still contains the defect), using the same builder. Ground truth = not_addressed. Skip findings whose task range cannot be recovered; report how many.
- [ ] **Step 3: Run** `jev ask re-review --state <file>` for every state with `JEV_LOG_DIR` set to a scratch directory.
- [ ] **Step 4: Report** a confusion table (truth × Jev pick) overall and for confident picks (≥0.8): especially P(confident `addressed` | not_addressed) — the false-skip rate a skip-on-all-addressed mode would incur — and P(confident `addressed` | addressed) — the dispatch saving. Note per-call budget errors.
