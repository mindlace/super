"""`jev record` and `jev report`: per-point agreement between Jev and Claude.

A call entry carries its template's `compare` kind and `on_skips` at call time, so
reports stay correct across template versions. A record entry attaches Claude's
verdict to a call_id; the latest record for a call wins.

Units of agreement by compare kind:
  verdict  - one unit: Jev `verdict` vs Claude {"verdict": ...}
  picks    - one unit per key in Claude {"picks": {...}}: Jev's raw choice for that key
  items    - one unit per index in Claude {"items": [...]}: Jev's item pick
  coverage - one unit per requirement: ok | uncovered | multi, from {"uncovered", "multiply_covered"}

Two agreement columns: `acted-agreement` scores the combined verdict an `on` run would act on
(floors, gates, and overrides applied); `raw-agreement` (JSON key `agreement`) scores Jev's own
answer (for picks, detail.choices). A None acted verdict is Jev abstaining: it scores as
agreement when Claude's value is "none", and otherwise counts under `abstain` and is not scored.
`conf-wrong` is the share of confident, non-abstaining units whose acted verdict differs from Claude.
"""
import json
import sys

from . import ask, log


def record(call_id, claude_verdict, env, cwd=None):
    if not isinstance(claude_verdict, dict):
        raise ValueError("claude verdict must be a JSON object")
    log.append({"type": "record", "call_id": call_id, "ts": ask.now(),
                "claude_verdict": claude_verdict}, env, cwd)


def _coverage_classes(v, n):
    unc, multi = set(v.get("uncovered", [])), set(v.get("multiply_covered", []))
    return ["uncovered" if i in unc else "multi" if i in multi else "ok" for i in range(n)]


def units(call, claude):
    """[(jev_raw, jev_acted, claude_value, jev_confident)] for one recorded call.

    jev_raw is Jev's own answer; jev_acted is the combined verdict an `on` run would act
    on (floors, gates, and overrides applied; None = Jev abstained). They differ only
    for `picks`."""
    kind = call.get("compare")
    detail = call.get("detail") or {}
    if kind == "verdict":
        jev = call.get("verdict")
        return [(jev, jev, claude.get("verdict"), bool(call.get("confident")))]
    if kind == "picks":
        choices = detail.get("choices") or {}
        confident = detail.get("confident_keys") or {}
        verdict = call.get("verdict") if isinstance(call.get("verdict"), dict) else {}
        return [(choices.get(k), verdict.get(k), v, bool(confident.get(k)))
                for k, v in (claude.get("picks") or {}).items()]
    if kind == "items":
        by_index = {it.get("index"): it for it in call.get("items") or []}
        out = []
        for i, v in enumerate(claude.get("items") or []):
            it = by_index.get(i) or {}
            out.append((it.get("pick"), it.get("pick"), v, bool(it.get("confident"))))
        return out
    if kind == "coverage":
        n = detail.get("n_requirements", 0)
        jev = _coverage_classes(call.get("verdict") or {}, n)
        cla = _coverage_classes(claude, n)
        return [(a, a, b, bool(call.get("confident"))) for a, b in zip(jev, cla)]
    return []


