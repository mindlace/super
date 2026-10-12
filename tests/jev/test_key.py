import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

import support  # noqa: F401  (sets sys.path)
from jevlib.key import resolve_key
from jevlib.mode import resolve_mode

SECRET = "sk-secret-value-123"


def write_key(path, text=SECRET + "\n", mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    os.chmod(path, mode)
    return path


class KeyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="jevkey-"))

    def test_env_wins_over_file(self):
        f = write_key(self.tmp / "k")
        key, src = resolve_key({"TYPESAFE_API_KEY": "from-env", "JEV_KEY_FILE": str(f)})
        self.assertEqual((key, src), ("from-env", "env"))

    def test_file_used_when_env_empty_via_plugin_data(self):
        f = write_key(self.tmp / "data" / "typesafe-api-key")
        key, src = resolve_key({"TYPESAFE_API_KEY": "  ", "CLAUDE_PLUGIN_DATA": str(self.tmp / "data")})
        self.assertEqual(key, SECRET)
        self.assertEqual(src, "file:%s" % f)

    def test_derived_from_cache_layout(self):
        root = self.tmp / "plugins" / "cache" / "super" / "superpowers-jev" / "1.0.0"
        root.mkdir(parents=True)
        f = write_key(self.tmp / "plugins" / "data" / "superpowers-jev-super" / "typesafe-api-key")
        key, src = resolve_key({}, plugin_root=root)
        self.assertEqual(key, SECRET)
        self.assertEqual(src, "file:%s" % f)

    def test_non_cache_layout_has_no_file_source(self):
        root = self.tmp / "checkout" / "plugins" / "superpowers-jev"
        root.mkdir(parents=True)
        self.assertEqual(resolve_key({}, plugin_root=root), (None, None))

    def test_override_beats_plugin_data(self):
        a = write_key(self.tmp / "a", "override-key\n")
        write_key(self.tmp / "data" / "typesafe-api-key")
        key, src = resolve_key({"JEV_KEY_FILE": str(a), "CLAUDE_PLUGIN_DATA": str(self.tmp / "data")})
        self.assertEqual((key, src), ("override-key", "file:%s" % a))

    def test_only_first_line_stripped(self):
        f = write_key(self.tmp / "k", "  abc  \nignored\n")
        self.assertEqual(resolve_key({"JEV_KEY_FILE": str(f)})[0], "abc")

    def test_open_permissions_ignored_with_warning(self):
        f = write_key(self.tmp / "k", mode=0o644)
        err = io.StringIO()
        with redirect_stderr(err):
            result = resolve_key({"JEV_KEY_FILE": str(f)})
        self.assertEqual(result, (None, None))
        self.assertIn("jev: ignoring %s: permissions too open (chmod 600)" % f, err.getvalue())
        self.assertNotIn(SECRET, err.getvalue())

    def test_missing_file_is_none_and_mode_off(self):
        env = {"JEV_KEY_FILE": str(self.tmp / "nope")}
        self.assertEqual(resolve_key(env), (None, None))
        self.assertEqual(resolve_mode(env), "off")

    def test_empty_file_is_none(self):
        f = write_key(self.tmp / "k", "\n")
        self.assertEqual(resolve_key({"JEV_KEY_FILE": str(f)}), (None, None))

    def test_mode_defaults_to_shadow_from_file(self):
        f = write_key(self.tmp / "k")
        self.assertEqual(resolve_mode({"JEV_KEY_FILE": str(f)}), "shadow")


class KeyCommandTest(unittest.TestCase):
    def run_jev(self, env):
        base = {"PATH": os.environ.get("PATH", ""), "HOME": tempfile.mkdtemp(prefix="jevhome-")}
        base.update(env)
        return subprocess.run([sys.executable, str(support.JEV), "key"], env=base,
                              capture_output=True, text=True)

    def test_key_from_env_never_printed(self):
        p = self.run_jev({"TYPESAFE_API_KEY": SECRET})
        self.assertEqual(p.returncode, 0)
        self.assertNotIn(SECRET, p.stdout + p.stderr)
        self.assertEqual(json.loads(p.stdout), {"source": "env", "present": True})

    def test_key_from_file_never_printed(self):
        d = Path(tempfile.mkdtemp(prefix="jevkey-"))
        f = write_key(d / "k")
        p = self.run_jev({"JEV_KEY_FILE": str(f)})
        self.assertEqual(p.returncode, 0)
        self.assertNotIn(SECRET, p.stdout + p.stderr)
        self.assertEqual(json.loads(p.stdout), {"source": "file:%s" % f, "present": True})

    def test_no_key(self):
        p = self.run_jev({})
        self.assertEqual(p.returncode, 0)
        self.assertEqual(json.loads(p.stdout), {"source": None, "present": False})


if __name__ == "__main__":
    unittest.main()
