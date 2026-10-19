"""SDD review builders: rereview-state (re-review), findings-state (severity), diff-state (tier)."""
import json
import re
import subprocess
from pathlib import Path

from . import _run

BULLET_RE = re.compile(r"^\s*(?:[-*]|\d+[.)])\s+(.*)$")
SEV_RE = re.compile(r"^#{2,6}\s*(Critical|Important|Minor)\b", re.I)
HEADING_RE = re.compile(r"^#{1,6}\s")
PATH_RE = re.compile(r"(?<![\w/.-])([\w.-]+(?:/[\w.-]+)*\.[A-Za-z0-9]+)(?::\d+(?:-\d+)?)?")
MAX_HUNKS_PER_FINDING = 8
MAX_HUNK_CHARS = 4000
FIX_DIFF_MAX_CHARS = 60000
FIX_DIFF_TRUNCATED_MARKER = "\n[... truncated ...]"
RISK_PATTERNS = {
    "concurrency": r"\b(thread|threading|mutex|lock|semaphore|async|await|goroutine|atomic|race)\b",
    "persistence": r"\b(migration|migrate|schema|ALTER TABLE|CREATE TABLE|DROP TABLE|transaction)\b",
    "security": r"\b(auth|authz|password|token|secret|crypto|permission|sanitize|escape)\b",
}


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), capture_output=True,
                          text=True, check=True).stdout


def parse_findings(text):
    """A JSON list (strings or {"text"}) or markdown bullets; continuation lines join."""
    s = text.strip()
    if s.startswith("["):
        return [d if isinstance(d, str) else d["text"] for d in json.loads(s)]
    out = []
    for line in text.splitlines():
        m = BULLET_RE.match(line)
        if m and not line[:1].isspace():
            out.append(m.group(1).strip())
        elif out and line.strip():
            out[-1] += " " + line.strip()
    return out


def files_mentioned(text):
    seen = []
    for m in PATH_RE.finditer(text):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return seen


def diff_hunks(repo, base, head, path):
    text = git(repo, "diff", "-U3", base, head, "--", path)
    hunks, cur = [], None
    for line in text.splitlines():
        if line.startswith("@@"):
            cur = [path, line]
            hunks.append(cur)
        elif cur is not None:
            cur.append(line)
    return ["\n".join(h)[:MAX_HUNK_CHARS] for h in hunks]


def fix_diff(repo, base, head):
    """The whole fix diff, capped at FIX_DIFF_MAX_CHARS (cut at a hunk boundary when possible)."""
    text = git(repo, "diff", "-U3", base, head)
    if len(text) <= FIX_DIFF_MAX_CHARS:
        return text
    cut = text[:FIX_DIFF_MAX_CHARS]
    boundary = max(cut.rfind("\n@@"), cut.rfind("\ndiff --git"))
    if boundary > 0:
        cut = cut[:boundary]
    return cut + FIX_DIFF_TRUNCATED_MARKER


def rereview_state(findings_text, repo, base, head):
    changed = [p for p in git(repo, "diff", "--name-only", base, head).splitlines() if p]
    findings = []
    for text in parse_findings(findings_text):
        files = []
        for f in files_mentioned(text):
            for c in changed:
                if (c == f or c.endswith("/" + f)) and c not in files:
                    files.append(c)
        hunks = []
        for f in files:
            hunks.extend(diff_hunks(repo, base, head, f))
        findings.append({"text": text, "hunks": hunks[:MAX_HUNKS_PER_FINDING]})
    state = {"findings": findings}
    if any(not f["hunks"] for f in findings):
        diff = fix_diff(repo, base, head)
        if diff:
            state["fix_diff"] = diff
    return state


def parse_review(text):
    """Findings under Critical / Important / Minor headings of a reviewer report."""
    findings, sev, current = [], None, None

    def start(t):
        nonlocal current
        if t.lower().rstrip(".") in ("none", "n/a", "none found"):
            current = None
            return
        current = {"text": t, "reviewer_severity": sev}
        findings.append(current)

    for line in text.splitlines():
        m = SEV_RE.match(line)
        if m:
            sev, current = m.group(1).lower(), None
            continue
        if HEADING_RE.match(line):
            sev, current = None, None
            continue
        if sev is None:
            continue
        stripped = line.strip()
        if not stripped:
            current = None
            continue
        b = BULLET_RE.match(line)
        if b and not line[:1].isspace():
            start(b.group(1).strip())
        elif current is None:
            start(stripped)
        else:
            current["text"] += " " + stripped
    return {"findings": findings}


def diff_state(repo, base, head, scoped_rereview=False):
    stat = git(repo, "diff", "--stat", base, head)
    files = lines = 0
    for row in git(repo, "diff", "--numstat", base, head).splitlines():
        parts = row.split("\t")
        if len(parts) >= 3:
            files += 1
            lines += sum(int(x) for x in parts[:2] if x.isdigit())
    added = "\n".join(l[1:] for l in git(repo, "diff", "-U0", base, head).splitlines()
                      if l.startswith("+") and not l.startswith("+++"))
    signals = [name for name, pat in RISK_PATTERNS.items() if re.search(pat, added, re.I)]
    if git(repo, "diff", "--diff-filter=D", "--name-only", base, head).strip():
        signals.append("deletes_files")
    return {"role": "reviewer", "diff_stat": stat[-4000:], "files_changed": files,
            "lines_changed": lines, "risk_signals": signals, "scoped_rereview": scoped_rereview}


def add_parser(sub):
    p = sub.add_parser("rereview-state", help="re-review state: findings + their fix-diff hunks (+ whole fix_diff when a finding has none)")
    p.add_argument("--findings", required=True, help="findings file (bullets or JSON list)")
    p.add_argument("--base", required=True, help="FIX_BASE: the head the previous review saw")
    p.add_argument("--head", default="HEAD")
    p.add_argument("--repo", default=".")
    p.set_defaults(func=lambda a, env: _run(lambda: rereview_state(
        Path(a.findings).read_text(encoding="utf-8"), a.repo, a.base, a.head)))
    p = sub.add_parser("findings-state", help="severity state from a reviewer report")
    p.add_argument("review")
    p.set_defaults(func=lambda a, env: _run(lambda: parse_review(
        Path(a.review).read_text(encoding="utf-8"))))
    p = sub.add_parser("diff-state", help="reviewer tier state: diff stat, sizes, risk signals")
    p.add_argument("base")
    p.add_argument("head", nargs="?", default="HEAD")
    p.add_argument("--repo", default=".")
    p.add_argument("--scoped-rereview", action="store_true")
    p.set_defaults(func=lambda a, env: _run(lambda: diff_state(
        a.repo, a.base, a.head, a.scoped_rereview)))
