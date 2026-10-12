"""`jev cite <report>`: citation state from verified-at-<file:line> claims.

Step 1 of the citation-check cookbook is deterministic: a claim whose file or line
does not exist goes to `unreadable` and is never sent to Jev (the citation rule
flags every unreadable claim). Readable claims carry the cited line ±5.
"""
import os
import re
from pathlib import Path

from . import _run

CLAIM_RE = re.compile(r"verified-at[-\s:]*`?(?P<file>[^\s`:,;()]+):(?P<line>\d+)(?:-(?P<end>\d+))?`?")
CONTEXT_LINES = 5
MAX_SECTION_LINES = 60
MAX_CLAIMS = 40
MAX_CLAIM_CHARS = 600


def extract_claims(text):
    out = []
    for raw in text.splitlines():
        for m in CLAIM_RE.finditer(raw):
            line = int(m.group("line"))
            out.append({"claim": raw.strip()[:MAX_CLAIM_CHARS], "file": m.group("file"),
                        "line": line, "end": int(m.group("end") or line)})
    return out[:MAX_CLAIMS]


def build_state(report_text, root):
    claims, unreadable = [], []
    for c in extract_claims(report_text):
        path = Path(c["file"]) if os.path.isabs(c["file"]) else Path(root) / c["file"]
        base = {"claim": c["claim"], "file": c["file"], "line": c["line"]}
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            unreadable.append(dict(base, why="file not found"))
            continue
        if not 1 <= c["line"] <= len(lines):
            unreadable.append(dict(base, why="line out of range"))
            continue
        lo = max(1, c["line"] - CONTEXT_LINES)
        hi = min(len(lines), c["end"] + CONTEXT_LINES, lo + MAX_SECTION_LINES - 1)
        section = "\n".join("%d: %s" % (n, lines[n - 1]) for n in range(lo, hi + 1))
        claims.append(dict(base, section=section))
    return {"claims": claims, "unreadable": unreadable}


def add_parser(sub):
    p = sub.add_parser("cite", help="citation state from a report's verified-at claims")
    p.add_argument("report")
    p.add_argument("--root", default=".", help="directory cited relative paths resolve against")
    p.set_defaults(func=lambda a, env: _run(lambda: build_state(
        Path(a.report).read_text(encoding="utf-8"), a.root)))
