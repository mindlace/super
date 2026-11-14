import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import support
from test_task_brief import PLAN, PLAN_MD, PLAN_TEXT, section

BIN = support.PLUGIN / "bin" / "task-start"


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", *args],
                          capture_output=True, text=True, check=True).stdout.strip()


class TaskStartTest(unittest.TestCase):
    def make_repo(self, commit=True):
        repo = Path(tempfile.mkdtemp())
        git(repo, "init", "-q")
        if commit:
            git(repo, "commit", "-q", "--allow-empty", "-m", "init")
        (repo / "plan.html").write_text(PLAN.read_text())
        (repo / "plan.md").write_text(PLAN_MD.read_text())
        return repo

    def start(self, repo, *args):
        env = dict(os.environ)
        env["SUPERPOWERS_ROOT"] = str(support.fake_superpowers("7.0.2"))
        return support.run(["bash", BIN, *args], env=env, cwd=repo)

    def test_html_prints_brief_and_base(self):
        repo = self.make_repo()
        code, out, _ = self.start(repo, "plan.html", "6")
        lines = out.splitlines()
        self.assertEqual(code, 0)
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[0].startswith("brief: "))
        self.assertEqual(Path(lines[0][7:]).read_text(), section(PLAN_TEXT, "sec-task-6") + "\n")
        self.assertEqual(lines[1], "base: " + git(repo, "rev-parse", "HEAD"))

    def test_markdown_goes_through_upstream(self):
        repo = self.make_repo()
        code, out, _ = self.start(repo, "plan.md", "1")
        self.assertEqual(code, 0)
        self.assertTrue(Path(out.splitlines()[0][7:]).read_text().startswith("UPSTREAM plan.md 1"))

    def test_usage_exit_2(self):
        code, _, err = self.start(self.make_repo(), "plan.html")
        self.assertEqual(code, 2)
        self.assertIn("usage: task-start PLAN_FILE TASK_NUMBER", err)

    def test_not_found_propagates_3(self):
        code, out, _ = self.start(self.make_repo(), "plan.html", "9")
        self.assertEqual(code, 3)
        self.assertNotIn("base:", out)

    def test_repo_without_commit_fails(self):
        code, out, _ = self.start(self.make_repo(commit=False), "plan.html", "6")
        self.assertNotEqual(code, 0)
        self.assertNotIn("base:", out)


if __name__ == "__main__":
    unittest.main()
