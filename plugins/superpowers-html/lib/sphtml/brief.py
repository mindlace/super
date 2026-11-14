"""Extract one task's section from an HTML plan (docs/spec-format.md, "Example: a plan").

A task is a <section> whose first heading starts with "Task <id>". The brief is the
section's source text, copied verbatim.
"""
import re
from html.parser import HTMLParser
from typing import NamedTuple, Optional

# An id counts only if it contains a digit (upstream task-brief), so "Task notes" is no task.
TASK_RE = r"^Task\s+([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)"
HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6")


class TaskSection(NamedTuple):
    id: str
    start: int
    end: Optional[int]
    line: int


class TaskNotFound(LookupError):
    pass


class SectionUnclosed(ValueError):
    def __init__(self, line):
        super().__init__("section opened at line %d never closes" % line)
        self.line = line


class _Frame:
    def __init__(self, start, line):
        self.start, self.line = start, line
        self.nested = False       # a child section has opened
        self.in_heading = False
        self.heading_done = False
        self.text = []


class _Parser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.html = html
        self.line_starts = [0]
        for part in html.split("\n")[:-1]:
            self.line_starts.append(self.line_starts[-1] + len(part) + 1)
        self.stack = []
        self.found = []           # [id, start, end, line] in document order

    def _offset(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag == "section":
            if self.stack:
                self.stack[-1].nested = True
                self.stack[-1].in_heading = False
            start = self._offset()
            self.stack.append(_Frame(start, self.getpos()[0]))
        elif tag in HEADINGS and self.stack:
            f = self.stack[-1]
            if not f.nested and not f.heading_done:
                f.in_heading = True

    def handle_endtag(self, tag):
        if tag in HEADINGS and self.stack:
            f = self.stack[-1]
            if f.in_heading:
                f.in_heading, f.heading_done = False, True
        elif tag == "section" and self.stack:
            f = self.stack.pop()
            end = self.html.index(">", self._offset()) + 1
            self._record(f, end)

    def handle_data(self, data):
        if self.stack and self.stack[-1].in_heading:
            self.stack[-1].text.append(data)

    def _record(self, frame, end):
        text = " ".join("".join(frame.text).split())
        m = re.match(TASK_RE, text)
        if m and re.search(r"[0-9]", m.group(1)):
            self.found.append([m.group(1), frame.start, end, frame.line])

    def finish(self):
        self.close()
        while self.stack:
            self._record(self.stack.pop(), None)
        return [TaskSection(*f) for f in sorted(self.found, key=lambda f: f[1])]


def task_sections(html):
    p = _Parser(html)
    p.feed(html)
    return p.finish()


def extract(html, n):
    matches = [s for s in task_sections(html) if s.id == n]
    for s in matches:
        if s.end is None:
            raise SectionUnclosed(s.line)
    top = [s for s in matches
           if not any(o is not s and o.start < s.start < o.end for o in matches)]
    if not top:
        raise TaskNotFound(n)
    return "\n".join(html[s.start:s.end] for s in top) + "\n"
