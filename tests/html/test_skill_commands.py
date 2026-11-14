import json
import os
import re
import shlex
import subprocess
import unittest

import support

SKILL_DIR = support.PLUGIN / "skills" / "html-docs"
BASE = "<absolute path of this skill's base directory>"


def skill_command(name):
    """The command line the html-docs skill names for a helper, with the base dir filled in."""
    text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    cmds = [c for c in re.findall(r"`([^`]*)`", text) if ("/../../bin/%s" % name) in c]
    if not cmds:
        raise AssertionError("html-docs skill names no command for bin/%s" % name)
    return cmds[0].replace(BASE, str(SKILL_DIR))


class SkillCommandsTest(unittest.TestCase):
    def test_compat_runs_exactly_as_the_skill_names_it(self):
        cmd = skill_command("superpowers-html compat")
        env = dict(os.environ, SUPERPOWERS_ROOT=str(support.fake_superpowers("7.0.2")))
        proc = subprocess.run(shlex.split(cmd), env=env, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, "%s\n%s" % (cmd, proc.stderr))
        out = json.loads(proc.stdout)
        self.assertIs(out["compatible"], True)
        self.assertEqual(out["superpowers_version"], "7.0.2")

    def test_each_helper_runs_with_its_own_interpreter(self):
        for name in ("task-brief", "task-start", "superpowers-html"):
            first = (support.PLUGIN / "bin" / name).read_text(encoding="utf-8").splitlines()[0]
            interp = "python3" if "python" in first else "bash"
            self.assertTrue(skill_command(name).startswith(interp + " "), name)
