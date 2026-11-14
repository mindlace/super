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

from . import ask, log, registry


SOURCES = ("in_session", "blind_label", "auto_hook", "import")
# `import` records are written but excluded from every truth (adjudication/import scoring deferred).
TRUTHS = {"in_session": ("in_session",), "auto_hook": ("auto_hook",), "blind": ("blind_label",),
          "best": ("blind_label", "in_session", "auto_hook")}

RETIRED = frozenset({"operator-tier"})


def record(call_id, claude_verdict, env, cwd=None, source="in_session", rule_version=None,
           labeler=None):
    if not isinstance(claude_verdict, dict):
        raise ValueError("claude verdict must be a JSON object")
    if source not in SOURCES:
        raise ValueError("source must be one of %s, got %r" % ("|".join(SOURCES), source))
    entry = {"type": "record", "call_id": call_id, "ts": ask.now(),
             "claude_verdict": claude_verdict, "source": source}
    if rule_version is not None:
        entry["rule_version"] = rule_version
    if labeler is not None:
        entry["labeler"] = labeler
    log.append(entry, env, cwd)


def record_source(rec, calls):
    """A record's source; a legacy record without one is auto_hook for prompt-route calls."""
    if rec.get("source"):
        return rec["source"]
    point = (calls.get(rec.get("call_id")) or {}).get("point")
    return "auto_hook" if point == "prompt-route" else "in_session"


def select_truth(entries, truth="best"):
    """{call_id: (source, claude_verdict)}: latest record per (call, source), then the first
    source in TRUTHS[truth] order."""
    calls = {e.get("call_id"): e for e in entries if e.get("type") == "call"}
    latest = {}
    for e in entries:
        if e.get("type") == "record":
            latest[(e.get("call_id"), record_source(e, calls))] = e.get("claude_verdict") or {}
    out = {}
    for cid in {k[0] for k in latest}:
        for src in TRUTHS[truth]:
            if (cid, src) in latest:
                out[cid] = (src, latest[(cid, src)])
                break
    return out


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
            pick = it.get("pick")
            # "unclear" is Jev abstaining on this item, not a verdict an `on` run would act on.
            acted = None if pick == "unclear" else pick
            out.append((pick, acted, v, bool(it.get("confident"))))
        return out
    if kind == "coverage":
        n = detail.get("n_requirements", 0)
        jev = _coverage_classes(call.get("verdict") or {}, n)
        cla = _coverage_classes(claude, n)
        return [(a, a, b, bool(call.get("confident"))) for a, b in zip(jev, cla)]
    return []


def _new_row():
    return {"calls": 0, "errors": 0, "recorded": 0, "units": 0, "agree": 0,
            "confident_units": 0, "confident_wrong": 0, "would_skip": 0, "unrecorded": [],
            "acted_units": 0, "acted_agree": 0, "abstained": 0, "truth_mix": {}}


def _accumulate(r, cid, c, records):
    """Fold one call (and its selected-truth record, if any) into counter dict `r`."""
    r["calls"] += 1
    if c.get("error"):
        r["errors"] += 1
        return
    skip = c.get("on_skips")
    if skip and c.get("confident") and c.get("verdict") == skip.get("verdict"):
        r["would_skip"] += 1
    picked = records.get(cid)
    if picked is None:
        r["unrecorded"].append(cid)
        return
    src, claude = picked
    r["recorded"] += 1
    r["truth_mix"][src] = r["truth_mix"].get(src, 0) + 1
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


def _rates(r):
    r["agreement"] = r["agree"] / r["units"] if r["units"] else None
    r["acted_agreement"] = r["acted_agree"] / r["acted_units"] if r["acted_units"] else None
    r["confident_wrong_rate"] = (r["confident_wrong"] / r["confident_units"]
                                 if r["confident_units"] else None)


