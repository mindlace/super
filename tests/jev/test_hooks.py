import json
import os
import subprocess
import sys
import time
import unittest

import support
from jevlib import hooks, log
from test_builders_superpowers import fake_superpowers

HOOK = support.PLUGIN / "hooks" / "run-hook.cmd"


def run_hook(name, inp, env):
    """Run the real launcher the way Claude Code does: run-hook.cmd jev-hook <name>."""
    full = {"PATH": os.environ["PATH"], "HOME": env.get("HOME", "/tmp")}
    full.update(env)
    p = subprocess.run(["bash", str(HOOK), "jev-hook", name], input=json.dumps(inp), env=full,
                       capture_output=True, text=True, timeout=30)
    return p.returncode, p.stdout.strip()


class SessionStartTest(unittest.TestCase):
    def test_off_is_silent(self):
        env = support.make_env()
        del env["TYPESAFE_API_KEY"]
        self.assertEqual(run_hook("session-start", {"hook_event_name": "SessionStart"}, env), (0, ""))

    def test_shadow_injects_at_most_three_lines(self):
        code, out = run_hook("session-start", {"hook_event_name": "SessionStart"}, support.make_env())
        self.assertEqual(code, 0)
        ctx = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(ctx["hookEventName"], "SessionStart")
        self.assertLessEqual(len(ctx["additionalContext"].splitlines()), 3)
        self.assertIn("superpowers-jev:jev-gates", ctx["additionalContext"])
        self.assertIn("mode: shadow", ctx["additionalContext"])

    def test_on_mode_note_says_on(self):
        code, out = run_hook("session-start", {"hook_event_name": "SessionStart"},
                             support.make_env(SUPERPOWERS_JEV="on"))
        self.assertEqual(code, 0)
        self.assertIn("mode: on", json.loads(out)["hookSpecificOutput"]["additionalContext"])

    def test_stdin_decode_failure_exits_zero(self):
        full = {"PATH": os.environ["PATH"], "PYTHONIOENCODING": "utf-8"}
        full.update(support.make_env())
        p = subprocess.run([sys.executable, str(support.PLUGIN / "bin" / "jev"), "hook", "session-start"],
                           input=b"\xff\xfe\x80",
                           env=full, capture_output=True, timeout=30)
        self.assertEqual((p.returncode, p.stdout), (0, b""))

    def test_garbage_stdin_exits_zero_silently(self):
        full = {"PATH": os.environ["PATH"]}
        full.update(support.make_env())
        p = subprocess.run(["bash", str(HOOK), "jev-hook", "stop-verify"], input="{not json",
                           env=full, capture_output=True, text=True, timeout=30)
        self.assertEqual((p.returncode, p.stdout), (0, ""))

    def test_unknown_hook_name_exits_zero(self):
        self.assertEqual(run_hook("nope", {}, support.make_env()), (0, ""))


class PromptRouteTest(unittest.TestCase):
    def inp(self, prompt, sid="sess-1"):
        return {"hook_event_name": "UserPromptSubmit", "prompt": prompt, "session_id": sid, "cwd": "/tmp"}

    def env(self, srv, **extra):
        return support.make_env(srv.url, SUPERPOWERS_ROOT=str(fake_superpowers("6.4.1")), **extra)

    def pick_debugging(self):
        noul = lambda qid: 0.1 if qid in ("prose_suffices", "fits.0") else 0.9
        return support.ok(pick="superpowers:systematic-debugging", noul=noul)

    def test_shadow_logs_and_stays_silent(self):
        with support.StubServer(self.pick_debugging()) as srv:
            env = self.env(srv)
            out = hooks.prompt_route(self.inp("the checkout page crashes on an empty cart, fix it"), env)
        self.assertIsNone(out)
        self.assertEqual(len(srv.requests), 1)
        self.assertEqual(log.read_entries(env)[0]["point"], "prompt-route")
        self.assertTrue((log.log_dir(env) / "sessions" / "sess-1.json").exists())

    def test_on_injects_hint(self):
        with support.StubServer(self.pick_debugging()) as srv:
            out = hooks.prompt_route(self.inp("the checkout page crashes on an empty cart, fix it"),
                                     self.env(srv, SUPERPOWERS_JEV_ON="prompt-route"))
        ctx = out["hookSpecificOutput"]
        self.assertEqual(ctx["hookEventName"], "UserPromptSubmit")
        self.assertTrue(ctx["additionalContext"].startswith("Likely applicable skill: superpowers:systematic-debugging"))

    def test_slash_commands_and_short_prompts_skip_jev(self):
        with support.StubServer(self.pick_debugging()) as srv:
            env = self.env(srv)
            for prompt in ("/plugin list", "thanks!", "ok go", ""):
                self.assertIsNone(hooks.prompt_route(self.inp(prompt), env))
        self.assertEqual(srv.requests, [])

    def test_prompt_route_oversize_prompt_is_silent(self):
        with support.StubServer(self.pick_debugging()) as srv:
            env = self.env(srv, SUPERPOWERS_JEV_ON="prompt-route")
            out = hooks.prompt_route(self.inp("please look at this log " + "x" * 200000), env)
        self.assertIsNone(out)
        self.assertEqual(srv.requests, [])

    def test_prompt_route_hanging_endpoint_is_silent(self):
        with support.StubServer(lambda p: (200, support.answer_all(p), 6)) as srv:
            env = self.env(srv, SUPERPOWERS_JEV_ON="prompt-route")
            t0 = time.monotonic()
            code, out = run_hook("prompt-route", self.inp("the checkout page crashes, fix it please"), env)
            elapsed = time.monotonic() - t0
        self.assertEqual((code, out), (0, ""))
        self.assertLess(elapsed, 5.0)

    def test_no_superpowers_installed_is_silent(self):
        with support.StubServer(self.pick_debugging()) as srv:
            env = support.make_env(srv.url)
            self.assertIsNone(hooks.prompt_route(self.inp("fix the crash in checkout please"), env))
        self.assertEqual(srv.requests, [])


if __name__ == "__main__":
    unittest.main()
