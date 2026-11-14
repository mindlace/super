"""Shared helpers for the superpowers-html tests."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "superpowers-html"
BIN = PLUGIN / "bin" / "superpowers-html"
HOOK = PLUGIN / "hooks" / "run-hook.cmd"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
FAKE_SP = FIXTURES / "fake-superpowers"

sys.path.insert(0, str(PLUGIN / "lib"))


def fake_superpowers(version):
    dest = Path(tempfile.mkdtemp()) / "superpowers"
    shutil.copytree(FAKE_SP, dest)
    manifest = dest / ".claude-plugin" / "plugin.json"
    data = json.loads(manifest.read_text())
    data["version"] = version
    manifest.write_text(json.dumps(data))
    return dest


def run(cmd, env=None, cwd=None, input=""):
    proc = subprocess.run([str(c) for c in cmd], env=env, cwd=cwd, input=input,
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr
