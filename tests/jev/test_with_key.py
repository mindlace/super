import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import support
from test_key import write_key

SECRET = "sk-secret-value-456"
CHILD = (
    "import os, sys\n"
    "open(sys.argv[1], 'w').write(os.environ.get('TYPESAFE_API_KEY', ''))\n"
    "sys.exit(int(sys.argv[2]) if len(sys.argv) > 2 else 0)\n"
)


class WithKeyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="jevwk-"))
        self.out = str(self.tmp / "out.txt")
        self.keyfile = write_key(self.tmp / "key", SECRET + "\n")

    def run_jev(self, args, extra=None):
        env = {"PATH": os.environ["PATH"], "HOME": str(self.tmp)}
        env.update(extra or {})
        return subprocess.run([sys.executable, str(support.JEV), "with-key"] + args, env=env,
                              capture_output=True, text=True, timeout=30)

    def test_child_sees_key_from_file_and_jev_never_prints_it(self):
        p = self.run_jev(["--", sys.executable, "-c", CHILD, self.out],
                         {"JEV_KEY_FILE": str(self.keyfile)})
        self.assertEqual(p.returncode, 0)
        self.assertEqual(Path(self.out).read_text(), SECRET)
        self.assertNotIn(SECRET, p.stdout + p.stderr)

    def test_env_key_passes_through(self):
        p = self.run_jev(["--", sys.executable, "-c", CHILD, self.out], {"TYPESAFE_API_KEY": SECRET})
        self.assertEqual(p.returncode, 0)
        self.assertEqual(Path(self.out).read_text(), SECRET)

    def test_child_exit_code_passes_through(self):
        p = self.run_jev(["--", sys.executable, "-c", CHILD, self.out, "3"],
                         {"TYPESAFE_API_KEY": SECRET})
        self.assertEqual(p.returncode, 3)

    def test_no_key_exits_2_without_running(self):
        p = self.run_jev(["--", sys.executable, "-c", CHILD, self.out])
        self.assertEqual(p.returncode, 2)
        self.assertFalse(Path(self.out).exists())
        self.assertIn("no key", p.stderr)

    def test_missing_command_exits_127(self):
        p = self.run_jev(["--", "no-such-cmd-xyz"], {"JEV_KEY_FILE": str(self.keyfile)})
        self.assertEqual(p.returncode, 127)
        self.assertNotIn(SECRET, p.stdout + p.stderr)

    def test_no_command_is_usage_error(self):
        for args in ([], ["--"]):
            p = self.run_jev(args, {"JEV_KEY_FILE": str(self.keyfile)})
            self.assertEqual(p.returncode, 2, args)


if __name__ == "__main__":
    unittest.main()
