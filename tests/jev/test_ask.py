import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

import support
from jevlib import ask, log

STATE = {"text": "The moon is made of cheese.", "items": ["apple"]}

# A template whose option list comes from state rows; a row without `name` makes
# choice_criteria raise KeyError during expansion.
ROWS_TEMPLATE = {
    "point": "rows", "version": 1, "model": "jev-latest",
    "state_schema": {"type": "object", "required": ["rows"],
                     "properties": {"rows": {"type": "array"}}},
    "questions": {"kind": {"type": "choice", "instructions": "Which row is it?",
                           "criteria": {"unclear": "Cannot tell"},
                           "options_from_state": {"path": "rows", "key": "name"}}},
    "combine": {"rule": "pick_if_confident", "threshold": 0.7, "order": ["unclear"]},
}


def toy_env(server=None, **extra):
    return support.make_env(server.url if server else None,
                            JEV_QUESTIONS_DIR=str(support.TOY_TEMPLATES), **extra)


def templates_dir(*templates):
    d = tempfile.mkdtemp(prefix="jevq-")
    for t in templates:
        Path(d, t["point"] + ".json").write_text(json.dumps(t), encoding="utf-8")
    return d


class AskTest(unittest.TestCase):
    def test_happy_path_sends_one_request_and_logs(self):
        with support.StubServer(support.ok(noul=0.9)) as srv:
            env = toy_env(srv)
            out = ask.ask("toy", STATE, env)
        self.assertTrue(out["enabled"])
        self.assertEqual((out["verdict"], out["confident"], out["mode"]), ("flagged", True, "shadow"))
        self.assertEqual(len(srv.requests), 1)
        sent = srv.requests[0]
        self.assertEqual(sent["auth"], "Bearer test-key")
        self.assertEqual(sorted(sent["payload"]["questions"]), ["kind.0", "wrong"])
        self.assertEqual(sent["payload"]["state"], STATE)
        entries = log.read_entries(env)
        self.assertEqual(len(entries), 1)
        e = entries[0]
        for key in ("call_id", "ts", "point", "template_version", "mode", "verdict", "confidence", "raw"):
            self.assertIn(key, e)
        self.assertEqual(e["call_id"], out["call_id"])
        self.assertEqual((Path(env["JEV_LOG_DIR"]) / ".gitignore").read_text(), "*\n")

    def test_mode_off_makes_no_request_and_no_log(self):
        with support.StubServer(support.ok()) as srv:
            env = toy_env(srv, SUPERPOWERS_JEV="off")
            out = ask.ask("toy", STATE, env)
        self.assertEqual(out, {"enabled": False, "reason": "mode off"})
        self.assertEqual(srv.requests, [])
        self.assertEqual(log.read_entries(env), [])

    def test_no_key_is_off(self):
        env = toy_env()
        del env["TYPESAFE_API_KEY"]
        self.assertEqual(ask.ask("toy", STATE, env)["reason"], "mode off")

    def test_http_500_fails_open_and_logs_error(self):
        with support.StubServer(lambda p: (500, {"detail": "boom"}, 0)) as srv:
            env = toy_env(srv)
            out = ask.ask("toy", STATE, env)
        self.assertFalse(out["enabled"])
        self.assertIn("http 500", out["reason"])
        self.assertEqual(log.read_entries(env)[0]["error"], out["reason"])

    def test_malformed_response_fails_open(self):
        with support.StubServer(lambda p: (200, {"nope": 1}, 0)) as srv:
            out = ask.ask("toy", STATE, toy_env(srv))
        self.assertEqual((out["enabled"], out["reason"]), (False, "jev unavailable: malformed response"))

    def test_answer_missing_field_fails_open(self):
        bad = {"answers": {"wrong": {"type": "noul"}, "kind.0": {"type": "choice"}}}
        with support.StubServer(lambda p: (200, bad, 0)) as srv:
            out = ask.ask("toy", STATE, toy_env(srv))
        self.assertFalse(out["enabled"])
        self.assertTrue(out["reason"].startswith("combine failed"))

    def test_timeout_fails_open_within_budget(self):
        with support.StubServer(lambda p: (200, support.answer_all(p), 5)) as srv:
            t0 = time.monotonic()
            out = ask.ask("toy", STATE, toy_env(srv))
            elapsed = time.monotonic() - t0
        self.assertFalse(out["enabled"])
        self.assertIn("unavailable", out["reason"])
        self.assertLess(elapsed, 4.0)

    def test_connection_refused_fails_open(self):
        out = ask.ask("toy", STATE, toy_env(JEV_ENDPOINT="http://127.0.0.1:9/v1/systemone"))
        self.assertFalse(out["enabled"])

    def test_state_over_budget_refused_not_truncated(self):
        big = dict(STATE, text="x" * (28000 * 4 + 8))
        with support.StubServer(support.ok()) as srv:
            out = ask.ask("toy", big, toy_env(srv))
        self.assertFalse(out["enabled"])
        self.assertIn("over budget", out["reason"])
        self.assertEqual(srv.requests, [])

    def test_invalid_state_refused(self):
        with support.StubServer(support.ok()) as srv:
            out = ask.ask("toy", {"text": 3, "items": []}, toy_env(srv))
        self.assertIn("state invalid", out["reason"])
        self.assertEqual(srv.requests, [])

    def test_unknown_point_fails_open(self):
        out = ask.ask("no-such-point", STATE, toy_env())
        self.assertFalse(out["enabled"])

    def test_explicit_call_id_round_trips(self):
        with support.StubServer(support.ok()) as srv:
            out = ask.ask("toy", STATE, toy_env(srv), call_id="fixed-1")
        self.assertEqual(out["call_id"], "fixed-1")

    def test_expansion_exception_fails_open(self):
        # A state row without `name` raises KeyError inside template expansion.
        d = templates_dir(ROWS_TEMPLATE)
        with support.StubServer(support.ok()) as srv:
            env = support.make_env(srv.url, JEV_QUESTIONS_DIR=d)
            out = ask.ask("rows", {"rows": [{"label": "x"}]}, env)
        self.assertFalse(out["enabled"])
        self.assertTrue(out["reason"].startswith("expansion failed"), out["reason"])
        self.assertEqual(srv.requests, [])
        self.assertEqual(log.read_entries(env)[0]["error"], out["reason"])

    def test_combine_exception_fails_open(self):
        # `thresholds` must be a mapping; an int makes any_true_over raise AttributeError.
        toy = support.load_json(support.TOY_TEMPLATES / "toy.json")
        toy["combine"] = dict(toy["combine"], thresholds=5)
        d = templates_dir(toy)
        with support.StubServer(support.ok(noul=0.9)) as srv:
            env = support.make_env(srv.url, JEV_QUESTIONS_DIR=d)
            out = ask.ask("toy", STATE, env)
        self.assertFalse(out["enabled"])
        self.assertTrue(out["reason"].startswith("combine failed"), out["reason"])