def build_report(entries, since=None, point=None, truth="best", by=None):
    calls = {}
    for e in entries:
        if e.get("type") == "call":
            calls[e.get("call_id")] = e
    records = select_truth(entries, truth)
    rows = {}
    latest = {}
    for cid, c in calls.items():
        if point and c.get("point") != point:
            continue
        if since and (c.get("ts") or "")[:10] < since:
            continue
        name = c.get("point")
        r = rows.setdefault(name, dict(_new_row(), labels_current=0, retired=name in RETIRED))
        _accumulate(r, cid, c, records)
        if by:
            key = c.get(by)
            sub = r.setdefault("by", {}).setdefault("-" if key is None else str(key), _new_row())
            _accumulate(sub, cid, c, records)
        if not c.get("error") and c.get("model") is not None:
            if name not in latest or (c.get("ts") or "") >= (latest[name].get("ts") or ""):
                latest[name] = c
    for name, r in rows.items():
        cur = latest.get(name) or {}
        r["current_model"] = cur.get("model")
        r["current_template_version"] = cur.get("template_version")
        if cur:
            r["labels_current"] = sum(
                1 for cid, c in calls.items()
                if c.get("point") == name and cid in records
                and c.get("model") == r["current_model"]
                and c.get("template_version") == r["current_template_version"]
                and not (since and (c.get("ts") or "")[:10] < since))
        _rates(r)
        for sub in (r.get("by") or {}).values():
            _rates(sub)
    return rows


def _frac(rate, num, den):
    return "-" if rate is None else "%.2f (%d/%d)" % (rate, num, den)


_FMT = "%-18s %5s %4s %4s %-15s %-15s %-7s %-15s %-10s %-22s %s"


def _line(label, r):
    mix = " / ".join("%s %d" % (k, r["truth_mix"][k]) for k in sorted(r["truth_mix"])) or "-"
    cur = "-"
    if r.get("current_model") is not None:
        cur = "%d @%s/v%s" % (r["labels_current"], r["current_model"],
                              r.get("current_template_version"))
    return _FMT % (
        label, r["calls"], r["errors"], r["recorded"],
        _frac(r["acted_agreement"], r["acted_agree"], r["acted_units"]),
        _frac(r["confident_wrong_rate"], r["confident_wrong"], r["confident_units"]),
        r["abstained"],
        _frac(r["agreement"], r["agree"], r["units"]),
        r["would_skip"], cur, mix)


def format_report(rows, truth="best", by=None):
    lines = [_FMT % ("point", "calls", "err", "rec", "acted-agreement", "conf-wrong", "abstain",
                     "raw-agreement", "would-skip", "labels-cur", "truth-mix")]
    for name in sorted(rows, key=lambda n: (bool(rows[n].get("retired")), n)):
        r = rows[name]
        lines.append(_line(name + (" (retired)" if r.get("retired") else ""), r))
        for val in sorted(r.get("by") or {}):
            lines.append(_line("  %s=%s" % (by, val), r["by"][val]))
    lines.append("truth: %s (%s)" % (truth, " > ".join(TRUTHS[truth])))
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
    if args.all:
        if registry.registry_path(env) is None:
            sys.stderr.write("jev report --all: no registry (set JEV_REGISTRY)\n")
            return 2
        entries = [e for d in registry.existing(env) for e in log.read_dir(d)]
    else:
        entries = log.read_entries(env)
    rows = build_report(entries, since=args.since, point=args.point, truth=args.truth,
                        by=args.by)
    if args.json:
        sys.stdout.write(json.dumps(rows, indent=2, sort_keys=True) + "\n")
    elif args.unrecorded:
        for name in sorted(rows):
            for cid in rows[name]["unrecorded"]:
                sys.stdout.write("%s %s\n" % (name, cid))
    else:
        sys.stdout.write(format_report(rows, args.truth, args.by) + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("record", help="attach Claude's verdict to a call")
    p.add_argument("call_id")
    p.add_argument("verdict", help="JSON object, or @file")
    p.set_defaults(func=cmd_record)
    p = sub.add_parser("report", help="per-point agreement table")
    p.add_argument("--since", help="YYYY-MM-DD")
    p.add_argument("--point")
    p.add_argument("--truth", choices=sorted(TRUTHS), default="best",
                   help="which record sources count as Claude's verdict (default best)")
    p.add_argument("--all", action="store_true",
                   help="aggregate every registered log dir (needs a registry)")
    p.add_argument("--by", choices=("model", "template_version"),
                   help="split each point by model or template version")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true")
    g.add_argument("--unrecorded", action="store_true", help="list call ids with no Claude verdict")
    p.set_defaults(func=cmd_report)
