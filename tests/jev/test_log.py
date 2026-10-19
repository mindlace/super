import unittest

import support  # noqa: F401  (puts jevlib on sys.path)
from jevlib import log


class StatesByCallTest(unittest.TestCase):
    def test_latest_state_wins(self):
        a = log.state_entry("c1", {"v": 1}, "s", "/t", "hook")
        b = log.state_entry("c1", {"v": 2}, "s", "/t", "recovered")
        other = {"type": "call", "call_id": "c1"}
        got = log.states_by_call([a, other, b, log.state_entry("c2", {"v": 3}, None, None, "hook")])
        self.assertEqual(got["c1"]["state"], {"v": 2})
        self.assertEqual(got["c1"]["source"], "recovered")
        self.assertEqual(set(got), {"c1", "c2"})


if __name__ == "__main__":
    unittest.main()
