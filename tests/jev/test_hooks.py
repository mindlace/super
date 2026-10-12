import json
import os
import subprocess
import unittest

import support

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

    def test_garbage_stdin_exits_zero_silently(self):
        full = {"PATH": os.environ["PATH"]}
        full.update(support.make_env())
        p = subprocess.run(["bash", str(HOOK), "jev-hook", "stop-verify"], input="{not json",
                           env=full, capture_output=True, text=True, timeout=30)
        self.assertEqual((p.returncode, p.stdout), (0, ""))

    def test_unknown_hook_name_exits_zero(self):
        self.assertEqual(run_hook("nope", {}, support.make_env()), (0, ""))


if __name__ == "__main__":
    unittest.main()
