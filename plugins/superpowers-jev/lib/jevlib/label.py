"""`jev label`: blind batch labeling of unrecorded calls that have state.

Listing prints only {call_id, ts, state} (no Jev verdict) so a labeler is not anchored.
Applying a JSONL file of {"call_id", "verdict"} lines writes ordinary `record` entries.
"""
import json
import sys

from . import log, report

VERDICTS = ("block", "allow")


def unlabeled(entries, point="verify-stop", since=None):
    """([{call_id, ts, state}] unrecorded non-error calls of `point` with state, sorted by ts;
    count of unrecorded calls lacking state)."""
    recorded = {e.get("call_id") for e in entries if e.get("type") == "record"}
    states = log.states_by_call(entries)
    calls = {}
    for e in entries:
        if e.get("type") == "call":
            calls[e.get("call_id")] = e
    rows, missing = [], 0
    for cid, c in calls.items():
        if c.get("point") != point or c.get("error") or cid in recorded:
            continue
        if since and (c.get("ts") or "")[:10] < since:
            continue
        st = states.get(cid)
        if st is None:
            missing += 1
            continue
        rows.append({"call_id": cid, "ts": c.get("ts"), "state": st.get("state")})
    rows.sort(key=lambda r: r["ts"] or "")
    return rows, missing


def apply(lines, entries, env, cwd=None, point="verify-stop"):
    """Record verdicts from JSONL `lines`. Returns (records written, error messages)."""
    calls = {e.get("call_id"): e for e in entries if e.get("type") == "call"}
    recorded = {e.get("call_id") for e in entries if e.get("type") == "record"}
    written, errors = 0, []
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except ValueError as exc:
            errors.append("line %d: invalid JSON: %s" % (n, exc))
            continue
        if not isinstance(obj, dict):
            errors.append("line %d: expected a JSON object" % n)
            continue
        cid, verdict = obj.get("call_id"), obj.get("verdict")
        if not isinstance(cid, str) or cid not in calls:
            errors.append("line %d: unknown call_id %s" % (n, cid))
        elif calls[cid].get("point") != point:
            errors.append("line %d: call_id %s is not a %s call" % (n, cid, point))
        elif verdict not in VERDICTS:
            errors.append("line %d: call_id %s: verdict must be one of %s, got %r"
                          % (n, cid, "|".join(VERDICTS), verdict))
        elif cid in recorded:
            errors.append("line %d: call_id %s is already recorded" % (n, cid))
        else:
            report.record(cid, {"verdict": verdict}, env, cwd)
            recorded.add(cid)
            written += 1
    return written, errors


def cmd_label(args, env):
    entries = log.read_entries(env, args.root)
    if args.apply:
        try:
            with open(args.apply, encoding="utf-8") as f:
                lines = f.read().splitlines()
        except OSError as exc:
            sys.stderr.write("jev label: %s\n" % exc)
            return 2
        written, errors = apply(lines, entries, env, args.root, args.point)
        sys.stderr.write("recorded %d\n" % written)
        for msg in errors:
            sys.stderr.write(msg + "\n")
        return 1 if errors else 0
    rows, missing = unlabeled(entries, args.point, args.since)
    for r in rows:
        sys.stdout.write(json.dumps(r, ensure_ascii=False) + "\n")
    if missing:
        sys.stderr.write("%d unrecorded %s calls have no state\n" % (missing, args.point))
    return 0


def add_parser(sub):
    p = sub.add_parser("label", help="list/apply blind labels for unrecorded calls with state")
    p.add_argument("point", choices=["verify-stop"])
    p.add_argument("--since", help="YYYY-MM-DD")
    p.add_argument("--apply", metavar="FILE", help="JSONL of {call_id, verdict}; records them")
    p.add_argument("--root", help="repo root to resolve the log from")
    p.set_defaults(func=cmd_label)
