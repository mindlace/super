"""Live smoke test: one real System One call per template with its fixture state.
Asserts shape only; calibration is `jev report` over real shadow runs, not a test.
Runs only with JEV_LIVE=1 and TYPESAFE_API_KEY set (about 14 tiny calls, < $0.01)."""
import os
import tempfile
import unittest

import support
from jevlib import ask, client, templates
from jevlib.builders import spec

LIVE = os.environ.get("JEV_LIVE") == "1" and os.environ.get("TYPESAFE_API_KEY")
POINTS = sorted(p.stem for p in support.QUESTIONS.glob("*.json"))


def live_post(payload, key, endpoint=None):
    return client.post(payload, key, endpoint=endpoint, timeout=15.0)   # shape test: allow a cold start


@unittest.skipUnless(LIVE, "set JEV_LIVE=1 and TYPESAFE_API_KEY to run live smoke tests")
class LiveSmokeTest(unittest.TestCase):
    def env(self):
        return {"TYPESAFE_API_KEY": os.environ["TYPESAFE_API_KEY"], "SUPERPOWERS_JEV": "shadow",
                "JEV_LOG_DIR": tempfile.mkdtemp(prefix="jevlive-"), "HOME": tempfile.mkdtemp()}

    def test_every_template_round_trips(self):
        for point in POINTS:
            with self.subTest(point=point):
                state = support.fixture_state(point)
                out = ask.ask(point, state, self.env(), post=live_post)
                self.assertTrue(out["enabled"], out.get("reason"))
                self.assertIn("verdict", out)
                self.assertIsInstance(out["confident"], bool)
                expected, _ = templates.expand_questions(support.template(point), state)
                self.assertEqual(sorted(out["raw"]), sorted(expected))
                for qid, answer in out["raw"].items():
                    q = expected[qid]
                    self.assertEqual(answer["type"], q["type"])
                    if q["type"] == "choice":
                        self.assertIn(answer["choice"], q["criteria"])
                        self.assertTrue(0.0 <= answer["confidence"] <= 1.0)
                    elif q["type"] == "noul":
                        self.assertTrue(0.0 <= answer["noul"] <= 1.0)
                    else:
                        self.assertEqual(len(answer["probabilities"]), len(q["criteria"]))

    def test_coverage_live(self):
        out = spec.coverage(support.FIXTURES / "design.md",
                            [support.FIXTURES / "spec-a.md", support.FIXTURES / "spec-b.md"], self.env(),
                            ask_fn=lambda *a, **k: ask.ask(*a, post=live_post, **k))
        self.assertTrue(out["enabled"], out.get("reason"))
        self.assertEqual(set(out["verdict"]), {"uncovered", "multiply_covered"})


if __name__ == "__main__":
    unittest.main()
