import unittest

import support  # noqa: F401
from jevlib.schema import validate

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["a", "xs"],
    "properties": {
        "a": {"type": "string"},
        "n": {"type": "integer"},
        "flag": {"type": "boolean"},
        "level": {"type": "string", "enum": ["low", "high"]},
        "xs": {"type": "array", "minItems": 1,
               "items": {"type": "object", "required": ["t"],
                         "properties": {"t": {"type": "string"}}}},
    },
}


class SchemaTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(validate(SCHEMA, {"a": "x", "n": 3, "flag": True, "level": "low",
                                           "xs": [{"t": "y"}]}), [])

    def test_missing_required(self):
        self.assertIn("$: missing required 'a'", validate(SCHEMA, {"xs": [{"t": "y"}]}))

    def test_closed_object_rejects_extra_keys(self):
        errs = validate(SCHEMA, {"a": "x", "xs": [{"t": "y"}], "budget": 5})
        self.assertIn("$: unexpected property 'budget'", errs)

    def test_bool_is_not_integer(self):
        self.assertEqual(validate(SCHEMA, {"a": "x", "n": True, "xs": [{"t": "y"}]}),
                         ["$.n: expected integer"])

    def test_enum_and_nested_items_and_min_items(self):
        self.assertTrue(validate(SCHEMA, {"a": "x", "level": "mid", "xs": [{"t": "y"}]}))
        self.assertEqual(validate(SCHEMA, {"a": "x", "xs": [{"t": 1}]}), ["$.xs[0].t: expected string"])
        self.assertEqual(validate(SCHEMA, {"a": "x", "xs": []}), ["$.xs: fewer than 1 items"])

    def test_wrong_top_type(self):
        self.assertEqual(validate(SCHEMA, ["not", "an", "object"]), ["$: expected object"])


if __name__ == "__main__":
    unittest.main()
