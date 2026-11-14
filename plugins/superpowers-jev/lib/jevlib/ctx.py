"""Call context: where and when a Jev call happened.

Reads files only (no subprocess). Imports only `key` and the stdlib; it must not import
`builders/*` (builders/__init__ imports cli, which imports ask).
"""
import json
import os
import re
from pathlib import Path

from . import key

CTX_KEYS = ("session_id", "transcript_path", "cwd", "git_head", "git_branch", "plugin_version")

_HEX = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
_VERSION = []


def project_slug(path):
    """Claude Code's project-dir name for a cwd: every non-alphanumeric char becomes `-`."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def _read(path):
    return Path(path).read_text(encoding="utf-8", errors="replace")


def _find_dotgit(cwd):
    d = Path(cwd).resolve()
    for p in (d, *d.parents):
        if (p / ".git").exists():
            return p / ".git"
    return None


def _packed_ref(common, ref):
    for line in _read(Path(common) / "packed-refs").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == ref and _HEX.match(parts[0]):
            return parts[0]
    return None


def git_info(cwd):
    """(head sha, branch) from .git files; never spawns, never raises."""
    try:
        dotgit = _find_dotgit(cwd)
        if dotgit is None:
            return (None, None)
        if dotgit.is_file():
            m = re.match(r"gitdir:\s*(.+)", _read(dotgit).strip())
            if not m:
                return (None, None)
            gitdir = Path(os.path.normpath(dotgit.parent / m.group(1).strip()))
        else:
            gitdir = dotgit
        common = gitdir
        try:
            cd = _read(gitdir / "commondir").strip()
            if cd:
                common = Path(os.path.normpath(gitdir / cd))
        except OSError:
            pass
        head = _read(gitdir / "HEAD").strip()
        if _HEX.match(head):
            return (head, None)
        m = re.match(r"ref:\s*(refs/heads/\S.*)$", head)
        if not m:
            return (None, None)
        ref = m.group(1).strip()
        branch = ref[len("refs/heads/"):]
        for base in (gitdir, common):
            try:
                sha = _read(Path(base) / ref).strip()
            except OSError:
                continue
            if _HEX.match(sha):
                return (sha, branch)
        try:
            return (_packed_ref(common, ref), branch)
        except OSError:
            return (None, branch)
    except Exception:
        return (None, None)


def plugin_version():
    if _VERSION:
        return _VERSION[0]
    try:
        v = json.loads(_read(key.PLUGIN_ROOT / ".claude-plugin" / "plugin.json")).get("version")
        v = v if isinstance(v, str) else None
    except (OSError, ValueError, AttributeError):
        v = None
    _VERSION.append(v)
    return v


def collect(env, hook=None, cwd=None):
    hook = hook if isinstance(hook, dict) else {}
    cwd = hook.get("cwd") or cwd or os.getcwd()
    sid = hook.get("session_id") or env.get("CLAUDE_CODE_SESSION_ID") or None
    tp = hook.get("transcript_path") or None
    if not tp and sid:
        home = env.get("HOME") or os.path.expanduser("~")
        cand = Path(home) / ".claude" / "projects" / project_slug(cwd) / ("%s.jsonl" % sid)
        if cand.is_file():
            tp = str(cand)
    head, branch = git_info(cwd)
    return {"session_id": sid, "transcript_path": tp, "cwd": str(cwd), "git_head": head,
            "git_branch": branch, "plugin_version": plugin_version()}


def safe_collect(env, hook=None, cwd=None):
    try:
        return collect(env, hook, cwd)
    except Exception:
        return {k: None for k in CTX_KEYS}
