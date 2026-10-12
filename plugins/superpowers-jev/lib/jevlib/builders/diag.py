"""`jev diag-state`: diag-confidence state from a diagnosing-superpowers analyst return
(prompts/analyst-common.md:23-38: `- finding:` / `evidence:` / `turns:` / `confidence:`)."""
import re
from pathlib import Path

from . import _run

FIELD_RE = re.compile(r"^\s*-?\s*(finding|evidence|turns|confidence):\s*(.*)$")
LEVELS = ("low", "medium", "high")


def parse_analyst(text):
    findings, cur = [], None
    for line in text.splitlines():
        m = FIELD_RE.match(line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if key == "finding":
            cur = {"finding": val, "evidence": "", "analyst_confidence": None}
            findings.append(cur)
        elif cur is not None and key == "evidence":
            cur["evidence"] = val
        elif cur is not None and key == "confidence":
            word = val.lower().split()[0] if val else ""
            cur["analyst_confidence"] = word if word in LEVELS else None
    return {"findings": [f for f in findings if f["evidence"] and f["analyst_confidence"]]}


def add_parser(sub):
    p = sub.add_parser("diag-state", help="diag-confidence state from an analyst's findings")
    p.add_argument("file")
    p.set_defaults(func=lambda a, env: _run(lambda: parse_analyst(
        Path(a.file).read_text(encoding="utf-8"))))
