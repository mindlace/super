"""Spec builders: spec-state (operator-tier) and coverage (fidelity-coverage).

`jev coverage` asks fidelity-coverage once per spec (each spec is its own state),
then counts carriers per traceability requirement in code (count_exactly_one) and
logs one aggregate call entry that `jev record` attaches the fresh-eyes verdict to.
"""
import re
from pathlib import Path

from .. import ask as ask_mod
from .. import combine, log
from ..cli import emit
from ..mode import resolve_mode
from . import _run

SEP_RE = re.compile(r"^\|?\s*:?-{3,}")


def tables_under(text, heading_pred):
    tables, inside, current = [], False, None
    for line in text.splitlines():
        if line.startswith("#"):
            inside, current = heading_pred(line.lstrip("#").strip()), None
            continue
        if inside and line.lstrip().startswith("|"):
            if current is None:
                current = []
                tables.append(current)
            current.append(line.strip())
        else:
            current = None
    return tables


def body_rows(table):
    return [r for r in table[1:] if not SEP_RE.match(r)]


def cells(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


def interface_rows(text):
    return sum(len(body_rows(t)) for t in tables_under(text, lambda h: "interface" in h.lower()))


def traceability_requirements(text):
    tables = tables_under(text, lambda h: "traceability" in h.lower())
    if not tables:
        return []
    return [cells(r)[0] for r in body_rows(tables[0]) if cells(r)[0]]


def spec_state(path):
    text = Path(path).read_text(encoding="utf-8")
    return {"spec_text": text, "interface_rows": interface_rows(text)}


def coverage(design_path, spec_paths, env, call_id=None, cwd=None, ask_fn=None):
    ask_fn = ask_fn or ask_mod.ask
    mode = resolve_mode(env, "fidelity-coverage")
    if mode == "off":
        return ask_mod.disabled("mode off")
    reqs = traceability_requirements(Path(design_path).read_text(encoding="utf-8"))
    if not reqs:
        return ask_mod.disabled("no traceability table rows in %s" % design_path)
    call_id = call_id or ask_mod.new_call_id()
    carriers, raws, confident, version = {}, {}, True, None
    for k, spec in enumerate(spec_paths):
        state = {"requirements": reqs, "spec_text": Path(spec).read_text(encoding="utf-8")}
        res = ask_fn("fidelity-coverage", state, env, call_id="%s.s%d" % (call_id, k),
                     cwd=cwd, write_log=False)
        if not res.get("enabled"):
            return ask_mod.disabled("spec %s: %s" % (spec, res.get("reason")),
                                    call_id=call_id, point="fidelity-coverage")
        carriers[str(spec)] = res["verdict"]
        raws[str(spec)] = res["raw"]
        confident = confident and res["confident"]
        version = res.get("template_version")
    counted = combine.count_exactly_one(list(carriers.values()), len(reqs))
    verdict = {"uncovered": counted["uncovered"], "multiply_covered": counted["multiply_covered"]}
    detail = {"n_requirements": len(reqs), "carriers": carriers, "counts": counted["counts"]}
    targets = [{"index": i, "requirement": reqs[i], "carriers": counted["counts"][i]}
               for i in sorted(set(verdict["uncovered"]) | set(verdict["multiply_covered"]))]
    log.safe_append({"type": "call", "call_id": call_id, "ts": ask_mod.now(),
                     "point": "fidelity-coverage", "template_version": version, "mode": mode,
                     "compare": "coverage", "on_skips": None, "verdict": verdict,
                     "confident": confident, "detail": detail, "raw": raws}, env, cwd)
    return {"enabled": True, "call_id": call_id, "point": "fidelity-coverage", "mode": mode,
            "verdict": verdict, "confident": confident, "targets": targets, "detail": detail}


def cmd_coverage(args, env):
    """Always exits 0 (fail open, like ask): any failure becomes a disabled result."""
    try:
        emit(coverage(args.design, args.spec, env, call_id=args.call_id))
    except Exception as exc:
        emit(ask_mod.disabled("coverage failed: %r" % (exc,)))
    return 0


def add_parser(sub):
    p = sub.add_parser("spec-state", help="operator-tier state: spec text + interface-row count")
    p.add_argument("spec")
    p.set_defaults(func=lambda a, env: _run(lambda: spec_state(a.spec)))
    p = sub.add_parser("coverage", help="fidelity-coverage across specs; always exits 0")
    p.add_argument("--design", required=True)
    p.add_argument("--spec", required=True, action="append")
    p.add_argument("--call-id")
    p.set_defaults(func=cmd_coverage)
