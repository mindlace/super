import copy
import unittest

import support
from jevlib import schema, templates
from support import agent_text_violations, evidence_paths, state_values
from jevlib.lint import lint_template

POINTS = ["re-review", "severity", "tier", "report-evidence", "verify-stop", "prompt-route", "diag-confidence"]

# State fields that carry agent-written (or otherwise untrusted) text, per point.
# `[]` marks array items. Every field whose state_schema description says
# "quoted evidence" must be listed here, so a new evidence field cannot slip by.
AGENT_FIELDS = {
    "re-review": ["findings[].text", "findings[].hunks", "fix_diff"],
    "severity": ["findings[].text", "findings[].reviewer_severity"],
    "tier": ["brief"],
    "report-evidence": ["report"],
    "verify-stop": ["last_message", "commands_since_last_edit[].command", "commands_since_last_edit[].output_tail"],
    "prompt-route": ["prompt"],
    "diag-confidence": ["findings[].finding", "findings[].evidence", "findings[].analyst_confidence"],
}
def by_qid(table, default):
    """pick/noul callable from {qid: value}, falling back to default."""
    return lambda qid, *opts: table.get(qid, default(*opts) if callable(default) else default)


class SuperpowersTemplatesTest(unittest.TestCase):
    def test_lint_clean_and_plugin(self):
        for p in POINTS:
            t = support.template(p)
            self.assertEqual(lint_template(t, p), [], p)
            self.assertEqual(t["plugin"], "superpowers", p)
            self.assertIn("docs.typesafe.ai/", t["cookbook"], p)

    def test_fixture_states_validate_and_expand(self):
        for p in POINTS:
            t, s = support.template(p), support.fixture_state(p)
            self.assertEqual(schema.validate(t["state_schema"], s), [], p)
            qs, _ = templates.expand_questions(t, s)
            self.assertTrue(qs, p)
            self.assertLess(templates.estimate_tokens(s), templates.STATE_TOKEN_LIMIT, p)

    def test_agent_text_is_named_quoted_evidence(self):
        for p in POINTS:
            t, s = support.template(p), support.fixture_state(p)
            declared = AGENT_FIELDS[p]
            self.assertTrue(set(evidence_paths(t["state_schema"])) <= set(declared), p)
            self.assertEqual(agent_text_violations(t, s, declared), [], p)
            for path in declared:
                self.assertTrue(state_values(s, path), "%s: %s absent from fixture" % (p, path))

    def test_rereview_schema_accepts_fix_diff(self):
        t, s = support.template("re-review"), support.fixture_state("re-review")
        with_diff = dict(s, fix_diff="diff --git a/x b/x\n+added")
        self.assertEqual(schema.validate(t["state_schema"], with_diff), [])
        without = {k: v for k, v in s.items() if k != "fix_diff"}
        self.assertEqual(schema.validate(t["state_schema"], without), [])
        self.assertNotEqual(schema.validate(t["state_schema"], dict(s, extra="x")), [])

    def test_rereview_question_mentions_fix_diff(self):
        t = support.template("re-review")
        instr = "\n".join(support.strings(t["questions"]["status"]["instructions"]))
        self.assertIn("`fix_diff`", instr)

    def test_rereview_addressed_requires_code_shown(self):
        c = support.template("re-review")["questions"]["status"]["criteria"]["addressed"]
        self.assertIn("show the code the finding is about", c)
        self.assertIn("choose unclear", c)

    def test_agent_text_check_rejects_bad_templates(self):
        t, s = support.template("re-review"), support.fixture_state("re-review")
        paths = AGENT_FIELDS["re-review"]

        unticked = copy.deepcopy(t)
        unticked["questions"]["status"]["instructions"]["question"] = "Is findings[{i}].text still present?"
        self.assertTrue(any("outside backticks" in v for v in agent_text_violations(unticked, s, paths)))

        unreferenced = copy.deepcopy(t)
        unreferenced["questions"]["status"]["instructions"] = {"question": "Is the defect still present?"}
        self.assertTrue(any("never referenced" in v for v in agent_text_violations(unreferenced, s, paths)))

        placeholder = copy.deepcopy(t)
        placeholder["questions"]["status"]["instructions"]["question"] += " {findings[{i}].text}"
        self.assertTrue(any("placeholder" in v for v in agent_text_violations(placeholder, s, paths)))

        pasted = copy.deepcopy(t)
        pasted["questions"]["status"]["criteria"]["unclear"] = s["findings"][0]["text"]
        self.assertTrue(any("interpolated" in v for v in agent_text_violations(pasted, s, paths)))

    def test_re_review_returns_to_implementer_on_confident_not_addressed(self):
        pick = by_qid({"status.1": "not_addressed"}, "addressed")
        out, reqs = support.ask_point("re-review", support.fixture_state("re-review"), support.ok(pick=pick))
        self.assertEqual(len(reqs), 1)
        self.assertEqual(sorted(reqs[0]["payload"]["questions"]), ["status.0", "status.1"])
        self.assertEqual(list(reqs[0]["payload"]["questions"]["status.0"]["criteria"])[0], "not_addressed")
        self.assertEqual((out["verdict"], out["detail"]["flagged"]), ("return_to_implementer", [1]))

    def test_re_review_never_skips_when_all_addressed(self):
        out, _ = support.ask_point("re-review", support.fixture_state("re-review"), support.ok(pick="addressed"))
        self.assertEqual(out["verdict"], "dispatch_rereview")

    def test_severity_contested_on_confident_disagreement(self):
        pick = by_qid({"level.0": "important", "level.1": "important"}, "minor")
        out, _ = support.ask_point("severity", support.fixture_state("severity"), support.ok(pick=pick))
        self.assertEqual((out["verdict"], out["detail"]["contested"]), ("contested", [1]))

    def test_tier_implementer_floor_and_role_filter(self):
        noul = lambda qid: 0.9 if qid == "prose_only" else 0.1
        out, reqs = support.ask_point("tier", support.fixture_state("tier"), support.ok(pick="cheap", noul=noul))
        self.assertEqual(sorted(reqs[0]["payload"]["questions"]), ["implementer", "prose_only"])
        self.assertEqual(out["verdict"], {"implementer": "standard"})
        state = {"role": "reviewer", "diff_stat": " a.py | 2 +-", "files_changed": 1, "lines_changed": 2,
                 "risk_signals": [], "scoped_rereview": True}
        out, reqs = support.ask_point("tier", state, support.ok(pick="cheap"))
        self.assertEqual(list(reqs[0]["payload"]["questions"]), ["reviewer"])
        self.assertEqual(out["verdict"], {"reviewer": "cheap"})

    def test_report_evidence_fires_on_any_missing_fact(self):
        noul = lambda qid: 0.9 if qid == "no_red_output" else 0.05
        out, reqs = support.ask_point("report-evidence", support.fixture_state("report-evidence"), support.ok(noul=noul))
        self.assertEqual((out["verdict"], out["detail"]["fired"]), ("missing_evidence", ["no_red_output"]))
        self.assertIn("concerns_while_done", reqs[0]["payload"]["questions"])
        state = dict(support.fixture_state("report-evidence"), status="DONE_WITH_CONCERNS", tdd_required=False)
        out, reqs = support.ask_point("report-evidence", state, support.ok(noul=0.05))
        self.assertEqual(out["verdict"], "complete")
        self.assertNotIn("concerns_while_done", reqs[0]["payload"]["questions"])
        self.assertNotIn("no_red_output", reqs[0]["payload"]["questions"])

    def test_verify_stop_needs_both_claim_and_no_support(self):
        out, _ = support.ask_point("verify-stop", support.fixture_state("verify-stop"), support.ok(noul=0.9))
        self.assertEqual(out["verdict"], "block")
        noul = lambda qid: 0.9 if qid == "claims_done" else 0.1
        out, _ = support.ask_point("verify-stop", support.fixture_state("verify-stop"), support.ok(noul=noul))
        self.assertEqual(out["verdict"], "allow")

    def test_prompt_route_options_and_gate(self):
        state = support.fixture_state("prompt-route")
        pick = lambda qid, opts: "superpowers:systematic-debugging"
        noul = lambda qid: 0.1 if qid == "prose_suffices" else (0.1 if qid.startswith("fits.") and qid != "fits.1" else 0.9)
        out, reqs = support.ask_point("prompt-route", state, support.ok(pick=pick, noul=noul))
        crit = reqs[0]["payload"]["questions"]["skill"]["criteria"]
        self.assertEqual(list(crit), ["none", "superpowers:brainstorming", "superpowers:systematic-debugging",
                                      "superpowers:test-driven-development"])
        self.assertEqual(out["verdict"], {"skill": "superpowers:systematic-debugging"})
        out, _ = support.ask_point("prompt-route", state, support.ok(pick="none"))
        self.assertEqual(out["verdict"], {"skill": None})

    def test_diag_confidence_contested(self):
        out, reqs = support.ask_point("diag-confidence", support.fixture_state("diag-confidence"), support.ok(conf=0.9))
        self.assertEqual(reqs[0]["payload"]["questions"]["support.0"]["type"], "score")
        self.assertEqual([it["pick"] for it in out["items"]], ["low", "low"])
        self.assertEqual((out["verdict"], out["detail"]["contested"]), ("contested", [0, 1]))


if __name__ == "__main__":
    unittest.main()
