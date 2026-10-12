import unittest

import support  # noqa: F401
from jevlib import combine


def noul(p):
    return {"type": "noul", "noul": p}


def choice(c, conf):
    return {"type": "choice", "choice": c, "confidence": conf, "probabilities": {c: 1.0}}


def idx(*qids):
    out = {}
    for q in qids:
        base, _, item = q.partition(".")
        out[q] = {"base": base, "item": int(item) if item else None}
    return out


class AnyTrueOverTest(unittest.TestCase):
    P = {"threshold": 0.7, "hit": "missing_evidence", "miss": "complete"}

    def test_any_flag_fires(self):
        r = combine.any_true_over(self.P, {"a": noul(0.1), "b": noul(0.71)}, idx("a", "b"), {})
        self.assertEqual((r["verdict"], r["confident"], r["detail"]["fired"]),
                         ("missing_evidence", True, ["b"]))

    def test_max_not_mean(self):
        answers = {"a": noul(0.0), "b": noul(0.0), "c": noul(0.0), "d": noul(0.9)}
        r = combine.any_true_over(self.P, answers, idx("a", "b", "c", "d"), {})
        self.assertEqual(r["verdict"], "missing_evidence")

    def test_clear_is_confident_only_when_every_flag_is_low(self):
        r = combine.any_true_over(self.P, {"a": noul(0.05), "b": noul(0.2)}, idx("a", "b"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("complete", True))
        r = combine.any_true_over(self.P, {"a": noul(0.05), "b": noul(0.5)}, idx("a", "b"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("complete", False))

    def test_per_question_threshold(self):
        p = dict(self.P, thresholds={"a": 0.95})
        r = combine.any_true_over(p, {"a": noul(0.9)}, idx("a"), {})
        self.assertEqual(r["verdict"], "complete")

    def test_zero_noul_answers_is_not_a_confident_miss(self):
        r = combine.any_true_over(self.P, {}, idx(), {})
        self.assertEqual((r["verdict"], r["confident"]), ("complete", False))
        r = combine.any_true_over(self.P, {"k.0": choice("a", 0.99)}, idx("k.0"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("complete", False))


class AllTrueOverTest(unittest.TestCase):
    P = {"thresholds": {"claims_done": 0.8, "unsupported": 0.7}, "hit": "block", "miss": "allow"}

    def test_both_over_blocks(self):
        r = combine.all_true_over(self.P, {"claims_done": noul(0.9), "unsupported": noul(0.75)},
                                  idx("claims_done", "unsupported"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("block", True))

    def test_one_under_allows(self):
        r = combine.all_true_over(self.P, {"claims_done": noul(0.9), "unsupported": noul(0.6)},
                                  idx("claims_done", "unsupported"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("allow", False))
        r = combine.all_true_over(self.P, {"claims_done": noul(0.1), "unsupported": noul(0.9)},
                                  idx("claims_done", "unsupported"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("allow", True))

    def test_missing_answer_allows_unconfidently(self):
        r = combine.all_true_over(self.P, {"claims_done": noul(0.9)}, idx("claims_done"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("allow", False))


class PickIfConfidentTest(unittest.TestCase):
    TIER = {"threshold": 0.7, "exclude": ["unclear"], "order": ["capable", "standard", "cheap"],
            "floors": {"implementer": [{"min": "standard", "when": [{"noul": "prose_only", "over": 0.5}]}],
                       "reviewer": [{"min": "standard", "when": [{"state": "scoped_rereview", "not": True}]}]}}

    def test_confident_pick(self):
        r = combine.pick_if_confident(self.TIER, {"implementer": choice("cheap", 0.9), "prose_only": noul(0.1)},
                                      idx("implementer", "prose_only"), {})
        self.assertEqual(r["verdict"], {"implementer": "cheap"})
        self.assertTrue(r["confident"])
        self.assertEqual(r["detail"]["choices"], {"implementer": "cheap"})

    def test_floor_raises_cheap_when_brief_is_prose(self):
        r = combine.pick_if_confident(self.TIER, {"implementer": choice("cheap", 0.9), "prose_only": noul(0.8)},
                                      idx("implementer", "prose_only"), {})
        self.assertEqual(r["verdict"], {"implementer": "standard"})
        self.assertEqual(r["detail"]["floored"], {"implementer": ["cheap", "standard"]})

    def test_floor_fails_safe_when_its_noul_is_missing(self):
        r = combine.pick_if_confident(self.TIER, {"implementer": choice("cheap", 0.9)}, idx("implementer"), {})
        self.assertEqual(r["verdict"], {"implementer": "standard"})

    def test_reviewer_floor_relaxed_only_for_scoped_rereview(self):
        a = {"reviewer": choice("cheap", 0.9)}
        self.assertEqual(combine.pick_if_confident(self.TIER, a, idx("reviewer"), {})["verdict"],
                         {"reviewer": "standard"})
        self.assertEqual(combine.pick_if_confident(self.TIER, a, idx("reviewer"), {"scoped_rereview": True})["verdict"],
                         {"reviewer": "cheap"})

    def test_low_confidence_and_excluded_give_none(self):
        r = combine.pick_if_confident(self.TIER, {"reviewer": choice("capable", 0.5)}, idx("reviewer"), {})
        self.assertEqual((r["verdict"], r["confident"]), ({"reviewer": None}, False))
        r = combine.pick_if_confident(self.TIER, {"reviewer": choice("unclear", 0.99)}, idx("reviewer"), {})
        self.assertEqual((r["verdict"], r["confident"]), ({"reviewer": None}, True))

    def test_override_from_state_count(self):
        p = {"threshold": 0.7, "exclude": ["unclear"],
             "overrides": [{"question": "route", "pick": "repeated_death",
                            "when": [{"state": "consecutive_deaths", "over": 1}]}]}
        r = combine.pick_if_confident(p, {"route": choice("routine", 0.9)}, idx("route"), {"consecutive_deaths": 2})
        self.assertEqual(r["verdict"], {"route": "repeated_death"})
        r = combine.pick_if_confident(p, {"route": choice("routine", 0.9)}, idx("route"), {})
        self.assertEqual(r["verdict"], {"route": "routine"})


class GatedPickTest(unittest.TestCase):
    P = {"question": "skill", "threshold": 0.7, "exclude": ["none"],
         "gate": {"questions": ["acts", "procedure", "prose_suffices"], "inverted": ["prose_suffices"], "min_mean": 0.3},
         "fits": {"question": "fits", "state_path": "skills", "key": "name", "min": 0.5}}
    STATE = {"skills": [{"name": "superpowers:brainstorming"}, {"name": "superpowers:systematic-debugging"}]}

    def answers(self, pick, conf, gate, fit1):
        return {"skill": choice(pick, conf), "acts": noul(gate), "procedure": noul(gate),
                "prose_suffices": noul(1 - gate), "fits.0": noul(0.1), "fits.1": noul(fit1)}

    def ix(self):
        return idx("skill", "acts", "procedure", "prose_suffices", "fits.0", "fits.1")

    def test_pick_survives_gate_and_fit(self):
        r = combine.gated_pick(self.P, self.answers("superpowers:systematic-debugging", 0.9, 0.8, 0.9), self.ix(), self.STATE)
        self.assertEqual(r["verdict"], {"skill": "superpowers:systematic-debugging"})
        self.assertAlmostEqual(r["detail"]["gate_mean"], 0.8)

    def test_low_gate_suppresses(self):
        r = combine.gated_pick(self.P, self.answers("superpowers:systematic-debugging", 0.9, 0.1, 0.9), self.ix(), self.STATE)
        self.assertEqual(r["verdict"], {"skill": None})

    def test_low_fit_suppresses(self):
        r = combine.gated_pick(self.P, self.answers("superpowers:systematic-debugging", 0.9, 0.8, 0.2), self.ix(), self.STATE)
        self.assertEqual(r["verdict"], {"skill": None})


class PerItemPickTest(unittest.TestCase):
    RE = {"question": "status", "threshold": 0.8,
          "escalate_if": {"options": ["not_addressed"], "threshold": 0.8,
                          "hit": "return_to_implementer", "miss": "dispatch_rereview"}}

    def test_any_confident_not_addressed_escalates(self):
        a = {"status.0": choice("addressed", 0.95), "status.1": choice("not_addressed", 0.85)}
        r = combine.per_item_pick(self.RE, a, idx("status.0", "status.1"), {})
        self.assertEqual(r["verdict"], "return_to_implementer")
        self.assertEqual(r["detail"]["flagged"], [1])
        self.assertEqual([it["pick"] for it in r["items"]], ["addressed", "not_addressed"])

    def test_weak_not_addressed_does_not_escalate(self):
        a = {"status.0": choice("not_addressed", 0.6)}
        r = combine.per_item_pick(self.RE, a, idx("status.0"), {})
        self.assertEqual((r["verdict"], r["confident"]), ("dispatch_rereview", False))

    def test_also_flag_from_state(self):
        p = {"question": "relation", "threshold": 0.8, "also_flag": "unreadable",
             "escalate_if": {"options": ["contradicts", "says_nothing"], "threshold": 0.8,
                             "hit": "downgrade", "miss": "keep"}}
        r = combine.per_item_pick(p, {"relation.0": choice("supports", 0.99)}, idx("relation.0"),
                                  {"unreadable": [{"claim": "x"}]})
        self.assertEqual(r["verdict"], "downgrade")
        self.assertEqual(r["detail"]["also_flagged"], [{"claim": "x"}])

    def test_compare_to_marks_contested(self):
        p = {"question": "level", "threshold": 0.8,
             "compare_to": {"state_path": "findings", "field": "reviewer_severity",
                            "order": ["critical", "important", "minor"], "min_distance": 1}}
        state = {"findings": [{"reviewer_severity": "important"}, {"reviewer_severity": "minor"},
                              {"reviewer_severity": "critical"}]}
        a = {"level.0": choice("important", 0.9), "level.1": choice("critical", 0.9),
             "level.2": choice("minor", 0.5)}
        r = combine.per_item_pick(p, a, idx("level.0", "level.1", "level.2"), state)
        self.assertEqual((r["verdict"], r["detail"]["contested"]), ("contested", [1]))

    def test_score_uses_most_likely_level(self):
        p = {"question": "support", "threshold": 0.5, "score_levels": ["low", "medium", "high"]}
        a = {"support.0": {"type": "score", "score": 1.4, "confidence": 0.6,
                           "probabilities": {"0": 0.1, "1": 0.4, "2": 0.5}}}
        r = combine.per_item_pick(p, a, idx("support.0"), {})
        self.assertEqual(r["items"][0]["pick"], "high")


class CoverageRulesTest(unittest.TestCase):
    def test_items_true_over(self):
        p = {"question": "carries", "threshold": 0.5, "min_confidence": 0.6}
        a = {"carries.0": noul(0.95), "carries.1": noul(0.05), "carries.2": noul(0.55)}
        r = combine.items_true_over(p, a, idx("carries.0", "carries.1", "carries.2"), {})
        self.assertEqual((r["verdict"], r["confident"], r["detail"]["uncertain"]), ([0, 2], False, [2]))

    def test_count_exactly_one(self):
        r = combine.count_exactly_one([[0, 1], [1, 3], []], 4)
        self.assertEqual(r, {"uncovered": [2], "multiply_covered": [1], "counts": [1, 2, 0, 1]})


class ApplyTest(unittest.TestCase):
    def test_apply_ignores_unknown_answer_keys(self):
        t = {"combine": {"rule": "any_true_over", "threshold": 0.7, "hit": "h", "miss": "m"}}
        r = combine.apply(t, {"a": noul(0.1), "stray": noul(0.99)}, idx("a"), {})
        self.assertEqual(r["verdict"], "m")


if __name__ == "__main__":
    unittest.main()
