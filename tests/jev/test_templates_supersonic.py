import copy
import json
import re
import unittest

import support
from support import agent_text_violations, evidence_paths, state_values
from jevlib import schema, templates
from jevlib.builders import spec
from jevlib.lint import lint_template

POINTS = ["defect-class", "bounce", "operator-tier", "surface-route", "fidelity-coverage", "citation"]
ALL_POINTS = ["re-review", "severity", "tier", "report-evidence", "verify-stop", "prompt-route",
              "diag-confidence"] + POINTS
BUDGET_RE = re.compile(r"budget|rate|limit|reserve|seven_day|five_hour|usage|headroom", re.I)
# State fields carrying agent-written text, per point (see AGENT_FIELDS in test_templates_superpowers).
# citation's unreadable[].claim is deliberately absent: no question references it.
AGENT_FIELDS = {
    "defect-class": ["escalation"],
    "bounce": ["message"],
    "operator-tier": ["spec_text"],
    "surface-route": ["event"],
    "fidelity-coverage": ["spec_text"],
    "citation": ["claims[].claim"],
}
MODEL_NAME_RE = re.compile(r"opus|sonnet|haiku|gpt|gemini", re.I)


class SupersonicTemplatesTest(unittest.TestCase):
    def test_exactly_the_thirteen_points_exist(self):
        found = sorted(p.stem for p in support.QUESTIONS.glob("*.json"))
        self.assertEqual(found, sorted(ALL_POINTS))

    def test_lint_clean_and_plugin(self):
        for p in POINTS:
            t = support.template(p)
            self.assertEqual(lint_template(t, p), [], p)
            self.assertEqual(t["plugin"], "supersonic", p)
            self.assertIn("docs.typesafe.ai/", t["cookbook"], p)

    def test_fixture_states_validate_and_expand(self):
        for p in POINTS:
            t, s = support.template(p), support.fixture_state(p)
            self.assertEqual(schema.validate(t["state_schema"], s), [], p)
            self.assertTrue(templates.expand_questions(t, s)[0], p)

    def test_agent_text_is_named_quoted_evidence(self):
        for p in POINTS:
            t, s = support.template(p), support.fixture_state(p)
            declared = AGENT_FIELDS[p]
            self.assertTrue(set(evidence_paths(t["state_schema"])) <= set(declared), p)
            self.assertEqual(agent_text_violations(t, s, declared), [], p)
            for path in declared:
                self.assertTrue(state_values(s, path), "%s: %s absent from fixture" % (p, path))

    def test_agent_text_check_rejects_bad_supersonic_templates(self):
        t, s = support.template("surface-route"), support.fixture_state("surface-route")
        unticked = copy.deepcopy(t)
        unticked["questions"]["route"]["instructions"]["question"] = "What does event[0] report?"
        self.assertTrue(any("outside backticks" in v for v in agent_text_violations(unticked, s, ["event"])))
        pasted = copy.deepcopy(t)
        pasted["questions"]["route"]["criteria"]["unclear"] = s["event"]
        self.assertTrue(any("interpolated" in v for v in agent_text_violations(pasted, s, ["event"])))

    def test_operator_tier_state_schema_has_no_budget_field(self):
        t = support.template("operator-tier")
        props = t["state_schema"]["properties"]
        self.assertEqual(sorted(props), ["interface_rows", "spec_text"])
        self.assertFalse([k for k in props if BUDGET_RE.search(k)])
        self.assertIs(t["state_schema"]["additionalProperties"], False)

    def test_operator_tier_refuses_state_carrying_budget(self):
        state = dict(support.fixture_state("operator-tier"), seven_day_used=91)
        out, reqs = support.ask_point("operator-tier", state, support.ok())
        self.assertFalse(out["enabled"])
        self.assertIn("unexpected property 'seven_day_used'", out["reason"])
        self.assertEqual(reqs, [])

    def test_tier_templates_never_name_a_model(self):
        for p in ("tier", "operator-tier"):
            self.assertIsNone(MODEL_NAME_RE.search(json.dumps(support.template(p))), p)

    def test_operator_tier_floor_keeps_capable_unless_mechanical(self):
        out, _ = support.ask_point("operator-tier", support.fixture_state("operator-tier"),
                                   support.ok(pick="cheap", noul=0.05))
        self.assertEqual(out["verdict"], {"tier": "cheap"})
        out, _ = support.ask_point("operator-tier", support.fixture_state("operator-tier"),
                                   support.ok(pick="cheap", noul=0.5))
        self.assertEqual(out["verdict"], {"tier": "capable"})
        state = dict(support.fixture_state("operator-tier"), interface_rows=7)
        out, _ = support.ask_point("operator-tier", state, support.ok(pick="cheap", noul=0.05))
        self.assertEqual(out["verdict"], {"tier": "capable"})

    def test_defect_class_options(self):
        out, reqs = support.ask_point("defect-class", support.fixture_state("defect-class"),
                                      support.ok(pick="missing-declaration"))
        crit = reqs[0]["payload"]["questions"]["class"]["criteria"]
        self.assertEqual(list(crit), ["new_class", "missing-declaration", "unmodeled-consumer", "schema-drift"])
        self.assertEqual(out["verdict"], {"class": "missing-declaration"})
        out, _ = support.ask_point("defect-class", support.fixture_state("defect-class"), support.ok(pick="new_class"))
        self.assertEqual(out["verdict"], {"class": None})

    def test_bounce_needs_0_8(self):
        out, reqs = support.ask_point("bounce", support.fixture_state("bounce"), support.ok(pick="billing", conf=0.85))
        self.assertEqual(list(reqs[0]["payload"]["questions"]["operator"]["criteria"]), ["unattributable", "auth", "billing"])
        self.assertEqual(out["verdict"], {"operator": "billing"})
        out, _ = support.ask_point("bounce", support.fixture_state("bounce"), support.ok(pick="billing", conf=0.75))
        self.assertEqual(out["verdict"], {"operator": None})

    def test_surface_route_override_on_repeated_death(self):
        state = dict(support.fixture_state("surface-route"), consecutive_deaths=2)
        out, _ = support.ask_point("surface-route", state, support.ok(pick="routine"))
        self.assertEqual(out["verdict"], {"route": "repeated_death"})
        out, _ = support.ask_point("surface-route", support.fixture_state("surface-route"), support.ok(pick="frame_event"))
        self.assertEqual(out["verdict"], {"route": "frame_event"})

    def test_citation_downgrades_unreadable_and_says_nothing(self):
        out, reqs = support.ask_point("citation", support.fixture_state("citation"), support.ok(pick="supports"))
        self.assertEqual(sorted(reqs[0]["payload"]["questions"]), ["relation.0", "relation.1"])
        self.assertEqual(out["verdict"], "downgrade")   # the unreadable claim alone forces it
        self.assertEqual(len(out["detail"]["also_flagged"]), 1)
        pick = lambda qid, opts: "says_nothing" if qid == "relation.1" else "supports"
        state = dict(support.fixture_state("citation"), unreadable=[])
        out, _ = support.ask_point("citation", state, support.ok(pick=pick))
        self.assertEqual((out["verdict"], out["detail"]["flagged"]), ("downgrade", [1]))

    def test_fidelity_coverage_end_to_end_through_coverage(self):
        def responder(payload):
            carried = [0] if payload["state"]["spec_text"].startswith("# Auth") else [0, 1]
            return (200, support.answer_all(payload, noul=lambda qid: 0.95 if int(qid.split(".")[1]) in carried else 0.05), 0)
        with support.StubServer(responder) as srv:
            env = support.make_env(srv.url)
            out = spec.coverage(support.FIXTURES / "design.md",
                                [support.FIXTURES / "spec-a.md", support.FIXTURES / "spec-b.md"], env)
        self.assertEqual(len(srv.requests), 2)
        self.assertEqual(out["verdict"], {"uncovered": [2], "multiply_covered": [0]})
        self.assertTrue(out["confident"])


if __name__ == "__main__":
    unittest.main()
