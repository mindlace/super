# Retire operator-tier; score acted verdicts in jev report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `operator-tier` Jev point (not a fit for Jev) and make `jev report` judge picks points by the verdict an `on` run would act on.

**Architecture:** Delete the point's question file, its builder (`spec-state`, `interface_rows`), fixture, tests, and every skill/doc reference; keep `coverage` in `builders/spec.py`. In `report.py`, compute confident-and-wrong from the acted verdict, put acted-agreement first, and rename the raw column.

**Tech Stack:** Python 3 stdlib, unittest, sh tests; plugins `superpowers-jev` and `supersonic`.

**Spec:** This plan is the spec. From the 2026-10-19 investigation:
1. operator-tier is retired: "which tier should run this spec" is a cost/risk policy, the floor makes it moot in decomposed packages (7/7 cross-consumption ≥ .96), its labels were the default action copied, and no lower-tier run ever produces an outcome signal.
2. `jev report`'s headline columns misread picks points with floors/gates: "agreement" and "conf-wrong" score Jev's raw choice (operator-tier: raw `standard` floored to `capable` == Claude was counted as confident-and-wrong 4/4). Score the acted verdict instead.
3. Dropped (ruled): applying floors on abstention — only operator-tier's floor fully determined the answer; `tier`'s floor (`min: standard`) is a minimum, so turning an abstention into `standard` would be wrong.

## Global Constraints

- `sh tests/run.sh` stays green (current baseline: 230 OK, 2 skipped, plus shell tests).
- Historical `operator-tier` entries already in users' logs must not break `jev report` (it still lists them under their point name; no crash).
- `jev ask operator-tier` after removal must fail open like any unknown point (existing behaviour for a missing template: `{"enabled": false, ...}`, exit 0).
- No change to any other point's question file or combine rule.
- Bump `plugins/superpowers-jev/.claude-plugin/plugin.json` `0.3.0` → `0.4.0`; bump `plugins/supersonic/.claude-plugin/plugin.json` minor version.

## Review Focus

1. A log containing old operator-tier calls and records: `jev report` and `jev report --point operator-tier` still run → test in Task 1.
2. `jev ask operator-tier` with a key set returns `enabled: false` and exits 0 → test in Task 1.
3. A gated point (`prompt-route`) where acted is None and Claude says "none": counted as acted agreement, not conf-wrong → test in Task 2.
4. A confident pick whose acted verdict is None for a non-"none" Claude label (abstain): counted as abstained, not conf-wrong → test in Task 2.
5. `verdict`/`items` points: raw == acted, so their numbers are unchanged → test in Task 2.

---

### Task 1: Retire operator-tier

