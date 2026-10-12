"""Superconductor ledger builders: defect-state (defect-class) and bounce-state (bounce).

Ledger format: supersonic skills/superconductor/SKILL.md "## Ledger format".
"""
import re
from pathlib import Path

from . import _run

SPEC_LINE_RE = re.compile(r"^-\s+(?P<slug>[a-z0-9][a-z0-9-]*):\s+(?P<spec>\S+)\s+[—–-]+\s+status:\s*(?P<status>[a-z]+)")
TALLY_RE = re.compile(r"^-\s+(?P<slug>[a-z0-9][a-z0-9-]*):\s*\d+")
TAG_RE = re.compile(r"\[defect-class:\s*(?P<slug>[a-z0-9][a-z0-9-]*)\]")
SUMMARY_CHARS = 400


def section(text, title):
    out, inside = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            inside = line[3:].strip().lower() == title.lower()
            continue
        if inside:
            out.append(line)
    return out


def defect_classes(ledger_text):
    seen = []
    for line in section(ledger_text, "Frame-defect tally"):
        m = TALLY_RE.match(line)
        if m and m.group("slug") not in seen:
            seen.append(m.group("slug"))
    for m in TAG_RE.finditer(ledger_text):
        if m.group("slug") not in seen:
            seen.append(m.group("slug"))
    return seen


def spec_summary(path):
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return str(path)
    title = next((l[2:].strip() for l in text.splitlines() if l.startswith("# ")), str(path))
    goal = " ".join(l.strip() for l in section(text, "Goal") if l.strip())
    return ("%s: %s" % (title, goal) if goal else title)[:SUMMARY_CHARS]


def live_operators(ledger_text, root):
    ops = []
    for line in section(ledger_text, "Specs"):
        m = SPEC_LINE_RE.match(line)
        if m and m.group("status") == "dispatched":
            spec = Path(m.group("spec"))
            ops.append({"slug": m.group("slug"),
                        "summary": spec_summary(spec if spec.is_absolute() else Path(root) / spec)})
    return ops


def defect_state(args):
    return {"escalation": Path(args.escalation).read_text(encoding="utf-8"),
            "classes": defect_classes(Path(args.ledger).read_text(encoding="utf-8"))}


def bounce_state(args):
    return {"message": Path(args.message).read_text(encoding="utf-8"),
            "operators": live_operators(Path(args.ledger).read_text(encoding="utf-8"), args.root)}


def add_parser(sub):
    p = sub.add_parser("defect-state", help="defect-class state: escalation + ledger classes")
    p.add_argument("--ledger", required=True)
    p.add_argument("--escalation", required=True, help="file holding the escalation text")
    p.set_defaults(func=lambda a, env: _run(lambda: defect_state(a)))
    p = sub.add_parser("bounce-state", help="bounce state: misrouted message + live operators")
    p.add_argument("--ledger", required=True)
    p.add_argument("--message", required=True, help="file holding the misrouted message")
    p.add_argument("--root", default=".", help="project root that spec paths resolve against")
    p.set_defaults(func=lambda a, env: _run(lambda: bounce_state(a)))
