import copy
import unittest

import support
from jevlib.lint import lint_template

TOY = support.load_json(support.TOY_TEMPLATES / "toy.json")


def mutated(fn):
    t = copy.deepcopy(TOY)
    fn(t)
    return lint_template(t, "toy")


class LintTest(unittest.TestCase):
    def test_toy_is_clean(self):
        self.assertEqual(lint_template(TOY, "toy"), [])

    def test_conservative_option_must_be_first(self):
        def f(t):
            t["questions"]["kind"]["criteria"] = {"fruit": "A fruit", "unclear": "?", "tool": "A tool"}
        self.assertTrue(any("first option" in e for e in mutated(f)))

    def test_no_match_option_required(self):
        def f(t):
            t["questions"]["kind"]["no_match"] = "missing"
        self.assertTrue(any("no_match" in e for e in mutated(f)))

    def test_noul_needs_true_false_and_polarity(self):
        def f(t):
            del t["questions"]["wrong"]["polarity"]
            t["questions"]["wrong"]["criteria"] = {"yes": "x"}
        errs = mutated(f)
        self.assertTrue(any("polarity" in e for e in errs))
        self.assertTrue(any("true and false" in e for e in errs))

    def test_any_true_over_requires_true_is_problem(self):
        def f(t):
            t["questions"]["wrong"]["polarity"] = "true_is_fact"
        self.assertTrue(any("true = something is wrong" in e for e in mutated(f)))

    def test_open_state_schema_rejected(self):
        def f(t):
            del t["state_schema"]["additionalProperties"]
        self.assertTrue(any("closed object" in e for e in mutated(f)))

    def test_unsupported_schema_keyword_rejected(self):
        def f(t):
            t["state_schema"]["properties"]["text"]["pattern"] = ".*"
        self.assertTrue(any("unsupported schema keyword 'pattern'" in e for e in mutated(f)))

    def test_for_each_needs_item_reference(self):
        def f(t):
            t["questions"]["kind"]["instructions"] = "What kind of thing is it?"
        self.assertTrue(any("{i}" in e for e in mutated(f)))

    def test_point_must_match_file_name(self):
        self.assertTrue(any("file name" in e for e in lint_template(TOY, "other")))

    def test_cookbook_required(self):
        def f(t):
            t["cookbook"] = ""
        self.assertTrue(any("cookbook" in e for e in mutated(f)))

    def test_unknown_rule(self):
        def f(t):
            t["combine"]["rule"] = "majority_vote"
        self.assertTrue(any("unknown rule" in e for e in mutated(f)))


if __name__ == "__main__":
    unittest.main()
