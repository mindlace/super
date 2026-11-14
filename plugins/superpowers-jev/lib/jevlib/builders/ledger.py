"""Superconductor ledger builders: defect-state (defect-class).

Ledger format: supersonic skills/superconductor/SKILL.md "## Ledger format".
"""
import re
from pathlib import Path

from . import _run

TALLY_RE = re.compile(r"^-\s+(?P<slug>[a-z0-9][a-z0-9-]*):\s*\d+")
TAG_RE = re.compile(r"\[defect-class:\s*(?P<slug>[a-z0-9][a-z0-9-]*)\]")


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


def defect_state(args):
    return {"escalation": Path(args.escalation).read_text(encoding="utf-8"),
            "classes": defect_classes(Path(args.ledger).read_text(encoding="utf-8"))}


def add_parser(sub):
    p = sub.add_parser("defect-state", help="defect-class state: escalation + ledger classes")
    p.add_argument("--ledger", required=True)
    p.add_argument("--escalation", required=True, help="file holding the escalation text")
    p.set_defaults(func=lambda a, env: _run(lambda: defect_state(a)))
