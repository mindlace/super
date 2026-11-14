"""html-docs names each upstream step it overrides by section heading; the headings exist."""
import os
import unittest

import support
from sphtml import upstream

SKILL = support.PLUGIN / "skills" / "html-docs" / "SKILL.md"

# Upstream file (under skills/) -> the section headings html-docs overrides there.
ANCHORS = {
    "brainstorming/SKILL.md": ["## The Written Design"],
    "writing-plans/SKILL.md": ["## Overview", "## Plan Document Header", "## Task Structure",
                               "## Execution Handoff"],
    "subagent-driven-development/SKILL.md": ["### 1. Dispatch the implementer"],
    "executing-plans/SKILL.md": ["### 1. Take the task"],
}


def installed_7x():
    root = upstream.superpowers_root(dict(os.environ))
    ver = upstream.version(root) if root else None
    return root if ver and ver.split(".")[0] == "7" else None


class AnchorsTest(unittest.TestCase):
    def test_skill_names_every_anchor(self):
        text = SKILL.read_text(encoding="utf-8")
        for rel, headings in ANCHORS.items():
            for h in headings:
                self.assertIn(h, text, "%s heading %r" % (rel, h))

    def test_anchors_exist_in_installed_superpowers(self):
        root = installed_7x()
        if root is None:
            self.skipTest("no superpowers 7.x install found")
        for rel, headings in ANCHORS.items():
            lines = (root / "skills" / rel).read_text(encoding="utf-8").splitlines()
            for h in headings:
                self.assertIn(h, lines, "%s has no line %r" % (rel, h))


if __name__ == "__main__":
    unittest.main()