def build_report(entries, since=None, point=None):
    calls, records = {}, {}
    for e in entries:
        if e.get("type") == "record":
            records[e.get("call_id")] = e.get("claude_verdict") or {}
        elif e.get("type") == "call":
            calls[e.get("call_id")] = e
    rows = {}
    for cid, c in calls.items():
        if point and c.get("point") != point:
            continue
        if since and (c.get("ts") or "")[:10] < since:
            continue
        r = rows.setdefault(c.get("point"), {
            "calls": 0, "errors": 0, "recorded": 0, "units": 0, "agree": 0,
            "confident_units": 0, "confident_wrong": 0, "would_skip": 0, "unrecorded": [],
            "acted_units": 0, "acted_agree": 0, "abstained": 0})
        r["calls"] += 1
        if c.get("error"):
            r["errors"] += 1
            continue
        skip = c.get("on_skips")
        if skip and c.get("confident") and c.get("verdict") == skip.get("verdict"):
            r["would_skip"] += 1
        claude = records.get(cid)
        if claude is None:
            r["unrecorded"].append(cid)
            continue
        r["recorded"] += 1
        for jev_v, acted_v, claude_v, confident in units(c, claude):
            agree = jev_v == claude_v
            r["units"] += 1
            r["agree"] += int(agree)
            # Acted-on verdict: None means Jev took no action. That matches Claude's explicit
            # "none" (the gate was right); otherwise it is an abstention, not scored.
            if acted_v is None and claude_v != "none":
                r["abstained"] += 1
                continue
            acted_agree = acted_v == claude_v or (acted_v is None and claude_v == "none")
            r["acted_units"] += 1
            r["acted_agree"] += int(acted_agree)
            # Confident-and-wrong is judged on what an `on` run would act on, not the raw choice.
            if confident:
                r["confident_units"] += 1
                r["confident_wrong"] += int(not acted_agree)
    for r in rows.values():
        r["agreement"] = r["agree"] / r["units"] if r["units"] else None
        r["acted_agreement"] = r["acted_agree"] / r["acted_units"] if r["acted_units"] else None
        r["confident_wrong_rate"] = (r["confident_wrong"] / r["confident_units"]
                                     if r["confident_units"] else None)
    return rows


def _frac(rate, num, den):
    return "-" if rate is None else "%.2f (%d/%d)" % (rate, num, den)


def format_report(rows):
    lines = ["%-18s %5s %4s %4s %-15s %-15s %-7s %-15s %s" % (
        "point", "calls", "err", "rec", "acted-agreement", "conf-wrong", "abstain",
        "raw-agreement", "would-skip")]
    for name in sorted(rows):
        r = rows[name]
        lines.append("%-18s %5d %4d %4d %-15s %-15s %-7d %-15s %d" % (
            name, r["calls"], r["errors"], r["recorded"],
            _frac(r["acted_agreement"], r["acted_agree"], r["acted_units"]),
            _frac(r["confident_wrong_rate"], r["confident_wrong"], r["confident_units"]),
            r["abstained"],
            _frac(r["agreement"], r["agree"], r["units"]),
            r["would_skip"]))
    return "\n".join(lines)


def cmd_record(args, env):
    from .cli import read_json_arg
    try:
        verdict = read_json_arg(args.verdict)
        record(args.call_id, verdict, env)
    except (OSError, ValueError) as exc:
        sys.stderr.write("jev record: %s\n" % exc)
        return 2
    if not any(e.get("type") == "call" and e.get("call_id") == args.call_id
               for e in log.read_entries(env)):
        sys.stderr.write("jev record: warning: unknown call_id %s (recorded anyway; it will not "
                         "appear in `jev report`)\n" % args.call_id)
    return 0


def cmd_report(args, env):
    rows = build_report(log.read_entries(env), since=args.since, point=args.point)
    if args.json:
        sys.stdout.write(json.dumps(rows, indent=2, sort_keys=True) + "\n")
    elif args.unrecorded:
        for name in sorted(rows):
            for cid in rows[name]["unrecorded"]:
                sys.stdout.write("%s %s\n" % (name, cid))
    else:
        sys.stdout.write(format_report(rows) + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("record", help="attach Claude's verdict to a call")
    p.add_argument("call_id")
    p.add_argument("verdict", help="JSON object, or @file")
    p.set_defaults(func=cmd_record)
    p = sub.add_parser("report", help="per-point agreement table")
    p.add_argument("--since", help="YYYY-MM-DD")
    p.add_argument("--point")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true")
    g.add_argument("--unrecorded", action="store_true", help="list call ids with no Claude verdict")
    p.set_defaults(func=cmd_report)
