import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import support
from jevlib.builders import diag, generic, review, superpowers, transcript

FX = support.FIXTURES


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo)] + list(args), check=True, capture_output=True)


def make_repo():
    repo = Path(tempfile.mkdtemp(prefix="jevdiff-"))
    git(repo, "init", "-q")
    (repo / "src").mkdir()
    (repo / "src" / "config.py").write_text(
        "import json\n\ndef parse_config(path):\n    try:\n        return json.load(open(path))\n"
        "    except ValueError:\n        return {}\n")
    (repo / "old.txt").write_text("bye\n")
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base")
    (repo / "src" / "config.py").write_text(
        "import json\n\nclass ConfigError(Exception):\n    pass\n\ndef parse_config(path):\n"
        "    try:\n        return json.load(open(path))\n    except ValueError as exc:\n"
        "        raise ConfigError(path) from exc\n")
    (repo / "old.txt").unlink()
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "fix")
    return repo


class GenericStateTest(unittest.TestCase):
    def test_kinds(self):
        f = Path(tempfile.mkdtemp()) / "r.md"
        f.write_text("report body")
        s = generic.build_state(["status=DONE", "report=@%s" % f, "tdd_required:=true", "n:=2"])
        self.assertEqual(s, {"status": "DONE", "report": "report body", "tdd_required": True, "n": 2})

    def test_bad_pair(self):
        with self.assertRaises(ValueError):
            generic.build_state(["novalue"])


class ReviewBuildersTest(unittest.TestCase):
    def test_parse_findings_bullets_and_json(self):
        got = review.parse_findings((FX / "open-items.txt").read_text())
        self.assertEqual(len(got), 2)
        self.assertTrue(got[0].endswith("silently loads as empty."))
        self.assertEqual(review.parse_findings('["a", {"text": "b"}]'), ["a", "b"])

    def test_rereview_state_attaches_hunks_by_mentioned_file(self):
        repo = make_repo()
        s = review.rereview_state((FX / "open-items.txt").read_text(), repo, "HEAD~1", "HEAD")
        self.assertEqual(len(s["findings"]), 2)
        self.assertTrue(s["findings"][0]["hunks"])
        self.assertTrue(s["findings"][0]["hunks"][0].startswith("src/config.py\n@@"))
        self.assertIn("+        raise ConfigError(path) from exc", s["findings"][0]["hunks"][0])
        self.assertEqual(s["findings"][1]["hunks"], [])  # docs/notes.md not in the fix diff

    def test_rereview_no_fix_diff_when_all_matched(self):
        repo = make_repo()
        s = review.rereview_state("- src/config.py:6 swallows the error", repo, "HEAD~1", "HEAD")
        self.assertTrue(s["findings"][0]["hunks"])
        self.assertNotIn("fix_diff", s)

    def test_rereview_fix_diff_when_unmatched(self):
        repo = make_repo()
        s = review.rereview_state("- the error handling is too lenient", repo, "HEAD~1", "HEAD")
        self.assertEqual(s["findings"][0]["hunks"], [])
        self.assertIn("+        raise ConfigError(path) from exc", s["fix_diff"])

    def test_rereview_mixed_findings(self):
        repo = make_repo()
        s = review.rereview_state(
            "- src/config.py:6 swallows the error\n- the error handling is too lenient",
            repo, "HEAD~1", "HEAD")
        self.assertTrue(s["findings"][0]["hunks"])
        self.assertEqual(s["findings"][1]["hunks"], [])
        self.assertIn("raise ConfigError", s["fix_diff"])

    def test_rereview_fix_diff_capped(self):
        repo = make_repo()
        (repo / "big.txt").write_text("".join("line %d\n" % i for i in range(20000)))
        git(repo, "add", "-A")
        git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "big")
        s = review.rereview_state("- nothing named here", repo, "HEAD~1", "HEAD")
        fd = s["fix_diff"]
        self.assertLessEqual(len(fd), review.FIX_DIFF_MAX_CHARS + len(review.FIX_DIFF_TRUNCATED_MARKER))
        self.assertTrue(fd.endswith(review.FIX_DIFF_TRUNCATED_MARKER))

    def test_parse_review_severities(self):
        f = review.parse_review((FX / "review.md").read_text())["findings"]
        self.assertEqual([x["reviewer_severity"] for x in f], ["important", "important", "minor"])
        self.assertIn("returns {}, so a corrupt config", f[0]["text"])
        self.assertTrue(f[2]["text"].startswith("**src/config.py:2**"))

    def test_diff_state(self):
        repo = make_repo()
        s = review.diff_state(repo, "HEAD~1", "HEAD", scoped_rereview=True)
        self.assertEqual((s["role"], s["files_changed"], s["scoped_rereview"]), ("reviewer", 2, True))
        self.assertGreater(s["lines_changed"], 0)
        self.assertIn("deletes_files", s["risk_signals"])
        self.assertIn("config.py", s["diff_stat"])


class DiagStateTest(unittest.TestCase):
    def test_parse_analyst(self):
        f = diag.parse_analyst((FX / "analyst.md").read_text())["findings"]
        self.assertEqual(len(f), 2)  # the evidence-less finding is dropped
        self.assertEqual((f[0]["analyst_confidence"], f[1]["analyst_confidence"]), ("high", "medium"))
        self.assertTrue(f[0]["evidence"].startswith("/tmp/s.jsonl:120"))


