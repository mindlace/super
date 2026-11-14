import gzip
import hashlib
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

import support  # noqa: F401  (puts jevlib on sys.path)
from jevlib import log, state


class StateBlobTest(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())

    def test_roundtrip_and_layout(self):
        d = self.d
        sha = state.write_blob({"a": 1}, d)
        p = d / "states" / sha[:2] / (sha + ".json.gz")
        self.assertTrue(p.is_file())
        self.assertEqual(json.loads(gzip.decompress(p.read_bytes())), {"a": 1})
        self.assertEqual(state.read_blob(sha, d), {"a": 1})
        self.assertEqual(sha, hashlib.sha256(state.canonical({"a": 1})).hexdigest())

    def test_identical_states_dedupe(self):
        d = self.d
        a = state.write_blob({"a": 1, "b": 2}, d)
        b = state.write_blob({"b": 2, "a": 1}, d)
        self.assertEqual(a, b)
        files = [f for f in (d / "states").rglob("*") if f.is_file()]
        self.assertEqual(len(files), 1)

    def test_oversize_state_is_truncated(self):
        sha = state.write_blob({"x": "y" * 300000}, self.d)
        got = state.read_blob(sha, self.d)
        self.assertIs(got["truncated"], True)
        self.assertGreater(got["bytes"], state.MAX_BLOB_BYTES)
        self.assertLessEqual(len(got["head"].encode("utf-8")), state.MAX_BLOB_BYTES)

    def test_read_blob_rejects_bad_sha(self):
        for bad in ("../../etc/passwd", "abc", "", "A" * 64):
            self.assertIsNone(state.read_blob(bad, self.d))

    def test_read_blob_missing_or_corrupt(self):
        sha = "1" * 64
        self.assertIsNone(state.read_blob(sha, self.d))
        p = state.blob_path(self.d, sha)
        p.parent.mkdir(parents=True)
        p.write_bytes(b"not gzip")
        self.assertIsNone(state.read_blob(sha, self.d))

    def test_safe_write_swallows_unserializable(self):
        env = support.make_env()
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertIsNone(state.safe_write({"x": object()}, env))
        self.assertIn("jev: state write failed", err.getvalue())

    def test_safe_write_swallows_unwritable_dir(self):
        if os.geteuid() == 0:
            self.skipTest("root ignores permissions")
        env = support.make_env()
        d = log.log_dir(env)
        d.mkdir(parents=True, exist_ok=True)
        os.chmod(d, 0o500)
        self.addCleanup(os.chmod, d, 0o700)
        with redirect_stderr(io.StringIO()):
            self.assertIsNone(state.safe_write({"a": 1}, env))


class StateLoadTest(unittest.TestCase):
    def test_load_prefers_blob_then_inline(self):
        env = support.make_env()
        d = log.log_dir(env)
        sa = state.write_blob({"v": "blob-A"}, d)
        sc = state.write_blob({"v": "blob-C"}, d)
        entries = [
            {"type": "call", "call_id": "A", "state_sha": sa},
            log.state_entry("A", {"v": "inline-A"}, None, None, "hook"),
            {"type": "call", "call_id": "B"},
            log.state_entry("B", {"v": "inline-B"}, None, None, "hook"),
            {"type": "call", "call_id": "C"},
            log.state_ref_entry("C", sc, None, None, "recovered"),
            {"type": "call", "call_id": "D"},
            {"type": "call", "call_id": "E", "state_sha": "0" * 64},
            log.state_entry("E", {"v": "inline-E"}, None, None, "hook"),
        ]
        for e in entries:
            log.append(e, env)
        self.assertEqual(state.load("A", env)["v"], "blob-A")
        self.assertEqual(state.load("B", env)["v"], "inline-B")
        self.assertEqual(state.load("C", env)["v"], "blob-C")
        self.assertIsNone(state.load("D", env))
        self.assertEqual(state.load("E", env)["v"], "inline-E")
        self.assertEqual(state.load("A", env, entries=entries)["v"], "blob-A")


if __name__ == "__main__":
    unittest.main()
