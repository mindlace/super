"""Append-only JSONL log at <main checkout root>/.superpowers/jev/log.jsonl.

The main checkout (via --git-common-dir), not the current worktree: operator and
SDD worktrees are deleted after merge, and the shadow data must outlive them.
The directory carries its own `.gitignore` (`*`), so no repo config is touched.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def main_repo_root(cwd=None):
    try:
        out = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                             cwd=cwd, capture_output=True, text=True, timeout=2)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    common = Path(out.stdout.strip())
    return common.parent if common.name == ".git" else None


def log_dir(env, cwd=None):
    if env.get("JEV_LOG_DIR"):
        return Path(env["JEV_LOG_DIR"])
    root = main_repo_root(cwd) or Path(env.get("HOME") or os.path.expanduser("~"))
    return root / ".superpowers" / "jev"


def append(entry, env, cwd=None):
    d = log_dir(env, cwd)
    d.mkdir(parents=True, exist_ok=True)
    ignore = d / ".gitignore"
    if not ignore.exists():
        ignore.write_text("*\n", encoding="utf-8")
    line = json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n"
    with open(d / "log.jsonl", "a", encoding="utf-8") as fh:
        try:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)   # parallel operators append concurrently
        except (ImportError, OSError):
            pass
        fh.write(line)


def safe_append(entry, env, cwd=None):
    try:
        append(entry, env, cwd)
    except Exception as exc:  # logging must never break a caller
        sys.stderr.write("jev: log write failed: %s\n" % exc)


def read_entries(env, cwd=None):
    path = log_dir(env, cwd) / "log.jsonl"
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            out.append(entry)
    return out


def state_entry(call_id, state, session_id, transcript_path, source):
    """The input Jev judged for a call, kept so the call can be labeled later."""
    return {"type": "state", "call_id": call_id, "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "state": state, "session_id": session_id, "transcript_path": transcript_path,
            "source": source}


def states_by_call(entries):
    """Latest `state` entry per call_id."""
    out = {}
    for e in entries:
        if e.get("type") == "state" and e.get("call_id"):
            out[e["call_id"]] = e
    return out
