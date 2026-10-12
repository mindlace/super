"""API key resolution: the one place that knows where TYPESAFE_API_KEY can come from.

Order: (a) env TYPESAFE_API_KEY if non-empty; (b) a key file, first line stripped:
JEV_KEY_FILE, else <data dir>/typesafe-api-key where <data dir> is $CLAUDE_PLUGIN_DATA,
else derived from the install path .../plugins/cache/<marketplace>/<plugin>/<version>
as .../plugins/data/<plugin>-<marketplace>. A key file readable by group or world is
ignored with a stderr warning. The key itself is never printed.
"""
import os
import sys
from pathlib import Path

KEY_FILE_NAME = "typesafe-api-key"
PLUGIN_ROOT = Path(__file__).resolve().parents[2]


def derived_data_dir(plugin_root=PLUGIN_ROOT):
    parts = Path(plugin_root).parts
    # ... / plugins / cache / <marketplace> / <plugin> / <version>
    if len(parts) >= 5 and parts[-4] == "cache" and parts[-5] == "plugins":
        marketplace, plugin = parts[-3], parts[-2]
        return Path(*parts[:-4]) / "data" / ("%s-%s" % (plugin, marketplace))
    return None


def key_file_path(env, plugin_root=PLUGIN_ROOT):
    override = (env.get("JEV_KEY_FILE") or "").strip()
    if override:
        return Path(override)
    data = (env.get("CLAUDE_PLUGIN_DATA") or "").strip()
    if data:
        return Path(data) / KEY_FILE_NAME
    derived = derived_data_dir(plugin_root)
    return derived / KEY_FILE_NAME if derived else None


def resolve_key(env, plugin_root=PLUGIN_ROOT):
    """Return (key or None, source) where source is "env", "file:<path>", or None."""
    key = (env.get("TYPESAFE_API_KEY") or "").strip()
    if key:
        return key, "env"
    path = key_file_path(env, plugin_root)
    if path is None:
        return None, None
    try:
        if path.stat().st_mode & 0o077:
            sys.stderr.write("jev: ignoring %s: permissions too open (chmod 600)\n" % path)
            return None, None
        with open(path, encoding="utf-8") as fh:
            key = fh.readline().strip()
    except (OSError, UnicodeDecodeError):
        return None, None
    return (key, "file:%s" % path) if key else (None, None)