**Files:**
- Delete: `plugins/superpowers-jev/questions/operator-tier.json`, `tests/jev/fixtures/states/operator-tier.json`
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/spec.py` (remove `interface_rows`, `spec_state`, the `spec-state` parser and any helpers only they use; update module docstring to coverage only)
- Modify: `tests/jev/test_builders_supersonic.py` (remove interface_rows/spec_state/spec-state CLI tests), `tests/jev/test_templates_supersonic.py` (remove operator-tier from `POINTS`, the state-fields map, and the operator-tier-specific tests; keep the `tier` budget test, dropping only `"operator-tier"` from its loop)
- Modify: `plugins/supersonic/skills/superconductor/SKILL.md` (remove the operator-tier Jev point section ~229-236; the "Operator tier" policy text itself stays)
- Modify: `plugins/superpowers-jev/skills/jev/SKILL.md` (remove the `jev spec-state` builder row; remove `operator-tier` from the picks row)
- Modify: `tests/test_skill_md.sh`, `tests/test_jev_skills.sh` (drop operator-tier / `jev spec-state` from their lists)
- Modify: `plugins/superpowers-jev/lib/jevlib/lint.py` only if it enumerates points (check)
- Modify: `README.md` if it lists points (check with grep)
- Test: `tests/jev/test_report.py`, `tests/jev/test_ask.py`

**Interfaces:**
- Produces: no `spec-state` CLI command; `builders/spec.py` keeps `coverage` and everything it uses.

- [ ] **Step 1: Write failing tests:**
  - `test_ask.py::test_retired_operator_tier_fails_open`: with `support.StubServer(support.ok())` and `env = support.make_env(srv.url)`, `ask.ask("operator-tier", {"spec_text": "x"}, env)` returns `enabled` False and `srv.requests == []` (call `ask.ask` directly — `support.ask_point` loads the template first).
  - `test_report.py::test_report_tolerates_retired_point`: seed an operator-tier `call` (compare `picks`, detail choices `{"tier": "standard"}`, verdict `{"tier": "capable"}`) and a `record` `{"picks": {"tier": "capable"}}`; `build_report` returns a row for `operator-tier` and `format_report` runs.
  - `test_builders_supersonic.py::test_spec_state_command_removed`: `cli.main(["spec-state", "x"])` exits non-zero (argparse `SystemExit` with code 2).
- [ ] **Step 2: Run** `python3 -m unittest discover -s tests/jev -t tests/jev` → the new tests fail (operator-tier still answers; spec-state still exists).
- [ ] **Step 3:** Delete and edit the files above. Run `grep -rn "operator-tier\|spec-state\|spec_state\|interface_rows" --exclude-dir=.git . | grep -v '^./docs/superpowers/'` → no hits except the two new tests.
- [ ] **Step 4: Run** `sh tests/run.sh` → all pass.
- [ ] **Step 5: Commit** `refactor(jev)!: retire the operator-tier point and spec-state builder`.

### Task 2: Score acted verdicts in `jev report`

**Files:**
- Modify: `plugins/superpowers-jev/lib/jevlib/report.py` (`build_report`, `format_report`)
- Modify: `plugins/superpowers-jev/skills/jev/SKILL.md` (Calibration bullet list), `README.md` if it describes the columns
- Modify: `plugins/superpowers-jev/.claude-plugin/plugin.json` (0.4.0), `plugins/supersonic/.claude-plugin/plugin.json` (minor bump)
- Test: `tests/jev/test_report.py`

**Interfaces:**
- `build_report` rows keep all existing keys (`agree`, `units`, `agreement`, `acted_agree`, `acted_units`, `acted_agreement`, `abstained`, …) so `--json` consumers don't break; `confident_wrong` / `confident_units` / `confident_wrong_rate` change meaning to: among units where Jev was confident AND its acted verdict was not an abstention (acted not None, or Claude said "none"), the share where the acted verdict ≠ Claude (with acted None == Claude "none" counting as agreement).
- `format_report` columns, in order: `point calls err rec acted-agreement conf-wrong abstain raw-agreement would-skip`.

- [ ] **Step 1: Write failing tests** in `test_report.py`:
  - `test_conf_wrong_scores_acted_pick`: picks call, confident, raw `standard`, acted `capable`, Claude `capable` → `confident_wrong == 0`, `confident_units == 1`, `agree == 0`.
  - `test_conf_wrong_counts_acted_mismatch`: confident, raw `cheap`, acted `standard`, Claude `capable` → `confident_wrong == 1`.
  - `test_gated_none_matches_claude_none`: picks call with verdict `{"skill": None}`, confident raw `superpowers:x`, Claude `{"picks": {"skill": "none"}}` → `acted_agree == 1`, `confident_wrong == 0`.
  - `test_abstain_not_conf_wrong`: confident key but acted None, Claude `capable` → `abstained == 1`, `confident_units == 0`.
  - `test_verdict_points_unchanged`: a `verdict` call (confident `block`, Claude `allow`) → `agreement == acted_agreement == 0`, `confident_wrong == 1`.
  - `test_format_column_order`: header line starts with `point calls err rec acted-agreement conf-wrong abstain raw-agreement` (split on whitespace).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `build_report`/`format_report`; update the Calibration bullets in skills/jev/SKILL.md ("acted-agreement: agreement of the verdict an `on` run would act on; raw-agreement: Jev's own choice before floors/gates"); bump versions.
- [ ] **Step 4: Run** `sh tests/run.sh` → PASS.
- [ ] **Step 5: Commit** `fix(jev): score acted verdicts for agreement and conf-wrong in jev report`.
