import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import support
from jevlib import cli, log, registry


class RegistryTest(unittest.TestCase):
    def tmp(self):
        d = Path(tempfile.mkdtemp(prefix="jevreg-"))
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        return d

    def test_no_registration_when_log_dir_set_without_registry(self):
        env = support.make_env()
        self.assertIsNone(registry.registry_path(env))
        log.append({"type": "call", "call_id": "x"}, env)
        self.assertFalse((Path(env["HOME"]) / ".superpowers" / "jev" / "registry.json").exists())

    def test_first_write_registers_once(self):
        tmp = self.tmp()
        env = support.make_env(JEV_REGISTRY=str(tmp / "reg.json"))
        log.append({"type": "call", "call_id": "x"}, env)
        log.append({"type": "call", "call_id": "y"}, env)
        self.assertEqual(registry.load(env), [str(Path(env["JEV_LOG_DIR"]).resolve())])

    def test_default_path_when_no_log_dir_override(self):
        h = str(self.tmp())
        self.assertEqual(registry.registry_path({"HOME": h}),
                         Path(h) / ".superpowers" / "jev" / "registry.json")

    def test_corrupt_registry_is_rewritten(self):
        tmp = self.tmp()
        reg = tmp / "reg.json"
        reg.write_text("not json")
        env = {"JEV_REGISTRY": str(reg), "HOME": str(tmp)}
        d = tmp / "logs"
        d.mkdir()
        self.assertEqual(registry.load(env), [])
        self.assertEqual(registry.register([d], env), 1)
        self.assertEqual(json.loads(reg.read_text())["log_dirs"], [str(d.resolve())])
        self.assertEqual(registry.register([d], env), 0)

    def test_register_failure_never_breaks_append(self):
        tmp = self.tmp()
        blocker = tmp / "file"
        blocker.write_text("x")
        env = support.make_env(JEV_REGISTRY=str(blocker / "sub" / "reg.json"))
        log.append({"type": "call", "call_id": "x"}, env)
        self.assertEqual(len(log.read_entries(env)), 1)

    def test_existing_skips_missing(self):
        tmp = self.tmp()
        env = {"JEV_REGISTRY": str(tmp / "reg.json"), "HOME": str(tmp)}
        a, b = tmp / "a", tmp / "b"
        a.mkdir()
        b.mkdir()
        self.assertEqual(registry.register([a, b], env), 2)
        shutil.rmtree(b)
        self.assertEqual(registry.existing(env), [a.resolve()])

    def test_scan_finds_logs_and_prunes(self):
        root = self.tmp()
        for rel, has_log in (("a", True), ("b/node_modules/x", True), ("c", False),
                             (".hidden/y", True)):
            d = root / rel / ".superpowers" / "jev"
            d.mkdir(parents=True)
            if has_log:
                (d / "log.jsonl").write_text("")
        self.assertEqual(registry.scan([root]), [root / "a" / ".superpowers" / "jev"])

    def _run(self, argv, env):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = cli.main(argv, env)
        return rc, out.getvalue(), err.getvalue()

    def test_cli_register_scan(self):
        root = self.tmp()
        d = root / "p" / ".superpowers" / "jev"
        d.mkdir(parents=True)
        (d / "log.jsonl").write_text("")
        env = {"JEV_REGISTRY": str(root / "reg.json"), "HOME": str(root)}
        rc, out, _ = self._run(["register", "--scan", str(root / "p")], env)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), {"found": 1, "registered": 1})
        self.assertEqual(registry.load(env), [str(d.resolve())])

    def test_cli_register_without_registry_exits_2(self):
        env = support.make_env()
        rc, _, err = self._run(["register", "--scan", str(self.tmp())], env)
        self.assertEqual(rc, 2)
        self.assertIn("no registry", err)


if __name__ == "__main__":
    unittest.main()
