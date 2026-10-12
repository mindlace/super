import io
import unittest
from contextlib import redirect_stderr

import support  # noqa: F401  (sets sys.path)
from jevlib.mode import base_mode, resolve_mode


class ModeTest(unittest.TestCase):
    def test_no_key_is_off_even_when_on_requested(self):
        self.assertEqual(resolve_mode({"SUPERPOWERS_JEV": "on"}), "off")

    def test_key_defaults_to_shadow(self):
        self.assertEqual(resolve_mode({"TYPESAFE_API_KEY": "k"}), "shadow")

    def test_explicit_modes(self):
        for m in ("off", "shadow", "on"):
            self.assertEqual(resolve_mode({"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV": m}), m)

    def test_blank_key_is_off(self):
        self.assertEqual(resolve_mode({"TYPESAFE_API_KEY": "  "}), "off")

    def test_per_point_promotion_from_shadow(self):
        env = {"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV_ON": "re-review, tier"}
        self.assertEqual(resolve_mode(env, "re-review"), "on")
        self.assertEqual(resolve_mode(env, "tier"), "on")
        self.assertEqual(resolve_mode(env, "severity"), "shadow")
        self.assertEqual(resolve_mode(env), "shadow")

    def test_off_is_a_kill_switch_over_promotion(self):
        env = {"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV": "off", "SUPERPOWERS_JEV_ON": "tier"}
        self.assertEqual(resolve_mode(env, "tier"), "off")

    def test_invalid_mode_value_warns_and_defaults(self):
        for raw in ("true", "1", "yes"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertEqual(base_mode({"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV": raw}), "shadow")
            self.assertIn("invalid SUPERPOWERS_JEV", err.getvalue())

    def test_case_and_whitespace_insensitive(self):
        self.assertEqual(base_mode({"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV": " ON "}), "on")
        self.assertEqual(base_mode({"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV": "Shadow"}), "shadow")


if __name__ == "__main__":
    unittest.main()
