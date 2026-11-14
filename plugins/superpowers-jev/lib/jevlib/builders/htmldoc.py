"""Structured sections out of the semantic HTML spec format (docs/spec-format.md).

Stdlib `html.parser` only. The section shape is shared with `spec.md_sections`:
{"id", "heading", "path", "text", "tables"?}. See `sections` for the rules.
"""
from html.parser import HTMLParser

VOID = {"br", "hr", "img", "input", "meta", "link", "wbr", "col", "area", "base", "source", "track", "embed"}
BLOCK = {"p", "div", "li", "ul", "ol", "dl", "dt", "dd", "figure", "figcaption", "blockquote",
         "article", "aside", "main", "nav", "details", "summary", "tr"}
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
TABLE_PARTS = {"thead", "tbody", "tfoot"}


def _collapse(s):
    return " ".join(s.split())


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries = []        # entries in document order (header first, if any)
        self.header = None       # the header entry once created
        self.frames = []         # open sections, innermost last
        self.in_header = False
        self.first_h1 = None
        self.target = None       # entry receiving prose
        self.line = []           # inline pieces of the current line
        self.heading_buf = None  # (tag, pieces) while inside a heading
        self.pre = None          # pieces while inside <pre>
        self.table = None        # current table dict
        self.table_part = None
        self.row = None
        self.cell = None         # pieces while inside td/th
        self.caption = None      # pieces while inside caption
        self.svg = None          # see _svg_start

    # -- entries ----------------------------------------------------------
    @staticmethod
    def _new_entry(id_):
        return {"id": id_, "heading": "", "path": [], "lines": [], "tables": []}

    def _ensure_header(self):
        if self.header is None:
            self.header = self._new_entry(None)
            self.entries.insert(0, self.header)
        return self.header

    def _flush(self):
        text = _collapse("".join(self.line))
        self.line = []
        if text and self.target is not None:
            self.target["lines"].append(text)

    def _parent_path(self):
        if len(self.frames) > 1:
            return self.frames[-2]["path"]
        return self.header["path"] if self.header and self.header["heading"] else []

    # -- parser callbacks ---------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.svg is not None:
            return self._svg_start(tag, a)
        if tag == "svg":
            self._flush()
            self.svg = {"title": [], "nodes": {}, "edges": [], "stack": []}
            return self._svg_start(tag, a)
        if self.pre is not None:
            return
        if tag in ("br", "hr"):
            self._flush()
        elif tag == "section":
            self._flush()
            entry = self._new_entry(a.get("id"))
            self.entries.append(entry)
            self.frames.append(entry)
            self.target = entry
        elif tag == "header" and not self.frames:
            self._flush()
            self.in_header = True
            self.target = self._ensure_header()
        elif tag in HEADINGS:
            self._flush()
            self.heading_buf = (tag, [])
        elif tag == "pre":
            self._flush()
            self.pre = []
        elif tag == "table":
            self._flush()
            self.table = {"id": a.get("id"), "caption": "", "header": [], "rows": []}
            if self.target is not None:
                self.target["tables"].append(self.table)
        elif self.table is not None:
            if tag in TABLE_PARTS:
                self.table_part = tag
            elif tag == "tr":
                self.row = []
            elif tag in ("td", "th"):
                self.cell = []
            elif tag == "caption":
                self.caption = []
        elif tag in BLOCK:
            self._flush()

    def handle_endtag(self, tag):
        if self.svg is not None:
            return self._svg_end(tag)
        if tag in VOID:
            return
        if self.pre is not None:
            if tag == "pre":
                text = "".join(self.pre)
                self.pre = None
                text = text[1:] if text.startswith("\n") else text
                if text.strip() and self.target is not None:
                    self.target["lines"].append(text.rstrip("\n"))
            return
        if tag == "section" and self.frames:
            self._flush()
            self.frames.pop()
            self.target = self.frames[-1] if self.frames else None
        elif tag == "header" and self.in_header:
            self._flush()
            self.in_header = False
            self.target = None
        elif self.heading_buf and tag == self.heading_buf[0]:
            self._heading_done()
        elif tag == "table" and self.table is not None:
            self.table, self.table_part, self.row = None, None, None
        elif self.table is not None:
            self._table_end(tag)
        elif tag in BLOCK:
            self._flush()

    def _table_end(self, tag):
        if tag in TABLE_PARTS:
            self.table_part = None
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(_collapse("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.table_part == "thead":
                if not self.table["header"]:
                    self.table["header"] = self.row
            elif self.row:
                self.table["rows"].append(self.row)
            self.row = None
        elif tag == "caption" and self.caption is not None:
            self.table["caption"] = _collapse("".join(self.caption))
            self.caption = None

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID or self.svg is not None:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.svg is not None:
            return self._svg_data(data)
        if self.pre is not None:
            self.pre.append(data)
        elif self.heading_buf is not None:
            self.heading_buf[1].append(data)
        elif self.cell is not None:
            self.cell.append(data)
        elif self.caption is not None:
            self.caption.append(data)
        elif self.table is None:
            self.line.append(data)

    # -- headings -----------------------------------------------------------
    def _heading_done(self):
        tag, pieces = self.heading_buf
        self.heading_buf = None
        text = _collapse("".join(pieces))
        if tag == "h1" and self.first_h1 is None:
            self.first_h1 = text
        if tag == "h1" and not self.frames:
            head = self._ensure_header()
            if not head["heading"]:
                head["heading"], head["path"] = text, [text]
                if self.target is None:
                    self.target = head
                return
        t = self.target
        if t is None:
            return
        if t is not self.header and not t["heading"]:
            t["heading"], t["path"] = text, self._parent_path() + [text]
        elif text:
            t["lines"].append(text)

    # -- svg: title text and from -> to edges only ---------------------------
    def _svg_start(self, tag, a):
        svg = self.svg
        parent = svg["stack"][-1] if svg["stack"] else None
        node = parent["node"] if parent else None
        classes = (a.get("class") or "").split()
        if tag == "g" and "node" in classes and a.get("id") and node is None:
            node = a["id"]
            svg["nodes"][node] = []
        if tag == "g" and "edge" in classes and a.get("data-from") and a.get("data-to"):
            svg["edges"].append((a["data-from"], a["data-to"]))
        is_title = tag == "title" and parent is not None and parent["tag"] == "svg"
        svg["stack"].append({"tag": tag, "node": node, "title": is_title})

    def _svg_end(self, tag):
        stack = self.svg["stack"]
        if stack:
            stack.pop()
        if not stack:
            self._svg_done()

    def _svg_data(self, data):
        stack = self.svg["stack"]
        top = stack[-1] if stack else None
        if top is None:
            return
        if top["title"]:
            self.svg["title"].append(data)
        elif top["node"] is not None:
            self.svg["nodes"][top["node"]].append(data)

    def _svg_done(self):
        svg, self.svg = self.svg, None
        if self.target is None:
            return

        def label(i):
            return _collapse("".join(svg["nodes"].get(i, []))) or i

        title = _collapse("".join(svg["title"]))
        if title:
            self.target["lines"].append(title)
        for src, dst in svg["edges"]:
            self.target["lines"].append("%s → %s" % (label(src), label(dst)))


def _parse(html):
    p = _Parser()
    p.feed(html)
    p.close()
    p._flush()
    return p


def sections(html):
    """Structured sections of an HTML spec/design, in document order.

    The first entry is the header (id None, heading and path from the `h1`, text from the rest
    of the header); it is emitted only when the document has a `header` or an `h1`. Then one
    entry per `section` with its id and first heading. `path` is the chain of enclosing
    headings, starting at the `h1`. `text` is the section's own prose (not nested sections, not
    table cells), one block per line, whitespace-collapsed, `pre` verbatim. An `svg` contributes
    its `title` and one "<from> → <to>" line per edge (node ids resolve to node text). Prose
    outside any section and header is dropped. `tables` appears only when the section holds one.
    """
    out = []
    for e in _parse(html).entries:
        item = {"id": e["id"], "heading": e["heading"], "path": e["path"], "text": "\n".join(e["lines"])}
        if e["tables"]:
            item["tables"] = e["tables"]
        out.append(item)
    return out


def title(html):
    """Text of the first h1, or None."""
    return _parse(html).first_h1
