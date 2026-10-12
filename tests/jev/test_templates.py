import unittest

import support
from jevlib import templates

ENV = {"JEV_QUESTIONS_DIR": str(support.TOY_TEMPLATES)}


class TemplatesTest(unittest.TestCase):
    def setUp(self):
        self.t = templates.load_template("toy", ENV)

    def test_load_rejects_bad_names(self):
        for bad in ("../etc/passwd", "Toy", "", "a/b"):
            with self.assertRaises(templates.TemplateError):
                templates.load_template(bad, ENV)

    def test_missing_template_is_template_error(self):
        with self.assertRaises(templates.TemplateError):
            templates.load_template("nope", ENV)

    def test_expand_for_each_and_only_if(self):
        qs, index = templates.expand_questions(self.t, {"text": "t", "items": ["apple", "saw"]})
        self.assertEqual(sorted(qs), ["kind.0", "kind.1", "wrong"])
        self.assertEqual(qs["kind.1"]["instructions"], "What kind of thing is `items[1]`?")
        self.assertEqual(index["kind.1"], {"base": "kind", "item": 1})
        self.assertEqual(index["wrong"], {"base": "wrong", "item": None})
        self.assertNotIn("informal", qs)  # only_if strict is falsy

    def test_only_if_true_includes_question(self):
        qs, _ = templates.expand_questions(self.t, {"text": "t", "items": [], "strict": True})
        self.assertIn("informal", qs)

    def test_template_only_keys_never_sent(self):
        qs, _ = templates.expand_questions(self.t, {"text": "t", "items": ["a"], "strict": True})
        for q in qs.values():
            for key in templates.TEMPLATE_ONLY_KEYS:
                self.assertNotIn(key, q)

    def test_choice_keeps_fixed_order_then_state_options(self):
        q = {"type": "choice", "instructions": "x", "criteria": {"none": "no match"},
             "options_from_state": {"path": "skills", "key": "name", "description": "description"}}
        crit = templates.choice_criteria(q, {"skills": [{"name": "b", "description": "B"},
                                                        {"name": "a", "description": "A"}]})
        self.assertEqual(list(crit), ["none", "b", "a"])
        self.assertEqual(crit["b"], "B")

    def test_string_options_from_state(self):
        q = {"type": "choice", "instructions": "x", "criteria": {"new_class": "none fit"},
             "options_from_state": {"path": "classes"}}
        crit = templates.choice_criteria(q, {"classes": ["missing-decl", "new_class"]})
        self.assertEqual(crit, {"new_class": "none fit", "missing-decl": None})

    def test_too_many_options_is_error(self):
        q = {"type": "choice", "instructions": "x", "criteria": {"none": "n"},
             "options_from_state": {"path": "xs"}}
        with self.assertRaises(templates.TemplateError):
            templates.choice_criteria(q, {"xs": ["o%d" % i for i in range(300)]})

    def test_build_request_shape(self):
        payload, _ = templates.build_request(self.t, {"text": "t", "items": []})
        self.assertEqual(payload["model"], "jev-latest")
        self.assertEqual(payload["state"], {"text": "t", "items": []})
        self.assertEqual(list(payload["questions"]), ["wrong"])

    def test_estimate_tokens_is_chars_over_four(self):
        self.assertEqual(templates.estimate_tokens("x" * 400), 100)


if __name__ == "__main__":
    unittest.main()
