"""The installed superpowers plugin: where it is and its version.

superpowers_root and version are a port of jevlib.builders.superpowers in
plugins/superpowers-jev (that module imports jevlib, so it cannot be shared;
plugins ship standalone). tests/html/test_upstream.py compares the two.
"""
import json
import os
from pathlib import Path

WRITTEN_AGAINST = "7.0.2"
COMPATIBLE_MAJOR = "7"


def _load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def superpowers_root(env):
    if env.get("SUPERPOWERS_ROOT"):
        return Path(env["SUPERPOWERS_ROOT"])
    home = Path(env.get("HOME") or os.path.expanduser("~"))
    installed = _load(home / ".claude" / "plugins" / "installed_plugins.json").get("plugins", {})
    enabled = _load(home / ".claude" / "settings.json").get("enabledPlugins", {})
    candidates = []
    for key, records in installed.items():
        if key.split("@")[0] != "superpowers":
            continue
        for rec in records or []:
            if rec.get("installPath"):
                candidates.append((enabled.get(key) is True, Path(rec["installPath"])))
    candidates.sort(key=lambda c: not c[0])   # enabled installs first
    for _, path in candidates:
        if (path / "skills").is_dir():
            return path
    return None


def version(root):
    return _load(Path(root) / ".claude-plugin" / "plugin.json").get("version")


def compat(env):
    root = superpowers_root(env)
    ver = version(root) if root else None
    ok = bool(ver) and ver.split(".")[0] == COMPATIBLE_MAJOR
    return {"superpowers_root": str(root) if root else None, "superpowers_version": ver,
            "compatible": ok, "written_against": WRITTEN_AGAINST}
