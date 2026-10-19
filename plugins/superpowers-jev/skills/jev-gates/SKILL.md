---
name: jev-gates
description: Use alongside superpowers:subagent-driven-development, superpowers:verification-before-completion, or superpowers:diagnosing-superpowers when the superpowers-jev plugin is installed. Adds optional Jev judgments at named decision points; they are logged in shadow mode and acted on only for points promoted to on.
---

# Jev gates for superpowers

This skill is an overlay. It never replaces or reorders a superpowers step. Each point below is named by its superpowers **section heading** and **v7.0.0 line anchor**, and says what to ask Jev at that point.

Load `superpowers-jev:jev` first. It gives the helper path, the protocol, and the record shapes.

## Before using any point

1. Run `jev compat`.
   - If it prints `"compatible": false`, say once: "jev-gates: superpowers <version> is not a version these anchors were verified against; skipping Jev gates." Then do nothing else from this skill.
   - v7.x is compatible. So are v6.4.1 and v6.4.2, whose anchored files are byte-identical to v7.0.0.
2. Run `jev mode`. If it prints `off`, do nothing else from this skill.

In **shadow** mode, every point below runs the superpowers path unchanged and then records your verdict. The **On** line applies only when `jev mode --point <point>` prints `on` and the answer is `confident`.

## subagent-driven-development

### tier: "## Model Selection" (SKILL.md:184-219)

- **When:** before choosing the model for an implementer or a task reviewer.
- **Ask (implementer):** `jev state role=implementer brief=@<brief file> | jev ask tier --state -`
- **Ask (reviewer):** `jev diff-state <BASE> <HEAD> | jev ask tier --state -`. For a scoped re-review of a fix diff, add `--scoped-rereview`.
- **On:** a non-null `verdict.implementer` or `verdict.reviewer` is the tier: `cheap`, `standard`, or `capable` maps to your platform's fast-cheap, standard, or most capable model. Ledger it as `tier from jev p=<detail.confidences>`. The floors at :208-214 are already applied in code. A null verdict means you decide, as today.
- **Record:** `{"picks": {"implementer": "<tier you used>"}}` or `{"picks": {"reviewer": "<tier you used>"}}`.

### report-evidence: "### 2. Handle the report" (SKILL.md:286-306); "## Report Format" (implementer-prompt.md:128-153)

- **When:** the status is DONE or DONE_WITH_CONCERNS, before `review-package`.
- **Ask:** `jev state report=@<report file> status=<STATUS> tdd_required:=<true|false> | jev ask report-evidence --state -`
- **On:** if `verdict` is `missing_evidence`, send the implementer back for the evidence named in `detail.fired` before generating the review package.
- **Record:** `{"verdict": "complete"}` or `{"verdict": "missing_evidence"}`, as you judged the report.

### severity: "### 3. Review the task"; rubric "## Calibration" (task-reviewer-prompt.md:145-159, code-reviewer.md:95-120)

- **When:** the task reviewer has returned, before "### 4. The fix loop" decides whether the loop triggers (SKILL.md:356-357).
- **Ask:** `jev findings-state <review report file> > <state file>`, then `jev ask severity --state <state file>`.
- **On:** if `verdict` is `contested`, adjudicate the severity of each finding in `detail.contested` inline before you decide the loop. This is a severity ruling at loop entry. It is not the round-5 breaker, and it never dismisses a finding.
- **Record:** `{"items": ["<final severity>", ...]}`, in the order of the saved state's `findings`, which `detail.labels` repeats.

### re-review: "### 4. The fix loop", "The re-review is scoped" (SKILL.md:396-403); verdicts "### Finding Verdicts" (re-review-prompt.md:80-85)

- **When:** the fix report carries its covering tests, command, and output, before you dispatch the scoped re-reviewer.
- **Ask:** `jev rereview-state --findings <open-findings file> --base <FIX_BASE> --head HEAD > <state file>`, then `jev ask re-review --state <state file>`.
- **On:** if `verdict` is `return_to_implementer`, send the findings in `detail.flagged` back to the implementer **without** dispatching the re-reviewer. The round still counts toward the 5-round cap. Ledger it as `re-review skipped: jev not_addressed p=<confidence>`. Otherwise, dispatch the re-review as today. Jev never approves alone: `addressed` never skips the re-reviewer, because the new-breakage check (re-review-prompt.md:87-90) needs it.
- **Record:** the re-reviewer's verdicts as `{"items": ["addressed", "not_addressed", ...]}`, in the order of the saved state's `findings` (`detail.labels`).

## verification-before-completion

### verify-stop: "## The Iron Law", "## The Gate Function", "## Common Failures" (SKILL.md:14-48)

This point runs automatically as a Stop hook. When the hook blocks with "Jev verify-stop", follow "## The Gate Function": run the command that proves the claim and show its output, or state the actual status. The hook logs the judged state (your last message and the commands since your last edit). Label calls blind: `jev label verify-stop` prints one JSON object per unrecorded call (`call_id`, `ts`, `state`). Give `block` only if `last_message` claims completion, a fix, or passing AND no `commands_since_last_edit` output checks that claim; otherwise `allow`. Write one JSONL line `{"call_id": ..., "verdict": ...}` per call, then run `jev label verify-stop --apply <file>`. Calls from before state was logged need `jev recover-states verify-stop` first.

## diagnosing-superpowers

### diag-confidence: analyst "Return format" (prompts/analyst-common.md:23-38; stumbles.md:25-28; quality-evidence.md:24-26)

- **When:** each analyst has returned, before you compile the report.
- **Ask:** `jev diag-state <analyst output file> > <state file>`, then `jev ask diag-confidence --state <state file>`.
- **On:** mark every finding in `detail.contested` as "confidence contested" in the report.
- **Record:** `{"items": ["<the confidence you kept>", ...]}`, in the order of the saved state's `findings` (`detail.labels`). The builder drops analyst findings that lack evidence or a confidence, so index your own list by the state file, not by the analyst's output.

## using-superpowers

### prompt-route: "## The Rule", "## Skill Priority" (SKILL.md:10-31)

This point runs automatically as a UserPromptSubmit hook. In `on` mode it adds the hint "Likely applicable skill: X". The hint never replaces the rule that you check skills yourself. It is recorded automatically at Stop with the first superpowers skill you invoked.
