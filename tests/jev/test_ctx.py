import tempfile
import unittest
from pathlib import Path
from unittest import mock

import support
from jevlib import ctx
from jevlib.builders import transcript

SHA1, SHA2, SHA3 = "a" * 40, "b" * 40, "c" * 40


class GitInfoTest(unittest.TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.tmp = Path(td.name)
        self.main = self.tmp / "main"
        g = self.main / ".git"
        (g / "refs" / "heads").mkdir(parents=True)
        (g / "HEAD").write_text("ref: refs/heads/main\n")
        (g / "refs" / "heads" / "main").write_text(SHA1 + "\n")
        (self.main / "src" / "deep").mkdir(parents=True)

    def test_git_plain_repo_from_subdir(self):
        self.assertEqual(ctx.git_info(str(self.main / "src" / "deep")), (SHA1, "main"))

    def test_git_worktree_relative_gitdir_packed_ref(self):
        wt = self.tmp / "wt"
        wt.mkdir()
        (wt / ".git").write_text("gitdir: ../main/.git/worktrees/wt\n")
        d = self.main / ".git" / "worktrees" / "wt"
        d.mkdir(parents=True)
        (d / "HEAD").write_text("ref: refs/heads/feat/x\n")
        (d / "commondir").write_text("../..\n")
        (self.main / ".git" / "packed-refs").write_text(
            "# pack-refs\n%s refs/heads/feat/x\n" % SHA2)
        self.assertEqual(ctx.git_info(str(wt)), (SHA2, "feat/x"))

    def test_git_detached_head(self):
        (self.main / ".git" / "HEAD").write_text(SHA3 + "\n")
        self.assertEqual(ctx.git_info(str(self.main)), (SHA3, None))

    def test_git_none_outside_repo_or_garbage(self):
        other = self.tmp / "other"
        other.mkdir()
        self.assertEqual(ctx.git_info(str(other)), (None, None))
        bad = self.tmp / "bad"
        bad.mkdir()
        (bad / ".git").write_text("nonsense")
        self.assertEqual(ctx.git_info(str(bad)), (None, None))

    def test_git_info_never_spawns(self):
        with mock.patch("subprocess.run", side_effect=AssertionError("no subprocess")), \
             mock.patch("subprocess.Popen", side_effect=AssertionError("no subprocess")):
            self.assertEqual(ctx.git_info(str(self.main))[1], "main")


class CollectTest(unittest.TestCase):
    def test_session_id_precedence(self):
        env = support.make_env(CLAUDE_CODE_SESSION_ID="s-env")
        self.assertEqual(ctx.collect(env, {"session_id": "s-hook"})["session_id"], "s-hook")
        self.assertEqual(ctx.collect(env)["session_id"], "s-env")
        self.assertIsNone(ctx.collect(support.make_env())["session_id"])

    def test_transcript_derived_only_when_file_exists(self):
        env = support.make_env(CLAUDE_CODE_SESSION_ID="sid1")
        cwd = "/x/repo"
        self.assertIsNone(ctx.collect(env, cwd=cwd)["transcript_path"])
        p = Path(env["HOME"]) / ".claude" / "projects" / "-x-repo" / "sid1.jsonl"
        p.parent.mkdir(parents=True)
        p.write_text("")
        self.assertEqual(ctx.collect(env, cwd=cwd)["transcript_path"], str(p))
        self.assertEqual(ctx.collect(env, {"transcript_path": "/h.jsonl"})["transcript_path"],
                         "/h.jsonl")

    def test_all_keys_and_plugin_version(self):
        c = ctx.collect(support.make_env(), {"cwd": "/tmp"})
        self.assertEqual(set(c), set(ctx.CTX_KEYS))
        self.assertEqual(c["cwd"], "/tmp")
        self.assertEqual(c["plugin_version"], support.load_json(
            support.PLUGIN / ".claude-plugin" / "plugin.json")["version"])

    def test_plugin_version_is_0_8_0(self):
        self.assertEqual(ctx.plugin_version(), "0.8.0")

    def test_safe_collect_never_raises(self):
        with mock.patch.object(ctx, "git_info", side_effect=RuntimeError("boom")):
            c = ctx.safe_collect(support.make_env())
        self.assertEqual(set(c), set(ctx.CTX_KEYS))

    def test_slug(self):
        self.assertEqual(ctx.project_slug("/a/.b/c"), "-a--b-c")


class LocateTest(unittest.TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.projects = Path(td.name) / "projects"
        (self.projects / "-main").mkdir(parents=True)
        self.real = self.projects / "-main" / "sid1.jsonl"
        self.real.write_text("")

    def test_locate_hint_then_glob(self):
        self.assertEqual(transcript.locate("sid1", "/gone/sid1.jsonl", self.projects),
                         str(self.real))
        self.assertEqual(transcript.locate("sid1", str(self.real), self.projects),
                         str(self.real))
        self.assertIsNone(transcript.locate("nope", None, self.projects))

    def test_locate_rejects_glob_and_path_chars(self):
        for sid in ("*", "sid*", "../sid1", "a/b", "", None):
            self.assertIsNone(transcript.locate(sid, None, self.projects), sid)

    def test_projects_dir(self):
        self.assertEqual(transcript.projects_dir({"HOME": "/h"}), Path("/h/.claude/projects"))


if __name__ == "__main__":
    unittest.main()