def fake_superpowers(version):
    root = Path(tempfile.mkdtemp(prefix="sp-"))
    (root / ".claude-plugin").mkdir()
    (root / ".claude-plugin" / "plugin.json").write_text(json.dumps({"name": "superpowers", "version": version}))
    for name, desc in (("brainstorming", "You MUST use this before any creative work"),
                       ("using-superpowers", "Use when starting any conversation"),
                       ("systematic-debugging", "Use when encountering any bug")):
        d = root / "skills" / name
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text("---\nname: %s\ndescription: %s\n---\n\n# %s\n" % (name, desc, name))
    return root


class SuperpowersTest(unittest.TestCase):
    def test_compat_accepts_verified_6_4_1(self):
        c = superpowers.compat({"SUPERPOWERS_ROOT": str(fake_superpowers("6.4.1"))})
        self.assertEqual((c["superpowers_version"], c["compatible"]), ("6.4.1", True))

    def test_compat_major_7_ok_others_not(self):
        self.assertTrue(superpowers.compat({"SUPERPOWERS_ROOT": str(fake_superpowers("7.2.0"))})["compatible"])
        self.assertFalse(superpowers.compat({"SUPERPOWERS_ROOT": str(fake_superpowers("6.3.0"))})["compatible"])
        self.assertFalse(superpowers.compat({"SUPERPOWERS_ROOT": str(fake_superpowers("8.0.0"))})["compatible"])

    def test_compat_not_installed(self):
        c = superpowers.compat({"HOME": tempfile.mkdtemp()})
        self.assertEqual((c["superpowers_root"], c["compatible"]), (None, False))

    def test_root_prefers_enabled_install(self):
        home = Path(tempfile.mkdtemp())
        a, b = fake_superpowers("5.0.7"), fake_superpowers("6.4.1")
        (home / ".claude" / "plugins").mkdir(parents=True)
        (home / ".claude" / "plugins" / "installed_plugins.json").write_text(json.dumps({"plugins": {
            "superpowers@superpowers-dev": [{"installPath": str(a)}],
            "superpowers@claude-plugins-official": [{"installPath": str(b)}],
            "other@x": [{"installPath": "/nope"}]}}))
        (home / ".claude" / "settings.json").write_text(json.dumps({"enabledPlugins": {
            "superpowers@claude-plugins-official": True, "superpowers@superpowers-dev": False}}))
        self.assertEqual(superpowers.superpowers_root({"HOME": str(home)}), b)

    def test_skills_state_namespaced_and_skips_using_superpowers(self):
        s = superpowers.skills_state("fix the bug", fake_superpowers("7.0.0"))
        self.assertEqual([x["name"] for x in s["skills"]],
                         ["superpowers:brainstorming", "superpowers:systematic-debugging"])


class TranscriptTest(unittest.TestCase):
    def setUp(self):
        self.entries = transcript.load(FX / "transcript.jsonl")

    def test_load_skips_bad_lines_and_missing_file(self):
        self.assertEqual(len(self.entries), 14)
        self.assertEqual(transcript.load("/nonexistent"), [])
        self.assertEqual(transcript.load(None), [])

    def test_load_reads_only_the_tail_of_a_large_transcript(self):
        def line(i):
            return json.dumps({"type": "assistant", "message": {"content": [
                {"type": "text", "text": "entry %d " % i + "x" * 900}]}}) + "\n"
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "big.jsonl"
            path.write_text("".join(line(i) for i in range(1000)), encoding="utf-8")   # ~0.95 MB
            self.assertGreater(path.stat().st_size, 3 * transcript.TAIL_BYTES)
            entries = transcript.load(path)
        self.assertLess(len(entries), 400)
        self.assertGreater(len(entries), 100)
        texts = [e["message"]["content"][0]["text"] for e in entries]
        self.assertTrue(texts[-1].startswith("entry 999 "))
        self.assertTrue(all(t.endswith("x" * 900) for t in texts))   # no partial first line

    def test_skills_used_this_turn(self):
        self.assertEqual(transcript.skills_used_since_last_prompt(self.entries),
                         ["superpowers:systematic-debugging"])

    def test_stop_state_keeps_only_commands_after_last_edit(self):
        s = transcript.stop_state(self.entries, "Fixed. Tests pass.")
        self.assertEqual(s["commands_since_last_edit"],
                         [{"command": "pytest tests/test_config.py", "output_tail": "3 passed in 0.02s"}])
        self.assertEqual(s["last_message"], "Fixed. Tests pass.")

    def test_last_assistant_text(self):
        self.assertTrue(transcript.last_assistant_text(self.entries).startswith("Fixed: corrupt configs"))


class BuilderCliTest(unittest.TestCase):
    def test_state_and_compat_are_registered(self):
        env = {"PATH": os.environ["PATH"], "SUPERPOWERS_ROOT": str(fake_superpowers("6.4.1"))}
        p = subprocess.run([str(support.JEV), "state", "status=DONE", "tdd_required:=false"],
                           env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(json.loads(p.stdout), {"status": "DONE", "tdd_required": False})
        p = subprocess.run([str(support.JEV), "compat"], env=env, capture_output=True, text=True, timeout=20)
        self.assertTrue(json.loads(p.stdout)["compatible"])

    def test_builder_bad_input_exits_one(self):
        p = subprocess.run([str(support.JEV), "findings-state", "/nonexistent.md"],
                           capture_output=True, text=True, timeout=20)
        self.assertEqual(p.returncode, 1)


if __name__ == "__main__":
    unittest.main()
