"""`jev recover-states`: rebuild the judged state of historical calls from transcripts.

Calls logged before the Stop hook wrote `state` entries cannot be labeled. Each Stop
hook run leaves a `stop_hook_summary` entry in the Claude Code session transcript;
a call is matched to the nearest such summary just after its `ts`, and its state is
rebuilt with the same transcript code the hook uses, over the entries before it.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

from . import log
from .builders import transcript

HOOK_MARK = "stop-verify"


def parse_ts(s):
    """Aware datetime from `2026-10-12T09:40:13-0700` or `2026-10-12T16:40:13.415Z`.
    A naive timestamp is taken as local time. Raises ValueError on garbage."""
    s = str(s).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    s = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", s)
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.astimezone()


def slug(path):
    """Claude Code's project-dir name for a cwd: every non-alphanumeric char becomes `-`."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def _project_dirs(projects_dir, root):
    base = slug(root)
    try:
        dirs = sorted(Path(projects_dir).iterdir())
    except OSError:
        return []
    return [d for d in dirs if d.is_dir() and (d.name == base or d.name.startswith(base + "-"))]


def _is_stop_verify(entry):
    if entry.get("type") != "system" or entry.get("subtype") != "stop_hook_summary":
        return False
    infos = entry.get("hookInfos")
    return isinstance(infos, list) and any(
        isinstance(h, dict) and HOOK_MARK in str(h.get("command", "")) for h in infos)


def _in_root(cwd, root):
    return isinstance(cwd, str) and (cwd == root or cwd.startswith(root + "/"))


def stop_summaries(projects_dir, root):
    """[{at, session_id, transcript_path, index}] for every verify-stop Stop hook run
    under `root` (worktrees included), from top-level session transcripts only."""
    root = str(root).rstrip("/") or "/"
    out = []
    for d in _project_dirs(projects_dir, root):
        for path in sorted(d.glob("*.jsonl")):
            for i, entry in enumerate(transcript.load(str(path), tail_bytes=None)):
                if not _is_stop_verify(entry) or not _in_root(entry.get("cwd"), root):
                    continue
                try:
                    at = parse_ts(entry.get("timestamp"))
                except (TypeError, ValueError):
                    continue
                out.append({"at": at, "session_id": entry.get("sessionId") or path.stem,
                            "transcript_path": str(path), "index": i})
    out.sort(key=lambda s: s["at"])
    return out


def _match(calls, summaries, window):
    lo, hi = timedelta(seconds=window[0]), timedelta(seconds=window[1])
    nearest, unmatched = {}, []
    for c in calls:
        cid = c.get("call_id")
        try:
            t = parse_ts(c.get("ts"))
        except (TypeError, ValueError):
            unmatched.append(cid)
            continue
        cands = [(abs(s["at"] - t), n) for n, s in enumerate(summaries) if lo <= s["at"] - t <= hi]
        if not cands:
            unmatched.append(cid)
            continue
        nearest[cid] = min(cands)[1]
    claims = {}
    for cid, n in nearest.items():
        claims.setdefault(n, []).append(cid)
    matched, ambiguous = {}, []
    for cid, n in nearest.items():
        if len(claims[n]) > 1:
            ambiguous.append(cid)
        else:
            matched[cid] = summaries[n]
    return matched, unmatched, ambiguous


def match(calls, summaries, window=(-1, 15)):
    """(call_id -> summary, ambiguous or unmatched call_ids). A call's candidates are the
    summaries `window` seconds around its ts; it takes the nearest. Matching is one-to-one:
    a summary nearest to two calls leaves both ambiguous."""
    matched, unmatched, ambiguous = _match(calls, summaries, window)
    return matched, unmatched + ambiguous


def recover(env, root, projects_dir, point="verify-stop"):
    """Append a `source: recovered` state entry for each non-error `point` call lacking one.
    Calls that already have state still take part in matching, so a summary they claim is
    never handed to another call."""
    entries = log.read_entries(env, root)
    states = log.states_by_call(entries)
    calls = {}
    for e in entries:
        if e.get("type") == "call" and e.get("point") == point and not e.get("error"):
            calls[e.get("call_id")] = e
    pending = [cid for cid in calls if cid not in states]
    if not pending:
        return {"recovered": 0, "unmatched": [], "ambiguous": []}
    summaries = stop_summaries(Path(projects_dir), root)
    matched, unmatched, ambiguous = _match(list(calls.values()), summaries, (-1, 15))
    cache, recovered = {}, 0
    for cid in pending:
        s = matched.get(cid)
        if s is None:
            continue
        path = s["transcript_path"]
        if path not in cache:
            cache[path] = transcript.load(path, tail_bytes=None)
        before = cache[path][:s["index"]]
        state = transcript.stop_state(before, transcript.last_assistant_text(before))
        log.append(log.state_entry(cid, state, s["session_id"], path, "recovered"), env, root)
        recovered += 1
    keep = set(pending)
    return {"recovered": recovered,
            "unmatched": [c for c in unmatched if c in keep],
            "ambiguous": [c for c in ambiguous if c in keep]}


def cmd_recover_states(args, env):
    root = args.root or log.main_repo_root()
    if not root:
        sys.stderr.write("jev recover-states: not in a git repo; pass --root\n")
        return 2
    projects = args.projects_dir or (
        Path(env.get("HOME") or os.path.expanduser("~")) / ".claude" / "projects")
    res = recover(env, str(root), Path(projects), args.point)
    sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("recover-states",
                       help="rebuild missing call state from Claude Code transcripts")
    p.add_argument("point", choices=["verify-stop"])
    p.add_argument("--root", help="main repo root (default: this checkout's)")
    p.add_argument("--projects-dir", help="Claude Code projects dir (default: ~/.claude/projects)")
    p.set_defaults(func=cmd_recover_states)
