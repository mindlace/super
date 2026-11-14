"""Spec builder: coverage (fidelity-coverage).

`jev coverage` asks fidelity-coverage once per spec (each spec is its own state),
then counts carriers per traceability requirement in code (count_exactly_one) and
logs one aggregate call entry that `jev record` attaches the fresh-eyes verdict to.
"""
import re
from pathlib import Path

from .. import ask as ask_mod
from .. import combine, ctx, log, state as state_mod
from ..cli import emit
from ..mode import resolve_mode
from . import htmldoc

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


def traceability_requirements(text):
    tables = tables_under(text, lambda h: "traceability" in h.lower())
    if not tables:
        return []
    return [cells(r)[0] for r in body_rows(tables[0]) if cells(r)[0]]


HEADING_RE = re.compile(r"^(#{1,4})\s+(.*\S)\s*$")


def md_sections(text):
    """Markdown as the shared section shape: split on ATX headings (# to ####).

    Lines inside a ``` fence are text (kept verbatim), never headings or tables. Pipe tables
    become tables (first row is the header, separator rows dropped, id None, caption "").
    Text before the first heading is an entry with heading "" and path [], only when non-empty.
    """
    out = [{"id": None, "heading": "", "path": [], "lines": [], "tables": []}]
    stack, fenced, table = [], False, None
    for line in text.splitlines():
        cur = out[-1]
        if line.lstrip().startswith("```"):
            fenced, table = not fenced, None
            cur["lines"].append(line)
        elif fenced:
            cur["lines"].append(line)
        elif m := HEADING_RE.match(line):
            level, heading = len(m.group(1)), m.group(2)
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, heading))
            out.append({"id": None, "heading": heading, "path": [h for _, h in stack],
                        "lines": [], "tables": []})
            table = None
        elif line.lstrip().startswith("|"):
            if table is None:
                table = {"id": None, "caption": "", "header": None, "rows": []}
                cur["tables"].append(table)
            if SEP_RE.match(line.strip()):
                continue
            row = cells(line)
            if table["header"] is None:
                table["header"] = row
            else:
                table["rows"].append(row)
        else:
            table = None
            collapsed = " ".join(line.split())
            if collapsed:
                cur["lines"].append(collapsed)
    result = []
    for k, e in enumerate(out):
        item = {"id": None, "heading": e["heading"], "path": e["path"], "text": "\n".join(e["lines"])}
        if e["tables"]:
            item["tables"] = e["tables"]
        if k or item["text"] or e["tables"]:
            result.append(item)
    return result


def spec_sections(path):
    """Sections of a spec file: `.html` through htmldoc, anything else as markdown."""
    text = Path(path).read_text(encoding="utf-8")
    return htmldoc.sections(text) if Path(path).suffix == ".html" else md_sections(text)


def html_traceability_requirements(html):
    """First cell of each body row of the first table (in sections() order) whose caption or
    owning section heading contains "traceability"; None when there is no such table."""
    for sec in htmldoc.sections(html):
        for table in sec.get("tables", []):
            if "traceability" in (table["caption"] + "\n" + sec["heading"]).lower():
                return [r[0] for r in table["rows"] if r and r[0]]
    return None


def requirements(path):
    text = Path(path).read_text(encoding="utf-8")
    if Path(path).suffix != ".html":
        return traceability_requirements(text)
    reqs = html_traceability_requirements(text)
    if reqs is None:
        raise ValueError("no traceability table in %s (looked for a table whose caption or "
                         "section heading contains 'traceability')" % path)
    return reqs


def coverage(design_path, spec_paths, env, call_id=None, cwd=None, ask_fn=None):
    ask_fn = ask_fn or ask_mod.ask
    mode = resolve_mode(env, "fidelity-coverage")
    if mode == "off":
        return ask_mod.disabled("mode off")
    try:
        reqs = requirements(design_path)
    except ValueError as exc:
        return ask_mod.disabled(str(exc))
    if not reqs:
        return ask_mod.disabled("no traceability table rows in %s" % design_path)
    call_id = call_id or ask_mod.new_call_id()
    carriers, raws, confident, version = {}, {}, True, None
    blobs = {}   # one blob per spec: a combined blob would truncate past the size cap
    for k, spec in enumerate(spec_paths):
        state = {"requirements": reqs, "spec_sections": spec_sections(spec)}
        blobs[str(spec)] = state_mod.safe_write(state, env, cwd)
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
                     "confident": confident, "detail": detail, "raw": raws,
                     "state_sha": state_mod.safe_write({"requirements": reqs, "specs": blobs}, env, cwd),
                     "ctx": ctx.safe_collect(env, None, cwd)}, env, cwd)
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
    p = sub.add_parser("coverage", help="fidelity-coverage across specs; always exits 0")
    p.add_argument("--design", required=True)
    p.add_argument("--spec", required=True, action="append")
    p.add_argument("--call-id")
    p.set_defaults(func=cmd_coverage)
