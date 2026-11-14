import os
import tempfile
import unittest
from pathlib import Path

import support
from sphtml import brief, upstream

BIN = support.PLUGIN / "bin" / "task-brief"
PLAN = support.FIXTURES / "plan.html"
PLAN_UNCLOSED = support.FIXTURES / "plan-unclosed.html"
PLAN_MD = support.FIXTURES / "plan.md"
PLAN_TEXT = PLAN.read_text()


def _real_sp():
    root = upstream.superpowers_root(os.environ)
    if root and (upstream.version(root) or "").split(".")[0] == "7":
        return root
    return None


REAL_SP = _real_sp()


def section(text, sid):
    start = text.index('<section id="%s"' % sid)
    depth, pos = 0, start
    while True:
        o = text.find("<section", pos)
        c = text.find("</section>", pos)
        if o != -1 and o < c:
            depth += 1
            pos = o + 1
        else:
            depth -= 1
            pos = c + 1
            if depth == 0:
                return text[start:c + len("</section>")]


def brief_cmd(*args, cwd=None, root="default", extra_env=None):
    env = dict(os.environ)
    env.pop("SUPERPOWERS_ROOT", None)
    if root == "default":
        root = support.fake_superpowers("7.0.2")
    if root is None:
        env["HOME"] = tempfile.mkdtemp()
    else:
        env["SUPERPOWERS_ROOT"] = str(root)
    env.update(extra_env or {})
    return support.run(["bash", BIN, *args], env=env, cwd=cwd)


class TaskBriefTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_found_writes_section_verbatim(self):
        out = self.tmp / "b.md"
        code, stdout, _ = brief_cmd(str(PLAN), "1", str(out))
        self.assertEqual(code, 0)
        self.assertEqual(out.read_text(), section(PLAN_TEXT, "sec-task-1") + "\n")
        self.assertEqual(stdout, "wrote %s: %d lines\n" % (out, out.read_text().count("\n")))

    def test_task_6_excludes_6b(self):
        for n, sid in (("6", "sec-task-6"), ("6b", "sec-task-6b")):
            out = self.tmp / ("b%s.md" % n)
            self.assertEqual(brief_cmd(str(PLAN), n, str(out))[0], 0)
            self.assertEqual(out.read_text(), section(PLAN_TEXT, sid) + "\n")

    def test_subtask_7a_stays_in_7(self):
        out = self.tmp / "b.md"
        self.assertEqual(brief_cmd(str(PLAN), "7", str(out))[0], 0)
        text = out.read_text()
        self.assertIn("Task 7a: Seven a", text)
        self.assertIn("After 7a.", text)
        self.assertEqual(text, section(PLAN_TEXT, "sec-task-7") + "\n")

    def test_requesting_7a_alone(self):
        out = self.tmp / "b.md"
        self.assertEqual(brief_cmd(str(PLAN), "7a", str(out))[0], 0)
        self.assertEqual(out.read_text(), section(PLAN_TEXT, "sec-task-7a") + "\n")

    def test_heading_with_inline_markup(self):
        out = self.tmp / "b.md"
        self.assertEqual(brief_cmd(str(PLAN), "3", str(out))[0], 0)
        self.assertEqual(out.read_text(), section(PLAN_TEXT, "sec-task-3") + "\n")

    def test_escaped_task_in_pre_is_not_a_task(self):
        self.assertEqual(brief_cmd(str(PLAN), "9", str(self.tmp / "b.md"))[0], 3)

    def test_heading_without_digit_is_not_a_task(self):
        self.assertEqual(brief_cmd(str(PLAN), "notes", str(self.tmp / "b.md"))[0], 3)

    def test_not_found_exit_3(self):
        code, _, err = brief_cmd(str(PLAN), "2", str(self.tmp / "x.md"))
        self.assertEqual(code, 3)
        self.assertIn("task 2 not found in %s" % PLAN, err)
        self.assertNotIn("no task sections found", err)
        self.assertFalse((self.tmp / "x.md").exists())

    def test_no_task_sections_hint(self):
        plan = self.tmp / "p.html"
        plan.write_text("<article><section><h2>Overview</h2></section></article>\n")
        code, _, err = brief_cmd(str(plan), "1", str(self.tmp / "x.md"))
        self.assertEqual(code, 3)
        self.assertIn("no task sections found", err)

    def test_unclosed_section_exits_4(self):
        out = self.tmp / "x.md"
        code, _, err = brief_cmd(str(PLAN_UNCLOSED), "2", str(out))
        self.assertEqual(code, 4)
        self.assertIn("opened at line 5 of %s never closes" % PLAN_UNCLOSED, err)
        self.assertFalse(out.exists())

    def test_closed_task_before_unclosed_one_still_briefs(self):
        self.assertEqual(brief_cmd(str(PLAN_UNCLOSED), "1", str(self.tmp / "x.md"))[0], 0)

    def test_nested_section_not_extending_id_stays_in_brief(self):
        plan = self.tmp / "p.html"
        plan.write_text("<article><section><h2>Task 7: Seven</h2>"
                        "<section><h3>Task 8: Misnested</h3><p>inner</p></section>"
                        "</section></article>\n")
        out = self.tmp / "x.md"
        self.assertEqual(brief_cmd(str(plan), "7", str(out))[0], 0)
        self.assertIn("Task 8: Misnested", out.read_text())

    def test_usage_exit_2(self):
        self.assertEqual(brief_cmd()[0], 2)
        code, _, err = brief_cmd(str(PLAN), "1", str(self.tmp / "o"), "extra")
        self.assertEqual(code, 2)
        self.assertIn("usage: task-brief [-C DIR] PLAN_FILE TASK_NUMBER [OUTFILE]", err)
        code, _, err = brief_cmd(str(self.tmp / "missing.html"), "1")
        self.assertEqual(code, 2)
        self.assertIn("no such plan file: %s" % (self.tmp / "missing.html"), err)
        code, _, err = brief_cmd("-C", str(self.tmp / "nodir"), str(PLAN), "1")
        self.assertEqual(code, 2)
        self.assertIn("bad -C directory: %s" % (self.tmp / "nodir"), err)

    def test_default_out_uses_upstream_workspace(self):
        plan = self.tmp / "plan.html"
        plan.write_text(PLAN_TEXT)
        code, stdout, _ = brief_cmd("plan.html", "1", cwd=self.tmp)
        expected = self.tmp.resolve() / ".superpowers" / "sdd" / "plan.html" / "task-1-brief.md"
        self.assertEqual(code, 0)
        self.assertTrue(expected.is_file())
        self.assertTrue(stdout.startswith("wrote %s: " % expected), stdout)

    def test_C_runs_in_dir(self):
        (self.tmp / "plan.html").write_text(PLAN_TEXT)
        code, stdout, _ = brief_cmd("-C", str(self.tmp), "plan.html", "1")
        self.assertEqual(code, 0)
        self.assertTrue((self.tmp / ".superpowers" / "sdd" / "plan.html" / "task-1-brief.md").is_file())
        self.assertIn(".superpowers/sdd/plan.html/task-1-brief.md", stdout)

    def test_markdown_hands_off_unchanged(self):
        code, _, _ = brief_cmd(str(PLAN_MD), "2", str(self.tmp / "m.md"))
        self.assertEqual(code, 0)
        self.assertEqual((self.tmp / "m.md").read_text(),
                         "UPSTREAM %s 2 %s\n" % (PLAN_MD, self.tmp / "m.md"))

    def test_markdown_hand_off_keeps_C_and_exit_code(self):
        code, _, _ = brief_cmd("-C", str(self.tmp), str(PLAN_MD), "2", "m.md",
                               extra_env={"UPSTREAM_RC": "3"})
        self.assertEqual(code, 3)
        # upstream (the stub) applied -C itself, exactly once
        self.assertEqual((self.tmp / "m.md").read_text(), "UPSTREAM %s 2 m.md\n" % PLAN_MD)

    def test_html_with_outfile_needs_no_upstream(self):
        out = self.tmp / "b.md"
        self.assertEqual(brief_cmd(str(PLAN), "1", str(out), root=None)[0], 0)
        self.assertTrue(out.is_file())

    def test_markdown_without_upstream_exit_2(self):
        code, _, err = brief_cmd(str(PLAN_MD), "1", str(self.tmp / "m.md"), root=None)
        self.assertEqual(code, 2)
        self.assertIn("no installed superpowers found", err)

    @unittest.skipUnless(REAL_SP, "superpowers not installed")
    def test_markdown_matches_real_upstream(self):
        env = dict(os.environ, SUPERPOWERS_ROOT=str(REAL_SP))
        ours, theirs = self.tmp / "ours.md", self.tmp / "theirs.md"
        real = REAL_SP / "skills" / "subagent-driven-development" / "scripts" / "task-brief"
        c1, o1, _ = support.run(["bash", BIN, PLAN_MD, "1", ours], env=env)
        c2, o2, _ = support.run(["bash", real, PLAN_MD, "1", theirs], env=env)
        self.assertEqual((c1, c2), (0, 0))
        self.assertEqual(ours.read_text(), theirs.read_text())
        self.assertEqual(o1.replace(str(ours), "X"), o2.replace(str(theirs), "X"))


class TaskSectionsTest(unittest.TestCase):
    def test_ids_and_line(self):
        found = brief.task_sections(PLAN_TEXT)
        self.assertEqual([s.id for s in found], ["1", "3", "6", "6b", "7", "7a"])
        self.assertEqual(found[0].line, 12)

    def test_offsets_slice_the_section(self):
        s = brief.task_sections(PLAN_TEXT)[0]
        self.assertEqual(PLAN_TEXT[s.start:s.end], section(PLAN_TEXT, "sec-task-1"))

    def test_extract_unknown_raises(self):
        with self.assertRaises(brief.TaskNotFound):
            brief.extract(PLAN_TEXT, "2")

    def test_extract_unclosed_raises_with_line(self):
        with self.assertRaises(brief.SectionUnclosed) as cm:
            brief.extract(PLAN_UNCLOSED.read_text(), "2")
        self.assertEqual(cm.exception.line, 5)


if __name__ == "__main__":
    unittest.main()
