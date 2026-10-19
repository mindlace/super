import contextlib
import io
import json
import os
import tempfile
import unittest

import support
from jevlib import cli, log, recover
from jevlib.builders import transcript

FX = support.FIXTURES / "recover"
S1 = FX / "-tmp-repo" / "s1.jsonl"


def call(cid, ts, point="verify-stop", **kw):
    e = {"type": "call", "call_id": cid, "point": point, "compare": "verdict",
         "verdict": "allow", "confident": True, "ts": ts}
    e.update(kw)
    return e


def summ(ts):
    return {"at": recover.parse_ts(ts), "session_id": "s", "transcript_path": "/t.jsonl",
            "index": 0}


class RecoverTest(unittest.TestCase):
    def setUp(self):
        self.env = support.make_env()

    def test_parse_ts_mixed_offsets(self):
        a = recover.parse_ts("2026-10-12T09:40:13-0700")
        b = recover.parse_ts("2026-10-12T16:40:14.200Z")
        self.assertLess(a, b)
        self.assertAlmostEqual((b - a).total_seconds(), 1.2, places=3)

    def test_slug(self):
        self.assertEqual(recover.slug("/Users/m/Projects/sfhousing/.claude/worktrees/x"),
                         "-Users-m-Projects-sfhousing--claude-worktrees-x")

    def test_sibling_repo_excluded(self):
        got = recover.stop_summaries(FX, "/tmp/repo")
        self.assertEqual([(s["transcript_path"], s["at"]) for s in got],
                         [(str(S1), recover.parse_ts("2026-10-12T16:40:14.200Z")),
                          (str(S1), recover.parse_ts("2026-10-12T16:40:20.000Z"))])
        self.assertEqual({s["session_id"] for s in got}, {"sess-1"})
        entries = transcript.load(str(S1), tail_bytes=None)
        for s in got:
            self.assertEqual(entries[s["index"]].get("subtype"), "stop_hook_summary")

    def test_match_nearest_and_ambiguous(self):
        near = summ("2026-10-12T16:40:14.200Z")
        later = summ("2026-10-12T16:40:20.000Z")
        matched, bad = recover.match([call("A", "2026-10-12T09:40:13-0700")], [later, near])
        self.assertIs(matched["A"], near)
        self.assertEqual(bad, [])
        matched, bad = recover.match(
            [call("A", "2026-10-12T09:40:13-0700"), call("B", "2026-10-12T09:40:14-0700"),
             call("C", "2026-10-12T08:40:13-0700")], [near])
        self.assertEqual(matched, {})
        self.assertEqual(sorted(bad), ["A", "B", "C"])

    def test_match_window_edges(self):
        s = summ("2026-10-12T16:40:14.000Z")
        matched, _ = recover.match([call("early", "2026-10-12T09:40:15-0700")], [s])
        self.assertIn("early", matched)   # summary 1 s before the call
        matched, bad = recover.match([call("late", "2026-10-12T09:39:58-0700")], [s])
        self.assertEqual((matched, bad), ({}, ["late"]))   # 16 s after

    def seed_and_recover(self):
        log.append(call("A", "2026-10-12T09:40:13-0700"), self.env)
        return recover.recover(self.env, "/tmp/repo", FX)

    def test_recover_rebuilds_state(self):
        res = self.seed_and_recover()
        self.assertEqual(res, {"recovered": 1, "unmatched": [], "ambiguous": []})
        st = log.states_by_call(log.read_entries(self.env))["A"]
        self.assertEqual(st["source"], "recovered")
        self.assertEqual(st["session_id"], "sess-1")
        self.assertEqual(st["transcript_path"], str(S1))
        self.assertEqual(st["state"]["last_message"], "Tests pass.")
        cmds = st["state"]["commands_since_last_edit"]
        self.assertEqual(cmds[0]["command"], "python -m pytest -q")
        self.assertEqual(cmds[0]["output_tail"], "12 passed in 0.4s")
        blob = json.dumps(st["state"])
        self.assertNotIn("Docs updated", blob)
        self.assertNotIn("ls docs", blob)

    def test_recover_skips_errors_states_and_other_points(self):
        for e in (call("E", "2026-10-12T09:40:13-0700", error="boom"),
                  call("T", "2026-10-12T09:40:13-0700", point="tier"),
                  call("S", "2026-10-12T09:40:19-0700"),
                  log.state_entry("S", {"x": 1}, "sess", "/t", "stop")):
            log.append(e, self.env)
        res = recover.recover(self.env, "/tmp/repo", FX)
        self.assertEqual(res["recovered"], 0)
        self.assertEqual(log.states_by_call(log.read_entries(self.env))["S"]["source"], "stop")

    def test_recover_reports_unmatched(self):
        log.append(call("U", "2026-10-12T07:00:00-0700"), self.env)
        res = recover.recover(self.env, "/tmp/repo", FX)
        self.assertEqual(res, {"recovered": 0, "unmatched": ["U"], "ambiguous": []})

    def test_recover_idempotent(self):
        self.seed_and_recover()
        before = log.read_entries(self.env)
        res = recover.recover(self.env, "/tmp/repo", FX)
        self.assertEqual(res["recovered"], 0)
        self.assertEqual(log.read_entries(self.env), before)

    def test_cli_recover_states(self):
        log.append(call("A", "2026-10-12T09:40:13-0700"), self.env)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cli.main(["recover-states", "verify-stop", "--root", "/tmp/repo",
                             "--projects-dir", str(FX)], self.env)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out.getvalue())["recovered"], 1)

    def test_load_whole_file(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        self.addCleanup(os.remove, path)
        with os.fdopen(fd, "w") as fh:
            fh.write(json.dumps({"type": "first"}) + "\n")
            pad = json.dumps({"type": "pad", "x": "y" * 1000}) + "\n"
            for _ in range(transcript.TAIL_BYTES // len(pad) + 10):
                fh.write(pad)
        self.assertGreater(os.path.getsize(path), transcript.TAIL_BYTES)
        self.assertNotEqual(transcript.load(path)[0].get("type"), "first")
        self.assertEqual(transcript.load(path, tail_bytes=None)[0].get("type"), "first")


if __name__ == "__main__":
    unittest.main()
