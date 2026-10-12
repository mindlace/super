import json
import subprocess
import unittest

import support
from jevlib import log
from jevlib.builders import cite, ledger, spec

FX = support.FIXTURES


class CiteTest(unittest.TestCase):
    def test_extract_claim_forms(self):
        claims = cite.extract_claims((FX / "survey-report.md").read_text())
        self.assertEqual([(c["file"], c["line"], c["end"]) for c in claims],
                         [("cited.py", 8, 8), ("cited.py", 4, 5), ("missing.py", 3, 3), ("cited.py", 400, 400)])

    def test_state_sections_and_unreadable(self):
        s = cite.build_state((FX / "survey-report.md").read_text(), FX)
        self.assertEqual(len(s["claims"]), 2)
        first = s["claims"][0]
        self.assertIn("returns {} for an empty file", first["claim"])
        self.assertTrue(first["section"].startswith("3: "))   # 8 - 5
        self.assertIn("8:     if not text:", first["section"])
        self.assertEqual([u["why"] for u in s["unreadable"]], ["file not found", "line out of range"])

    def test_no_claims(self):
        self.assertEqual(cite.build_state("nothing cited here", FX), {"claims": [], "unreadable": []})


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.text = (FX / "ledger.md").read_text()

    def test_defect_classes_from_tally_then_tags(self):
        self.assertEqual(ledger.defect_classes(self.text),
                         ["missing-declaration", "unmodeled-consumer", "schema-drift"])

    def test_live_operators_are_dispatched_only_with_spec_summaries(self):
        ops = ledger.live_operators(self.text, FX)
        self.assertEqual([o["slug"] for o in ops], ["auth", "billing"])
        self.assertEqual(ops[0]["summary"], "Auth spec: Validate session tokens in middleware for every route.")


class SpecTest(unittest.TestCase):
    def test_interface_rows(self):
        self.assertEqual(spec.interface_rows((FX / "spec-a.md").read_text()), 2)
        self.assertEqual(spec.interface_rows((FX / "spec-b.md").read_text()), 1)

    def test_spec_state(self):
        s = spec.spec_state(FX / "spec-a.md")
        self.assertEqual(s["interface_rows"], 2)
        self.assertTrue(s["spec_text"].startswith("# Auth spec"))

    def test_traceability_requirements(self):
        self.assertEqual(spec.traceability_requirements((FX / "design.md").read_text()),
                         ["Tokens are validated by middleware", "Prices are integer cents",
                          "Search reads the product index"])

    def test_coverage_counts_carriers_across_specs_and_logs_once(self):
        carried = {"spec-a.md": [0], "spec-b.md": [0, 1]}

        def fake_ask(point, state, env, call_id=None, cwd=None, write_log=True):
            self.assertEqual(point, "fidelity-coverage")
            self.assertFalse(write_log)
            name = "spec-a.md" if state["spec_text"].startswith("# Auth") else "spec-b.md"
            return {"enabled": True, "verdict": carried[name], "confident": True, "raw": {},
                    "template_version": 1}

        env = support.make_env()
        out = spec.coverage(FX / "design.md", [FX / "spec-a.md", FX / "spec-b.md"], env,
                            call_id="cov-1", ask_fn=fake_ask)
        self.assertEqual(out["verdict"], {"uncovered": [2], "multiply_covered": [0]})
        self.assertEqual([t["index"] for t in out["targets"]], [0, 2])
        entries = log.read_entries(env)
        self.assertEqual(len(entries), 1)
        self.assertEqual((entries[0]["call_id"], entries[0]["compare"]), ("cov-1", "coverage"))

    def test_coverage_fails_open_when_any_spec_ask_is_disabled(self):
        env = support.make_env()
        out = spec.coverage(FX / "design.md", [FX / "spec-a.md"], env,
                            ask_fn=lambda *a, **k: {"enabled": False, "reason": "jev unavailable: http 529"})
        self.assertFalse(out["enabled"])
        self.assertIn("http 529", out["reason"])

    def test_coverage_mode_off(self):
        env = support.make_env(SUPERPOWERS_JEV="off")
        self.assertEqual(spec.coverage(FX / "design.md", [FX / "spec-a.md"], env)["reason"], "mode off")


class BuilderCliTest(unittest.TestCase):
    def test_cite_spec_ledger_registered(self):
        def run(*args):
            p = subprocess.run([str(support.JEV)] + list(args), capture_output=True, text=True, timeout=20)
            self.assertEqual(p.returncode, 0, p.stderr)
            return json.loads(p.stdout)
        self.assertEqual(len(run("cite", str(FX / "survey-report.md"), "--root", str(FX))["claims"]), 2)
        self.assertEqual(run("spec-state", str(FX / "spec-a.md"))["interface_rows"], 2)
        self.assertEqual(len(run("defect-state", "--ledger", str(FX / "ledger.md"),
                                 "--escalation", str(FX / "spec-a.md"))["classes"]), 3)


if __name__ == "__main__":
    unittest.main()
