import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import support
from sphtml import upstream

JEV_LIB = support.REPO / "plugins" / "superpowers-jev" / "lib"


def install(home, installs, enabled):
    (home / ".claude" / "plugins").mkdir(parents=True)
    (home / ".claude" / "plugins" / "installed_plugins.json").write_text(
        json.dumps({"plugins": installs}))
    (home / ".claude" / "settings.json").write_text(json.dumps({"enabledPlugins": enabled}))


class UpstreamTest(unittest.TestCase):
    def test_compat_7x_ok_others_not(self):
        for ver, ok in (("7.0.2", True), ("7.3.0", True), ("6.4.1", False), ("8.0.0", False)):
            c = upstream.compat({"SUPERPOWERS_ROOT": str(support.fake_superpowers(ver))})
            self.assertEqual((c["superpowers_version"], c["compatible"]), (ver, ok))
            self.assertEqual(c["written_against"], "7.0.2")

    def test_compat_not_installed(self):
        c = upstream.compat({"HOME": tempfile.mkdtemp()})
        self.assertEqual((c["superpowers_root"], c["compatible"]), (None, False))

    def test_root_prefers_enabled_install(self):
        home = Path(tempfile.mkdtemp())
        a, b = support.fake_superpowers("5.0.7"), support.fake_superpowers("7.0.2")
        install(home, {
            "superpowers@superpowers-dev": [{"installPath": str(a)}],
            "superpowers@claude-plugins-official": [{"installPath": str(b)}],
            "other@x": [{"installPath": "/nope"}]},
            {"superpowers@claude-plugins-official": True, "superpowers@superpowers-dev": False})
        self.assertEqual(upstream.superpowers_root({"HOME": str(home)}), b)

    def test_parity_with_jev_resolver(self):
        # upstream.py is a port of jevlib.builders.superpowers.superpowers_root.
        sys.path.insert(0, str(JEV_LIB))
        try:
            from jevlib.builders import superpowers as jev_sp
        finally:
            sys.path.remove(str(JEV_LIB))
        home = Path(tempfile.mkdtemp())
        a, b = support.fake_superpowers("5.0.7"), support.fake_superpowers("7.0.2")
        install(home, {
            "superpowers@dev": [{"installPath": str(a)}],
            "superpowers@official": [{"installPath": str(b)}],
            "superpowers@gone": [{"installPath": "/nope"}]},
            {"superpowers@official": True})
        for env in ({"HOME": str(home)}, {"HOME": tempfile.mkdtemp()},
                    {"SUPERPOWERS_ROOT": str(a), "HOME": str(home)}):
            self.assertEqual(upstream.superpowers_root(env), jev_sp.superpowers_root(env))
        self.assertEqual(upstream.version(b), jev_sp.version(b))

    def test_cli_compat_prints_json_exit_0(self):
        env = {"PATH": os.environ["PATH"], "SUPERPOWERS_ROOT": str(support.fake_superpowers("6.0.0"))}
        code, out, _ = support.run([support.BIN, "compat"], env=env)
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(out)["compatible"])

    def test_cli_upstream_root(self):
        sp = support.fake_superpowers("7.0.2")
        env = {"PATH": os.environ["PATH"], "HOME": tempfile.mkdtemp(), "SUPERPOWERS_ROOT": str(sp)}
        code, out, _ = support.run([support.BIN, "upstream-root"], env=env)
        self.assertEqual((code, out.strip()), (0, str(sp)))
        env = {"PATH": os.environ["PATH"], "HOME": tempfile.mkdtemp()}
        code, out, err = support.run([support.BIN, "upstream-root"], env=env)
        self.assertEqual(code, 1)
        self.assertIn("superpowers-html: no installed superpowers found (set SUPERPOWERS_ROOT)", err)


if __name__ == "__main__":
    unittest.main()
