import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import support


def run_hook(env_extra=None, stdin='{"hook_event_name": "SessionStart"}', hook=support.HOOK):
    env = {"PATH": os.environ["PATH"], "HOME": tempfile.mkdtemp()}
    env.update(env_extra or {})
    return support.run(["/bin/bash", str(hook), "html-hook", "session-start"], env=env, input=stdin)


class SessionStartTest(unittest.TestCase):
    def test_emits_note(self):
        code, out, _ = run_hook()
        self.assertEqual(code, 0)
        ctx = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(ctx["hookEventName"], "SessionStart")
        for needle in ("superpowers-html is active", "superpowers-html:html-docs", ".html plan"):
            self.assertIn(needle, ctx["additionalContext"])

    def test_garbage_stdin_still_exits_zero(self):
        self.assertEqual(run_hook(stdin="{not json")[0], 0)

    def test_broken_install_exits_zero_silently(self):
        tmp = Path(tempfile.mkdtemp()) / "p"
        shutil.copytree(support.PLUGIN, tmp)
        shutil.rmtree(tmp / "lib")
        self.assertEqual(run_hook(hook=tmp / "hooks" / "run-hook.cmd")[:2], (0, ""))

    def test_no_python_exits_zero_silently(self):
        self.assertEqual(run_hook({"PATH": "/nonexistent"})[:2], (0, ""))

    def test_unknown_hook_name_exits_zero(self):
        code, out, _ = support.run(["/bin/bash", str(support.HOOK), "html-hook", "nope"],
                                   env={"PATH": os.environ["PATH"]})
        self.assertEqual((code, out), (0, ""))


if __name__ == "__main__":
    unittest.main()
