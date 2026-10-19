import contextlib
import io
import json
import os
import tempfile
import unittest

import support
from jevlib import cli, label, log, report


def call(cid, point="verify-stop", ts="2026-10-11T10:00:00", **kw):
    e = {"type": "call", "call_id": cid, "point": point, "compare": "verdict",
         "verdict": "allow", "confident": True, "ts": ts}
    e.update(kw)
    return e


def state(cid, s=None):
    return log.state_entry(cid, s or {"summary": "state of " + cid}, "sess", "/t.jsonl", "stop")


def seed(env, entries):
    for e in entries:
        log.append(e, env)


class LabelTest(unittest.TestCase):
    def setUp(self):
        self.env = support.make_env()

    def base(self):
        return [
            call("A"), state("A"),
            call("B"), state("B"), {"type": "record", "call_id": "B", "claude_verdict": {"verdict": "allow"}},
            call("C"),
            call("D", error="boom"), state("D"),
            call("T", point="tier"), state("T"),
        ]

    def test_lists_unrecorded_with_state_only(self):
        listed, missing = label.unlabeled(self.base())
        self.assertEqual([r["call_id"] for r in listed], ["A"])
        self.assertEqual(missing, 1)

    def test_output_is_blind(self):
        listed, _ = label.unlabeled(self.base())
        self.assertEqual(set(listed[0]), {"call_id", "ts", "state"})

    def test_since_filters(self):
        entries = [call("old", ts="2026-10-10T09:00:00"), state("old"),
                   call("new", ts="2026-10-12T09:00:00"), state("new")]
        listed, _ = label.unlabeled(entries, since="2026-10-11")
        self.assertEqual([r["call_id"] for r in listed], ["new"])

    def test_apply_records_and_rejects(self):
        seed(self.env, self.base())
        lines = [json.dumps({"call_id": "A", "verdict": "block"}),
                 "",
                 json.dumps({"call_id": "nope", "verdict": "allow"}),
                 json.dumps({"call_id": "T", "verdict": "allow"}),
                 json.dumps({"call_id": "A", "verdict": "maybe"})]
        n, errors = label.apply(lines, log.read_entries(self.env), self.env)
        self.assertEqual(n, 1)
        self.assertEqual(len(errors), 3)
        recs = [e for e in log.read_entries(self.env) if e.get("type") == "record"
                and e["call_id"] == "A"]
        self.assertEqual(recs[0]["claude_verdict"], {"verdict": "block"})

    def test_apply_malformed_json_is_error(self):
        seed(self.env, self.base())
        n, errors = label.apply(["{not json"], log.read_entries(self.env), self.env)
        self.assertEqual(n, 0)
        self.assertEqual(len(errors), 1)

    def test_apply_twice_no_duplicate(self):
        seed(self.env, self.base())
        line = json.dumps({"call_id": "A", "verdict": "block"})
        self.assertEqual(label.apply([line], log.read_entries(self.env), self.env)[0], 1)
        n, errors = label.apply([line], log.read_entries(self.env), self.env)
        self.assertEqual(n, 0)
        self.assertEqual(len(errors), 1)
        self.assertIn("A", errors[0])
        recs = [e for e in log.read_entries(self.env)
                if e.get("type") == "record" and e["call_id"] == "A"]
        self.assertEqual(len(recs), 1)

    def test_cli_roundtrip(self):
        seed(self.env, self.base())
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(cli.main(["label", "verify-stop"], self.env), 0)
        rows = [json.loads(l) for l in out.getvalue().splitlines()]
        self.assertEqual([r["call_id"] for r in rows], ["A"])
        self.assertIn("1 unrecorded verify-stop calls have no state", err.getvalue())
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "labels.jsonl")
            with open(path, "w") as f:
                f.write(json.dumps({"call_id": "A", "verdict": "block"}) + "\n")
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                self.assertEqual(cli.main(["label", "verify-stop", "--apply", path], self.env), 0)
            self.assertIn("recorded 1", err.getvalue())
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cli.main(["label", "verify-stop", "--apply", path], self.env), 1)
        rows = report.build_report(log.read_entries(self.env), point="verify-stop")
        self.assertEqual(rows["verify-stop"]["recorded"], 2)


if __name__ == "__main__":
    unittest.main()