class LogDirTest(unittest.TestCase):
    def git(self, *args, cwd):
        subprocess.run(["git"] + list(args), cwd=cwd, check=True, capture_output=True)

    def test_log_dir_from_linked_worktree_is_main_root(self):
        main = Path(tempfile.mkdtemp(prefix="jevrepo-")).resolve()
        self.git("init", "-q", cwd=main)
        self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init", cwd=main)
        wt = main / ".claude" / "worktrees" / "op"
        self.git("worktree", "add", "-q", str(wt), cwd=main)
        env = {"HOME": tempfile.mkdtemp()}
        self.assertEqual(log.log_dir(env, cwd=str(wt)), main / ".superpowers" / "jev")
        self.assertEqual(log.log_dir(env, cwd=str(main)), main / ".superpowers" / "jev")

    def test_outside_git_falls_back_to_home(self):
        home = tempfile.mkdtemp()
        self.assertEqual(log.log_dir({"HOME": home}, cwd=tempfile.mkdtemp()),
                         Path(home) / ".superpowers" / "jev")


class CliTest(unittest.TestCase):
    def run_jev(self, args, env, stdin=None):
        full = dict(os.environ)
        for k in ("SUPERPOWERS_JEV", "SUPERPOWERS_JEV_ON", "TYPESAFE_API_KEY", "JEV_ENDPOINT"):
            full.pop(k, None)
        full.update(env)
        return subprocess.run([str(support.JEV)] + args, input=stdin, env=full,
                              capture_output=True, text=True, timeout=20)

    def test_bin_is_executable_python3(self):
        self.assertTrue(os.access(support.JEV, os.X_OK))
        self.assertEqual(support.JEV.read_text().splitlines()[0], "#!/usr/bin/env python3")

    def test_ask_via_stdin(self):
        with support.StubServer(support.ok()) as srv:
            p = self.run_jev(["ask", "toy", "--state", "-"], toy_env(srv), stdin=json.dumps(STATE))
        self.assertEqual(p.returncode, 0)
        self.assertTrue(json.loads(p.stdout)["enabled"])

    def test_ask_bad_state_file_exits_zero_disabled(self):
        p = self.run_jev(["ask", "toy", "--state", "/nonexistent.json"], toy_env())
        self.assertEqual(p.returncode, 0)
        self.assertFalse(json.loads(p.stdout)["enabled"])

    def test_ask_unavailable_exits_zero(self):
        p = self.run_jev(["ask", "toy", "--state", "-"],
                         toy_env(JEV_ENDPOINT="http://127.0.0.1:9/x"), stdin=json.dumps(STATE))
        self.assertEqual(p.returncode, 0)
        self.assertFalse(json.loads(p.stdout)["enabled"])

    def test_ask_missing_argument_is_usage_disabled_exits_zero(self):
        p = self.run_jev(["ask", "toy"], toy_env())
        self.assertEqual(p.returncode, 0)
        out = json.loads(p.stdout)
        self.assertFalse(out["enabled"])
        self.assertTrue(out["reason"].startswith("usage: "), out["reason"])

    def test_ask_invalid_argument_is_usage_disabled_exits_zero(self):
        p = self.run_jev(["ask", "toy", "--state", "-", "--no-such-flag"], toy_env(), stdin="{}")
        self.assertEqual(p.returncode, 0)
        self.assertFalse(json.loads(p.stdout)["enabled"])

    def test_ask_expansion_failure_exits_zero_disabled(self):
        d = templates_dir(ROWS_TEMPLATE)
        p = self.run_jev(["ask", "rows", "--state", "-"],
                         support.make_env(None, JEV_QUESTIONS_DIR=d),
                         stdin=json.dumps({"rows": [{"label": "x"}]}))
        self.assertEqual(p.returncode, 0)
        out = json.loads(p.stdout)
        self.assertFalse(out["enabled"])
        self.assertTrue(out["reason"].startswith("expansion failed"), out["reason"])

    def test_mode_command(self):
        self.assertEqual(self.run_jev(["mode"], {}).stdout.strip(), "off")
        env = {"TYPESAFE_API_KEY": "k", "SUPERPOWERS_JEV_ON": "tier"}
        self.assertEqual(self.run_jev(["mode", "--point", "tier"], env).stdout.strip(), "on")


if __name__ == "__main__":
    unittest.main()
