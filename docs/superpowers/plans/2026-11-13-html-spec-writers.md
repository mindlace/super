# HTML Spec Writers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** supercomposer, and superpowers through a new `superpowers-html` overlay plugin, write design docs, specs and plans in the semantic HTML format; HTML plans still execute; the jev checks that read design docs and specs work on HTML.

**Architecture:** supersonic's skill text changes paths to `.html` and points at a symlinked `docs/spec-format.md`. superpowers-jev's fidelity-coverage question moves to v2, which takes a spec as structured `spec_sections` (headings, paths, prose, tables) built from either format: a stdlib `html.parser` reader (`builders/htmldoc.py`) for HTML and a heading splitter in `spec.py` for markdown, chosen by file extension. The new plugin `superpowers-html` is a SessionStart note plus an `html-docs` overlay skill, a Python helper CLI (`bin/superpowers-html`: hook, compat, upstream-root, brief), and two bash entry points (`bin/task-brief`, `bin/task-start`) that mirror upstream's command lines and delegate non-HTML plans to the installed upstream scripts.

**Tech Stack:** bash, Python 3 stdlib only (`html.parser`, `unittest`), Claude Code plugin manifests/hooks, Markdown skill files.

**Spec:** `docs/superpowers/specs/2026-11-13-html-spec-writers-design.html` (format: `docs/spec-format.md`)

## Global Constraints

- Plugin versions: supersonic `0.2.0` → `0.3.0`; superpowers-jev `0.6.0` → `0.7.0`; new superpowers-html `0.1.0`. Each in its `.claude-plugin/plugin.json`.
- The format reference has exactly one copy, `docs/spec-format.md`. Each plugin that writes the format holds a **symlink** to it; never copy it.
- Never edit, fork or patch superpowers' own files. superpowers-html overlays; supersonic never depends on superpowers-html (each works without the other).
- Superpowers version written against: `7.0.2`. The version check accepts superpowers `7.x` and warns on anything else, as `jev compat` does; on an unknown version it warns once and carries on.
- Hooks fail open: an error in the overlay never blocks a session; the hook launcher always exits 0.
- Python is stdlib-only (`html.parser`), matching superpowers-jev.
- A `.md` plan runs exactly as it does today. Existing markdown specs/plans are not converted.
- `task-brief` keeps upstream's command line `[-C DIR] PLAN_FILE TASK_NUMBER [OUTFILE]`, output line `wrote <path>: N lines`, exit codes 2 usage, 3 not found. Task ids match as whole strings; a deeper task section whose id extends the requested one stays in the brief.
- `task-start` keeps upstream's command line `PLAN_FILE TASK_NUMBER` and prints `brief: <path>` then `base: <sha>`.
- Plan checkboxes are never ticked during execution; the workspace ledger is the progress record.
- Jev receives every spec, markdown or HTML, as structured `spec_sections` (one schema for both formats; `fidelity-coverage.json` version `2`, `additionalProperties: false`), never raw HTML and never a `spec_text` blob. SVG diagrams contribute only their `title` and `from → to` edges.
- A jev builder that cannot find an expected HTML table or title says so; it never silently returns nothing.
- The superconductor ledger, operator reports and `.superpowers/` working files stay markdown.
- Never `cd X && cmd`: issue `cd` as its own command. Conventional Commits; no Claude attribution or co-author trailers.
- All commands below run from the worktree root `/Users/mindlace/Projects/super/.claude/worktrees/html-spec-writers`.

## Review Focus

1. **A design doc whose first table is not the traceability table** (the interface table usually comes first): `jev coverage` must pick the table captioned or sectioned "traceability", not the first table. Test: Task 1 `test_html_traceability_skips_earlier_tables` (fixture puts the interface table first).
2. **Escaped markup that looks like a task inside a `pre`** (a plan that documents the format, e.g. `&lt;section id="sec-task-9"&gt;&lt;h2&gt;Task 9`): must not become a task. Test: Task 4 `test_escaped_task_in_pre_is_not_a_task`.
3. **A task heading with inline markup or line breaks** (`<h2>Task <code>3</code>:\n  Inline</h2>`): the id is read from the heading's text, not its raw source. Test: Task 4 `test_heading_with_inline_markup`.
4. **A task section that never closes** (`</section>` missing, the HTML analogue of upstream's unclosed fence): refuse with exit 4 rather than brief the rest of the file, and leave no output file. Test: Task 4 `test_unclosed_section_exits_4`.
5. **A markdown spec with a fenced code block holding `# comment` or `| pipe |` lines**: they must stay text, not split the spec into false sections or tables. Test: Task 1 `test_markdown_fence_hides_headings_and_pipes`. (An HTML spec's big inline SVG is pinned by `test_svg_gives_title_and_edges_only`.)

---

## File Structure

| Path | Responsibility |
|---|---|
| `plugins/superpowers-jev/lib/jevlib/builders/htmldoc.py` (new) | Read a format HTML file into sections (id, heading, path, text, tables) and its `h1` title |
| `plugins/superpowers-jev/lib/jevlib/builders/spec.py` | Markdown sections; `coverage` picks the reader by extension for requirements and `spec_sections` |
| `plugins/superpowers-jev/questions/fidelity-coverage.json`, `lib/jevlib/schema.py` | v2 state schema (`spec_sections`); validator gains `null` and list types |
| `plugins/superpowers-jev/lib/jevlib/builders/ledger.py` | `spec_summary`: HTML title/goal |
| `tests/jev/fixtures/{design,spec-a,spec-b}.html` (new) | HTML counterparts of the markdown fixtures |
| `plugins/supersonic/skills/supercomposer/SKILL.md`, `spec-format.md` (symlink, new) | Design doc and specs written as HTML |
| `plugins/supersonic/skills/superconductor/{SKILL.md,operator-briefing.md}` | Accept either format; conditional html-docs line in operator prompts |
| `plugins/superpowers-html/.claude-plugin/plugin.json` (new) | Manifest, 0.1.0 |
| `plugins/superpowers-html/hooks/{hooks.json,run-hook.cmd,html-hook}` (new) | SessionStart note, fail-open launcher |
| `plugins/superpowers-html/bin/superpowers-html` (new) | Python helper CLI entry (`hook`, `compat`, `upstream-root`, `brief`) |
| `plugins/superpowers-html/lib/sphtml/{__init__,cli,upstream,hook,brief}.py` (new) | Helper internals |
| `plugins/superpowers-html/bin/task-brief`, `bin/task-start` (new) | HTML-aware drop-ins for upstream's scripts |
| `plugins/superpowers-html/skills/html-docs/{SKILL.md,spec-format.md}` (new; the latter a symlink) | The overlay skill |
| `tests/html/` (new) | Python suite for superpowers-html, its fixtures and a fake upstream install |
| `tests/run.sh`, `tests/test_manifests.sh`, `tests/test_format_links.sh` (new), `tests/test_html_docs_skill.sh` (new), `tests/test_supercomposer_md.sh`, `tests/test_skill_md.sh`, `tests/test_operator_briefing.sh`, `tests/test_supersonic_layout.sh` | Test wiring |
| `.claude-plugin/marketplace.json`, `README.md`, `.gitattributes` | Marketplace listing, docs, LF for new extensionless scripts and `*.html` |

---

### Task 1: superpowers-jev 0.7.0 sends specs to Jev as structured sections

**Files:**
- Create: `plugins/superpowers-jev/lib/jevlib/builders/htmldoc.py`
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/spec.py:15-59` (markdown sections, requirements and spec sections by extension; `coverage` state)
- Modify: `plugins/superpowers-jev/lib/jevlib/builders/ledger.py:39-46` (`spec_summary` HTML branch)
- Modify: `plugins/superpowers-jev/lib/jevlib/schema.py:9-25` (`"null"` type; `type` may be a list)
- Modify: `plugins/superpowers-jev/questions/fidelity-coverage.json` (version `2`, `spec_sections`)
- Modify: `plugins/superpowers-jev/.claude-plugin/plugin.json` (version `0.7.0`)
- Create: `tests/jev/fixtures/design.html`, `tests/jev/fixtures/spec-a.html`, `tests/jev/fixtures/spec-b.html`
- Modify: `tests/jev/fixtures/states/fidelity-coverage.json` (`spec_sections` from `spec-b.md`)
- Test: `tests/jev/test_builders_supersonic.py`, `tests/jev/test_templates_supersonic.py:21,148-151`, `tests/jev/test_schema.py`

**Interfaces:**
- Consumes: existing `spec.traceability_requirements(text) -> list[str]` (spec.py:42, markdown design docs, unchanged), `spec.cells(row)` and `spec.SEP_RE` (spec.py:15,38), `ledger.SUMMARY_CHARS` (ledger.py:13), `ask_mod.disabled(reason)` (spec.py:53-56).
- Produces:
  - **Section shape** (one schema for both formats): `{"id": str | None, "heading": str, "path": [str], "text": str, "tables"?: [Table]}`. `path` is the chain of enclosing headings, outermost first, ending with this one; it starts at the document title (HTML `h1`, markdown `#`). `text` is the section's own prose only (not nested sections, not table cells), one block per line, whitespace-collapsed, blank lines dropped, entities decoded, `pre` kept verbatim. `tables` is present only when the section holds a table. **Table** = `{"id": str | None, "caption": str, "header": [str], "rows": [[str]]}`: `header` is the column-header cells (`[]` if none), `rows` the body rows as cell texts; markdown tables have `id` `None` and `caption` `""`.
  - `htmldoc.sections(html: str) -> list[Section]` (stdlib `html.parser`). The `header` is the first entry: `id` `None`, `heading` and `path` from the `h1`, `text` from the rest of the header. Then one entry per `section`, in document order, with its `id` and first heading. An `svg` contributes only its `title` text, then one line per edge `"<from> → <to>"`, where `data-from`/`data-to` resolve to that node's `text` (the raw id when no node has it). Node text, edge labels and shapes are dropped. A `figcaption` is ordinary text.
  - `htmldoc.title(html: str) -> str | None` — text of the first `h1`.
  - `spec.md_sections(text: str) -> list[Section]` — split on ATX headings (`#`–`####`). Lines inside a fenced code block (```` ``` ````) are text, never headings or tables. Pipe tables become Table: the first row is `header`, separator rows are dropped, and `id` is `None`. Text before the first heading becomes an entry with heading `""` and path `[]`, and only when it is non-empty.
  - `spec.spec_sections(path) -> list[Section]` — `Path(path).suffix == ".html"` → `htmldoc.sections`, otherwise `md_sections` (builder's call: the format's file names are lowercase `.html`).
  - `spec.html_traceability_requirements(html: str) -> list[str] | None` — the first table, in `sections()` order, whose `caption` or owning section's `heading` contains "traceability" (case-insensitive); first cell of each body row, non-empty ones only. `None` when no such table exists.
  - `spec.requirements(path) -> list[str]` — `.html` → `html_traceability_requirements`; on `None` raise `ValueError("no traceability table in %s (looked for a table whose caption or section heading contains 'traceability')" % path)`. Otherwise `traceability_requirements` unchanged.
  - `coverage` state per spec becomes `{"requirements": reqs, "spec_sections": spec_sections(spec)}`. There is no `spec_text` anywhere any more.
  - `ledger.spec_summary(path)`: markdown unchanged. `.html` gives `"<h1>: <goal>"`, where goal is the `text` of the first section headed "Goal" (case-insensitive). It gives `"<h1>"` when there is no Goal section, and `"%s (no h1)" % path` when there is no `h1`. Truncated to `SUMMARY_CHARS`.
  - `schema.validate`: `_TYPES["null"] = type(None)`. A `type` given as a list passes when any listed type matches. The error for a list reads `"%s: expected %s" % (path, " or ".join(types))`.
  - `questions/fidelity-coverage.json` v2: `state_schema.required = ["requirements", "spec_sections"]`, still `additionalProperties: false`. Items are closed objects with `required` `["id", "heading", "path", "text"]`, `id` `{"type": ["string", "null"]}`, and an optional `tables` whose items are closed objects with `id` (`["string", "null"]`), `caption`, `header` (array of string) and `rows` (array of array of string). The `carries` instructions name state only as backticked paths, for example: "The spec is `spec_sections`: one entry per section, with its `heading`, its `path` of enclosing headings, its prose `text`, and any `tables` as `header` and `rows` of cells. Does this spec carry the design requirement `requirements[{i}]`, by stating it in a section or through a table row that implements it?" Criteria, combine, `item_label` and `compare` are unchanged. `notes` gets one sentence saying v2 replaced v1's `spec_text`.

- [ ] **Step 1: Write the HTML fixtures**

`design.html`: `h1` "Shop design"; section `sec-goal` ("Goal" / "Sell things."); then the **interface table first**: section `sec-interfaces` headed "Interface table" with `tbl-interfaces`. Then section `sec-traceability` headed "Traceability table" with `tbl-traceability` (caption "Traceability table", `thead` row `Model claim | Carried by`, and the three body rows from `design.md` with the claim in `th scope="row"`).

`spec-a.html` (exact structure; whitespace free):

```html
<article>
  <header><h1>Auth spec</h1></header>
  <section id="sec-goal"><h2>Goal</h2><p>Validate session tokens in middleware for every route.</p></section>
  <section id="sec-interfaces"><h2>Interface rows</h2>
    <table id="tbl-interfaces"><caption>Interface rows</caption>
      <thead><tr><th scope="col">Producer</th><th scope="col">Consumer</th><th scope="col">Signature</th></tr></thead>
      <tbody><tr><td>auth</td><td>billing</td><td>verify(token) -&gt; User</td></tr>
        <tr><td>auth</td><td>search</td><td>current_user() -&gt; User</td></tr></tbody>
    </table>
  </section>
  <section id="sec-flow"><h2>Flow</h2>
    <figure id="fig-flow"><svg class="diagram" viewBox="0 0 300 60" role="img"><title>Token flow</title>
      <g class="node" id="n-client"><rect x="0" y="0" width="80" height="40"/><text x="40" y="20">client</text></g>
      <g class="node" id="n-mw"><rect x="200" y="0" width="80" height="40"/><text x="240" y="20">middleware</text></g>
      <g class="edge" data-from="n-client" data-to="n-mw"><path d="M80 20H198"/><text x="140" y="14">token</text></g>
    </svg><figcaption>Figure 1. Tokens pass through middleware.</figcaption></figure>
  </section>
</article>
```

`spec-b.html`: `h1` "Billing spec", section `sec-goal` with "Charge customers; prices are integer cents.".

- [ ] **Step 2: Write the failing tests**

In `tests/jev/test_builders_supersonic.py` (imports gain `tempfile` and `htmldoc`):

```python
SPEC_A_MD_SECTIONS = [
    {"id": None, "heading": "Auth spec", "path": ["Auth spec"], "text": ""},
    {"id": None, "heading": "Goal", "path": ["Auth spec", "Goal"],
     "text": "Validate session tokens in middleware for every route."},
    {"id": None, "heading": "Interface rows", "path": ["Auth spec", "Interface rows"], "text": "",
     "tables": [{"id": None, "caption": "", "header": ["Producer", "Consumer", "Signature"],
                 "rows": [["auth", "billing", "verify(token) -> User"],
                          ["auth", "search", "current_user() -> User"]]}]},
]

class SectionsTest(unittest.TestCase):
    def test_markdown_sections(self):
        self.assertEqual(spec.md_sections((FX / "spec-a.md").read_text()), SPEC_A_MD_SECTIONS)

    def test_html_sections(self):
        got = htmldoc.sections((FX / "spec-a.html").read_text())
        self.assertEqual([s["id"] for s in got], [None, "sec-goal", "sec-interfaces", "sec-flow"])
        self.assertEqual(got[1], dict(SPEC_A_MD_SECTIONS[1], id="sec-goal"))
        self.assertEqual(got[2]["tables"], [dict(SPEC_A_MD_SECTIONS[2]["tables"][0],
                                                 id="tbl-interfaces", caption="Interface rows")])
        self.assertEqual(got[2]["text"], "")

    def test_svg_gives_title_and_edges_only(self):
        flow = htmldoc.sections((FX / "spec-a.html").read_text())[3]
        self.assertEqual(flow["text"], "Token flow\nclient → middleware\nFigure 1. Tokens pass through middleware.")

    def test_nested_section_path_and_own_text(self):
        got = htmldoc.sections('<article><header><h1>T</h1></header><section id="a"><h2>A</h2><p>x</p>'
                               '<section id="b"><h3>B</h3><p>y</p></section></section></article>')
        self.assertEqual([(s["path"], s["text"]) for s in got[1:]], [(["T", "A"], "x"), (["T", "A", "B"], "y")])

    def test_markdown_fence_hides_headings_and_pipes(self):
        got = spec.md_sections("# T\n## A\n```sh\n# not a heading\n| not | a table |\n```\n")
        self.assertEqual(len(got), 2)
        self.assertEqual(got[1]["text"], "```sh\n# not a heading\n| not | a table |\n```")
        self.assertNotIn("tables", got[1])

    def test_both_formats_validate_against_the_template(self):
        t = support.template("fidelity-coverage")
        self.assertEqual(t["version"], 2)
        for p in ("spec-a.md", "spec-a.html", "spec-b.md", "spec-b.html"):
            state = {"requirements": ["r"], "spec_sections": spec.spec_sections(FX / p)}
            self.assertEqual(schema.validate(t["state_schema"], state), [], p)
```

In `SpecTest`, replace the `spec_text` assertions in `test_coverage_counts_carriers_across_specs_and_logs_once` and `test_coverage_big_specs_rebuild_exactly`. `fake_ask` picks the spec by `state["spec_sections"][0]["heading"] == "Auth spec"`. The blob equals `{"requirements": ..., "spec_sections": spec.spec_sections(path)}`. Then add:

```python
    def test_html_traceability_skips_earlier_tables(self):
        self.assertEqual(spec.requirements(FX / "design.html"),
                         spec.traceability_requirements((FX / "design.md").read_text()))

    def test_html_traceability_by_section_heading(self):
        html = ('<article><section id="s"><h2>Traceability</h2><table id="t"><caption>Claims</caption>'
                '<thead><tr><th scope="col">Claim</th></tr></thead><tbody><tr><td>A</td></tr></tbody>'
                '</table></section></article>')
        self.assertEqual(spec.html_traceability_requirements(html), ["A"])

    def test_html_design_without_traceability_table_reports(self):
        p = Path(tempfile.mkdtemp()) / "d.html"
        p.write_text('<article><header><h1>D</h1></header></article>', encoding="utf-8")
        out = spec.coverage(p, [FX / "spec-a.html"], support.make_env(), ask_fn=lambda *a, **k: 1 / 0)
        self.assertFalse(out["enabled"])
        self.assertIn("no traceability table in %s" % p, out["reason"])

    def test_coverage_html_sends_sections_never_raw_html(self):
        env = support.make_env()
        spec.coverage(FX / "design.html", [FX / "spec-a.html"], env, call_id="cov-h",
                      ask_fn=lambda *a, **k: {"enabled": True, "verdict": [0], "confident": True,
                                              "raw": {}, "template_version": 2})
        blob = state.read_blob(state.load("cov-h", env)["specs"][str(FX / "spec-a.html")], log.log_dir(env))
        self.assertEqual(sorted(blob), ["requirements", "spec_sections"])
        self.assertEqual(blob["spec_sections"], htmldoc.sections((FX / "spec-a.html").read_text()))
        self.assertNotIn("<", json.dumps(blob["spec_sections"]))
```

In `LedgerTest`:

```python
    def test_spec_summary_html(self):
        self.assertEqual(ledger.spec_summary(FX / "spec-a.html"),
                         "Auth spec: Validate session tokens in middleware for every route.")

    def test_spec_summary_html_without_h1_reports(self):
        p = Path(tempfile.mkdtemp()) / "s.html"
        p.write_text('<article><p>x</p></article>', encoding="utf-8")
        self.assertEqual(ledger.spec_summary(p), "%s (no h1)" % p)
```

In `tests/jev/test_templates_supersonic.py`, change `AGENT_FIELDS["fidelity-coverage"]` (line 21) to `["spec_sections[].heading", "spec_sections[].text", "spec_sections[].tables[].caption", "spec_sections[].tables[].rows"]`. In `test_fidelity_coverage_end_to_end_through_coverage` (line 150), make the responder pick by `payload["state"]["spec_sections"][0]["heading"] == "Auth spec"`. Add `test_fidelity_coverage_fixture_state_matches_builder`, which asserts `support.fixture_state("fidelity-coverage")["spec_sections"] == spec.md_sections((support.FIXTURES / "spec-b.md").read_text())`.

In `tests/jev/test_schema.py`: `validate({"type": ["string", "null"]}, None) == []`, the same for `"x"`, and `validate({"type": ["string", "null"]}, 3) == ["$: expected string or null"]`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev`
Expected: ERROR `cannot import name 'htmldoc'`, plus failures in the template and schema tests.

- [ ] **Step 4: Implement `schema.py` list and null types, `htmldoc.py`, `spec.md_sections`, `spec.spec_sections`, `spec.requirements`, `spec.html_traceability_requirements`, the `coverage` state, and the HTML branch of `ledger.spec_summary`**

`coverage` (spec.py:49) calls `requirements(design_path)` inside a `try`, and a `ValueError` becomes `ask_mod.disabled(str(exc))`. An empty list keeps the existing reason `"no traceability table rows in %s"`. The per-spec `specs` dict (spec.py:59) becomes `{str(s): spec_sections(s)}`. Remove every `spec_text` use.

- [ ] **Step 5: Bump `questions/fidelity-coverage.json` to version 2 with the v2 schema and instructions, rewrite `tests/jev/fixtures/states/fidelity-coverage.json` with `spec_sections` from `spec-b.md`, and set `plugins/superpowers-jev/.claude-plugin/plugin.json` to `0.7.0`**

There is no `jev lint` command; `test_lint_clean_and_plugin` (test_templates_supersonic.py) lints the v2 template.

- [ ] **Step 6: Run the whole jev suite**

Run: `python3 -m unittest discover -s tests/jev -t tests/jev`
Expected: OK (the live test skips without `JEV_LIVE=1`).

- [ ] **Step 7: Commit**

```bash
git add plugins/superpowers-jev tests/jev
git commit -m "feat(jev): send specs to fidelity-coverage as structured sections and read HTML design docs"
```

**Report note.** I checked `jev report` and it does not separate template versions by default. `build_report` (report.py:160-198) pools v1 and v2 calls into one fidelity-coverage row. Only `labels-cur` is restricted to the current `template_version`, and `--by template_version` (report.py:282) splits the row. Comparing v2 against past v1 runs therefore needs `jev report --point fidelity-coverage --by template_version`. Changing the default is out of scope for this task.

---

### Task 2: supersonic 0.3.0 writes HTML packages and accepts either format

**Files:**
- Modify: `plugins/supersonic/skills/supercomposer/SKILL.md:86-124` (Phase C3 path and format, Phase C4 spec path)
- Create: `plugins/supersonic/skills/supercomposer/spec-format.md` — symlink to `../../../../docs/spec-format.md`
- Modify: `plugins/supersonic/skills/superconductor/SKILL.md:56-70` (Phase 1 intake, either format) and `:138-153` (Dispatch, conditional line)
- Modify: `plugins/supersonic/skills/superconductor/operator-briefing.md:35-37` (spec may be `.md` or `.html`)
- Modify: `plugins/supersonic/.claude-plugin/plugin.json` (version `0.3.0`)
- Create: `tests/test_format_links.sh`
- Modify: `tests/test_supercomposer_md.sh`, `tests/test_skill_md.sh`, `tests/test_operator_briefing.sh`, `tests/test_supersonic_layout.sh:7`
- Modify: `.gitattributes` (add `*.html text eol=lf`)

**Interfaces:**
- Consumes: none from earlier tasks (Task 1's `jev coverage` reads what this skill writes; the skill text needs no change for it beyond the table caption).
- Produces: the ids the supercomposer design doc uses, which `jev coverage` (Task 1) relies on through the caption: sections `sec-goal`, `sec-subsystems`, `sec-dependency-order`, `sec-global-constraints`, `sec-out-of-scope`, `sec-traceability`, `sec-commitment-layering`; tables `tbl-interfaces` (caption "Interface table"), `tbl-traceability` (caption "Traceability table"), `tbl-coverage` (caption "Coverage table"). Builder's call: these exact ids, so packages are linkable consistently. `tests/test_format_links.sh` takes a list of symlink paths that Task 6 extends.

- [ ] **Step 1: Write the failing tests**

`tests/test_format_links.sh` (new): for each path in `links="plugins/supersonic/skills/supercomposer/spec-format.md"`: `test -L`, `python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))'` equals the realpath of `docs/spec-format.md`, and `git ls-files -s <path>` mode is `120000`. Prints `PASS: format links`.

Append to `tests/test_supercomposer_md.sh`:

```sh
for s in 'docs/superpowers/design/YYYY-MM-DD-HHMM-<topic>.html' 'docs/superpowers/specs/YYYY-MM-DD-<slug>-design.html' \
         'spec-format.md' 'tbl-traceability' 'tbl-interfaces' 'tbl-coverage'; do
  grep -qF -- "$s" "$skill" || { echo "FAIL: supercomposer SKILL.md missing HTML package text: $s"; exit 1; }
done
grep -qF -- '-<topic>.md' "$skill" && { echo "FAIL: supercomposer still names a .md design doc"; exit 1; }
grep -qF -- '-design.md`' "$skill" && { echo "FAIL: supercomposer still names a .md spec"; exit 1; }
```

Append to `tests/test_skill_md.sh`: `grep -qF 'superpowers-html:html-docs'` and `grep -qF 'among your available skills'` on the superconductor SKILL.md; `grep -qF '.html'` (intake accepts either format).

Append to `tests/test_operator_briefing.sh`: `grep -qF '.html' "$briefing"` (either format), and `grep -qF 'superpowers-html' "$briefing" && fail` (the briefing stays static; the conditional line lives in the superconductor).

Add `supercomposer/spec-format.md` to the file list in `tests/test_supersonic_layout.sh:7`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `sh tests/test_format_links.sh; sh tests/test_supercomposer_md.sh; sh tests/test_skill_md.sh; sh tests/test_operator_briefing.sh; sh tests/test_supersonic_layout.sh`
Expected: each prints a `FAIL:` line.

- [ ] **Step 3: Create the symlink**

Run: `ln -s ../../../../docs/spec-format.md plugins/supersonic/skills/supercomposer/spec-format.md`

- [ ] **Step 4: Edit the skill texts**

- supercomposer Phase C3: path `docs/superpowers/design/YYYY-MM-DD-HHMM-<topic>.html`, an HTML fragment following `spec-format.md` in this skill's directory (read it; do not restate it). Required sections keep their names, become `section`s with the ids in Interfaces; the interface, traceability and coverage tables are captioned `table`s with those ids.
- supercomposer Phase C4: spec path `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.html`, same format, embedded interface rows as a captioned table.
- supercomposer Phase C0 (reappraisal): an amended package keeps the format it was composed in (builder's call: converting old packages is a spec non-goal).
- superconductor Phase 1: the design doc and specs may be `.md` (composed before supersonic 0.3.0) or `.html`; check required sections by heading in either.
- superconductor Dispatch: after the `## Your assignment` block, "If `superpowers-html:html-docs` is among your available skills, add the line `- Before superpowers:writing-plans, load superpowers-html:html-docs.` to the assignment. Otherwise the prompt is unchanged."
- operator-briefing step 2: the spec file may be markdown (`.md`) or HTML (`.html`); read either. No mention of superpowers-html.

- [ ] **Step 5: Bump `plugins/supersonic/.claude-plugin/plugin.json` to `0.3.0`; add `*.html text eol=lf` to `.gitattributes`**

- [ ] **Step 6: Run tests to verify they pass**

Run: `sh tests/run.sh`
Expected: every `PASS:` line, unittest `OK`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/supersonic tests .gitattributes
git commit -m "feat(supersonic): compose design docs and specs in the HTML spec format"
```

---

### Task 3: superpowers-html scaffold, SessionStart note, compat and marketplace listing

**Files:**
- Create: `plugins/superpowers-html/.claude-plugin/plugin.json` (name `superpowers-html`, version `0.1.0`, author/homepage/repository/license as in `plugins/superpowers-jev/.claude-plugin/plugin.json`)
- Create: `plugins/superpowers-html/hooks/hooks.json` (SessionStart only, matcher `startup|clear|compact`, command `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" html-hook session-start`, timeout `10`; as `plugins/superpowers-jev/hooks/hooks.json:3-14`)
- Create: `plugins/superpowers-html/hooks/run-hook.cmd` (a relative symlink to `../../superpowers-jev/hooks/run-hook.cmd`, not a copy: no duplicates are maintained, and a symlink is copied into the installed plugin when the marketplace is cloned, so superpowers-html does not need superpowers-jev installed. `tests/test_format_links.sh` also asserts this link resolves to that file)
- Create: `plugins/superpowers-html/hooks/html-hook` (as `plugins/superpowers-jev/hooks/jev-hook:1-16`, running `python3 "$PLUGIN_ROOT/bin/superpowers-html" hook "${1:-}" 2>/dev/null || true; exit 0`)
- Create: `plugins/superpowers-html/bin/superpowers-html` (as `plugins/superpowers-jev/bin/jev:1-16`; import failure → message on stderr, exit 1)
- Create: `plugins/superpowers-html/lib/sphtml/__init__.py`, `cli.py`, `upstream.py`, `hook.py`
- Modify: `.claude-plugin/marketplace.json` (third entry `superpowers-html`, source `./plugins/superpowers-html`; marketplace description names it), `README.md` (table row, install line, one paragraph: overlays superpowers 7.x like superpowers-jev, makes specs and plans `.html`, keep superpowers installed)
- Modify: `tests/test_manifests.sh:19,27` (three plugins, in order `supersonic`, `superpowers-jev`, `superpowers-html`)
- Modify: `tests/run.sh:10-12` (also `python3 -m unittest discover -s "$root/tests/html" -t "$root/tests/html"`)
- Modify: `.gitattributes` (`plugins/superpowers-html/bin/* text eol=lf`, `plugins/superpowers-html/hooks/html-hook text eol=lf`)
- Create: `tests/html/support.py`, `tests/html/test_hook.py`, `tests/html/test_upstream.py`
- Create: `tests/html/fixtures/fake-superpowers/.claude-plugin/plugin.json` (`{"name": "superpowers", "version": "7.0.2"}`) and `tests/html/fixtures/fake-superpowers/skills/brainstorming/SKILL.md` (frontmatter only, so `skills/` exists; Task 4 adds the script stubs)

**Interfaces:**
- Consumes: the root-resolution approach of `plugins/superpowers-jev/lib/jevlib/builders/superpowers.py:29-50` (port, don't import: plugins ship standalone).
- Produces:
  - `sphtml.upstream.WRITTEN_AGAINST = "7.0.2"`, `COMPATIBLE_MAJOR = "7"`
  - `sphtml.upstream.superpowers_root(env: Mapping[str, str]) -> Path | None` — `SUPERPOWERS_ROOT` override, else `~/.claude/plugins/installed_plugins.json` keys named `superpowers@*`, enabled installs (per `~/.claude/settings.json` `enabledPlugins`) first, first with a `skills/` dir.
  - `sphtml.upstream.version(root: Path) -> str | None`
  - `sphtml.upstream.compat(env) -> dict` — `{"superpowers_root": str|None, "superpowers_version": str|None, "compatible": bool, "written_against": "7.0.2"}`; compatible iff the major is `7`.
  - `sphtml.hook.SESSION_NOTE: str`; `sphtml.hook.session_start() -> dict` → `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": SESSION_NOTE}}`.
  - `sphtml.cli.main(argv: list[str]) -> int` with subcommands: `hook session-start` (prints JSON, exit 0; an unknown hook name prints nothing, exit 0); `compat` (prints JSON, always exit 0); `upstream-root` (prints the path, exit 0; none found → stderr `superpowers-html: no installed superpowers found (set SUPERPOWERS_ROOT)`, exit 1). Task 4 adds `brief`.
  - `tests/html/support.py`: `REPO`, `PLUGIN`, `BIN`, `HOOK` (`PLUGIN/hooks/run-hook.cmd`), `FIXTURES`, `FAKE_SP`; `sys.path` gets `PLUGIN/lib`; `fake_superpowers(version: str) -> Path` copies `FAKE_SP` to a temp dir and rewrites its version; `run(cmd: list[str], env: dict | None = None, cwd=None, input="") -> tuple[int, str, str]`.

- [ ] **Step 1: Write the failing tests**

`tests/html/test_hook.py`:

```python
def run_hook(env_extra=None, stdin='{"hook_event_name": "SessionStart"}', hook=support.HOOK):
    env = {"PATH": os.environ["PATH"], "HOME": tempfile.mkdtemp()}
    env.update(env_extra or {})
    return support.run(["bash", str(hook), "html-hook", "session-start"], env=env, input=stdin)

class SessionStartTest(unittest.TestCase):
    def test_emits_note(self):
        code, out, _ = run_hook()
        self.assertEqual(code, 0)
        ctx = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(ctx["hookEventName"], "SessionStart")
        for needle in ("superpowers-html is active", "superpowers-html:html-docs", ".html plan"):
            self.assertIn(needle, ctx["additionalContext"])

    def test_garbage_stdin_still_exits_zero(self):
        self.assertEqual(run_hook(stdin="{not json")[0], 0)

    def test_broken_install_exits_zero_silently(self):
        tmp = Path(tempfile.mkdtemp()) / "p"
        shutil.copytree(support.PLUGIN, tmp)
        shutil.rmtree(tmp / "lib")
        self.assertEqual(run_hook(hook=tmp / "hooks" / "run-hook.cmd")[:2], (0, ""))

    def test_no_python_exits_zero_silently(self):
        self.assertEqual(run_hook({"PATH": "/nonexistent"})[:2], (0, ""))

    def test_unknown_hook_name_exits_zero(self):
        code, out, _ = support.run(["bash", str(support.HOOK), "html-hook", "nope"],
                                   env={"PATH": os.environ["PATH"]})
        self.assertEqual((code, out), (0, ""))
```

`tests/html/test_upstream.py`: `test_compat_7x_ok_others_not` (`7.0.2`, `7.3.0` → True; `6.4.1`, `8.0.0` → False; `written_against == "7.0.2"`); `test_compat_not_installed` (`{"HOME": tempdir}` → root `None`, compatible False); `test_root_prefers_enabled_install` (port of `tests/jev/test_builders_superpowers.py:180-190`); `test_cli_compat_prints_json_exit_0`; `test_cli_upstream_root` (prints `FAKE_SP` copy path with `SUPERPOWERS_ROOT` set; exit 1 and the message with an empty `HOME` and no override).

Update `tests/test_manifests.sh` to expect the three names.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s tests/html -t tests/html` then `sh tests/test_manifests.sh`
Expected: import errors / FAIL (plugin missing; `plugins must be supersonic, superpowers-jev, superpowers-html`).

- [ ] **Step 3: Implement the plugin files listed above**

`SESSION_NOTE` wording is the builder's (spec: "Left to the builder"), but it says that superpowers-html is active and that before writing a spec or a plan, or executing an `.html` plan, Claude loads `superpowers-html:html-docs`. `run-hook.cmd`, `html-hook` and `bin/superpowers-html` are committed mode `100755`.

- [ ] **Step 4: Update `.claude-plugin/marketplace.json`, `README.md`, `tests/run.sh`, `.gitattributes`**

- [ ] **Step 5: Run tests to verify they pass**

Run: `sh tests/run.sh`
Expected: all `PASS:`, both unittest runs `OK`, exit 0 (including `claude plugin validate plugins/superpowers-html` when `claude` is on PATH).

- [ ] **Step 6: Commit**

```bash
git add plugins/superpowers-html .claude-plugin/marketplace.json README.md tests .gitattributes
git commit -m "feat(superpowers-html): scaffold the overlay plugin with its SessionStart note and compat check"
```

---

### Task 4: `bin/task-brief` extracts a task from an HTML plan

**Files:**
- Create: `plugins/superpowers-html/lib/sphtml/brief.py`
- Modify: `plugins/superpowers-html/lib/sphtml/cli.py` (add `brief` subcommand)
- Create: `plugins/superpowers-html/bin/task-brief` (bash, mode `100755`)
- Create: `tests/html/fixtures/plan.html`, `tests/html/fixtures/plan-unclosed.html`, `tests/html/fixtures/plan.md`
- Create: `tests/html/fixtures/fake-superpowers/skills/subagent-driven-development/scripts/{task-brief,sdd-workspace,sdd-repo}` (stubs)
- Test: `tests/html/test_task_brief.py`

**Interfaces:**
- Consumes: `superpowers-html upstream-root` (Task 3); upstream `skills/subagent-driven-development/scripts/task-brief` and `sdd-workspace` (7.0.2: `task-brief:1-108`, `sdd-workspace:35-110`).
- Produces:
  - `sphtml.brief.TASK_RE = r"^Task\s+([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)"`; an id counts only if it contains a digit (upstream task-brief:68).
  - `sphtml.brief.TaskSection(NamedTuple)`: `id: str`, `start: int`, `end: int | None`, `line: int` (`start`/`end` are character offsets: `start` at the `<` of `<section`, `end` just past the `>` of its matching `</section>`, `None` if it never closes; `line` is 1-based).
  - `sphtml.brief.task_sections(html: str) -> list[TaskSection]` — every `section` (any depth) whose first heading (`h1`-`h6`, before any nested `section`) has whitespace-normalized text matching `TASK_RE` with a digit-bearing id; document order.
  - `sphtml.brief.TaskNotFound(LookupError)`, `sphtml.brief.SectionUnclosed(ValueError)` (carries `.line`).
  - `sphtml.brief.extract(html: str, n: str) -> str` — `html[start:end]` of every task section whose `id == n` (whole-string compare) and that is not nested inside another match, joined by `"\n"`, plus a trailing `"\n"`. Nested sections (e.g. Task 7a in Task 7) stay because the slice is verbatim. Raises `TaskNotFound` if none, `SectionUnclosed` if a match has `end is None`.
  - `superpowers-html brief PLAN N OUT` — writes `extract()` to OUT and exits 0; `TaskNotFound` → stderr `task N not found in PLAN (no section headed 'Task N')`, plus, when the plan has no task sections at all, a second line `task-brief: no task sections found. A task is a <section> whose first heading starts with "Task <id>" (docs/spec-format.md, "Example: a plan").`, exit 3; `SectionUnclosed` → stderr `task-brief: the <section> opened at line L of PLAN never closes; close it and rerun`, exit 4. OUT is not created on failure.
  - `bin/task-brief [-C DIR] PLAN_FILE TASK_NUMBER [OUTFILE]`:
    - `-C DIR`: missing dir → `bad -C directory: DIR`, exit 2; otherwise `cd DIR` (as upstream task-brief:13-17).
    - 2 or 3 args after `-C`, else upstream's usage line, exit 2.
    - PLAN_FILE not ending in `.html` → resolve the upstream root and `exec "${BASH:-bash}" "$root/skills/subagent-driven-development/scripts/task-brief" <original args, including -C DIR>` from the original cwd (unchanged hand-off). No upstream → the `upstream-root` message, exit 2.
    - `.html`: missing file → `no such plan file: PLAN`, exit 2. OUT is OUTFILE, else `"$("${BASH:-bash}" "$root/.../sdd-workspace" "$plan")/task-${n}-brief.md"` (builder's call: keep upstream's `task-N-brief.md` name so SDD's brief→report derivation, SDD SKILL.md:217, still holds; the content is HTML). Run `python3 "$here/superpowers-html" brief "$plan" "$n" "$out"`; propagate its exit code; on success print `wrote ${out}: $(wc -l < "$out" | tr -d ' ') lines`.

- [ ] **Step 1: Write the fixtures and the fake upstream stubs**

`plan.html` (exact):

```html
<article>
  <header>
    <h1>Fixture plan</h1>
  </header>
  <section id="sec-global-constraints">
    <h2>Global Constraints</h2>
    <pre><code data-lang="html">&lt;section id="sec-task-9"&gt;&lt;h2&gt;Task 9: hidden&lt;/h2&gt;&lt;/section&gt;</code></pre>
  </section>
  <section id="sec-task-notes">
    <h2>Task notes</h2>
  </section>
  <section id="sec-task-1">
    <h2>Task 1: First</h2>
    <ol>
      <li id="t1-s1"><input type="checkbox"> Step one</li>
    </ol>
  </section>
  <section id="sec-task-3">
    <h2>Task <code>3</code>:
      Inline</h2>
  </section>
  <section id="sec-task-6">
    <h2>Task 6: Six</h2>
  </section>
  <section id="sec-task-6b">
    <h2>Task 6b: Six b</h2>
  </section>
  <section id="sec-task-7">
    <h2>Task 7: Seven</h2>
    <section id="sec-task-7a">
      <h3>Task 7a: Seven a</h3>
    </section>
    <p>After 7a.</p>
  </section>
</article>
```

`plan-unclosed.html`: an `article` with a closed Task 1 section, then `<section id="sec-task-2"><h2>Task 2: Open</h2><p>x</p>` and `</article>` with no `</section>`. `plan.md`: two `### Task N:` headings.

Stubs (invoked via bash, no exec bit needed):
- `task-brief`: `[ "${1:-}" = "-C" ] && { cd "$2"; shift 2; }`; `out=${3:-$(bash "$(dirname "$0")/sdd-workspace" "$1")/task-$2-brief.md}`; `printf 'UPSTREAM %s\n' "$*" > "$out"`; `echo "wrote $out: 1 lines"`; `exit "${UPSTREAM_RC:-0}"`.
- `sdd-workspace`: `d="$PWD/.superpowers/sdd/$(basename "$1")"; mkdir -p "$d"; echo "$d"`.
- `sdd-repo`: print `git rev-parse --show-toplevel`; with `--with-commit`, exit 1 with `no commit yet` on stderr when `git rev-parse --verify -q HEAD` fails. (Used by Task 5.)

- [ ] **Step 2: Write the failing tests**

`tests/html/test_task_brief.py` — helper `brief(*args, cwd=None, root=FAKE_SP copy) -> (code, out, err)` runs `bash BIN/task-brief` with `SUPERPOWERS_ROOT` set (or with an empty `HOME` and no override when `root=None`); `section(fixture_text, id) -> str` slices from `<section id="<id>"` to its `</section>` (by hand-written offsets in the test, independent of `brief.py`).

```python
    def test_found_writes_section_verbatim(self):
        out = tmp / "b.md"
        code, stdout, _ = brief(str(PLAN), "1", str(out))
        self.assertEqual(code, 0)
        self.assertEqual(out.read_text(), section(PLAN_TEXT, "sec-task-1") + "\n")
        self.assertEqual(stdout, "wrote %s: %d lines\n" % (out, out.read_text().count("\n")))

    def test_task_6_excludes_6b(self):      # brief 6 == section sec-task-6 only; brief 6b == sec-task-6b only
    def test_subtask_7a_stays_in_7(self):   # brief 7 contains "Task 7a: Seven a" and "After 7a."
    def test_requesting_7a_alone(self):     # brief 7a == section sec-task-7a
    def test_heading_with_inline_markup(self):          # brief 3 == section sec-task-3
    def test_escaped_task_in_pre_is_not_a_task(self):   # brief 9 -> exit 3
    def test_heading_without_digit_is_not_a_task(self): # brief notes -> exit 3
    def test_not_found_exit_3(self):
        code, _, err = brief(str(PLAN), "2", str(tmp / "x.md"))
        self.assertEqual(code, 3)
        self.assertIn("task 2 not found in %s" % PLAN, err)
        self.assertFalse((tmp / "x.md").exists())
    def test_no_task_sections_hint(self):   # an article with only non-task sections -> exit 3, err has "no task sections found"
    def test_unclosed_section_exits_4(self):            # plan-unclosed.html 2 -> 4, "never closes", no OUT file
    def test_closed_task_before_unclosed_one_still_briefs(self):  # plan-unclosed.html 1 -> 0
    def test_usage_exit_2(self):            # no args; 4 positional args; missing plan file; bad -C dir
    def test_default_out_uses_upstream_workspace(self):
        # cwd=tmp, plan copied into tmp; stdout path == tmp/.superpowers/sdd/plan.html/task-1-brief.md
    def test_C_runs_in_dir(self):           # -C tmp with a relative plan path and no OUTFILE -> path under tmp
    def test_markdown_hands_off_unchanged(self):
        code, stdout, _ = brief(str(PLAN_MD), "2", str(tmp / "m.md"))
        self.assertEqual(code, 0)
        self.assertEqual((tmp / "m.md").read_text(), "UPSTREAM %s 2 %s\n" % (PLAN_MD, tmp / "m.md"))
    def test_markdown_hand_off_keeps_C_and_exit_code(self):   # args "-C", tmp, ...; UPSTREAM_RC=3 -> exit 3
    def test_html_with_outfile_needs_no_upstream(self):       # root=None, OUTFILE given -> 0
    def test_markdown_without_upstream_exit_2(self):          # root=None -> 2, "no installed superpowers found"

    @unittest.skipUnless(REAL_SP, "superpowers not installed")
    def test_markdown_matches_real_upstream(self):
        # with SUPERPOWERS_ROOT=REAL_SP: our task-brief and REAL_SP's task-brief on plan.md task 1
        # (explicit OUTFILEs) write identical files and identical stdout apart from the path
```

`REAL_SP = upstream.superpowers_root(os.environ)` when its version's major is `7`, else `None`.

Also unit tests on `brief.task_sections(PLAN_TEXT)`: ids are `["1", "3", "6", "6b", "7", "7a"]`, and `line` of Task 1 is `12`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3 -m unittest discover -s tests/html -t tests/html -p test_task_brief.py`
Expected: ERROR, `No module named 'sphtml.brief'` / non-zero exits.

- [ ] **Step 4: Implement `brief.py`, the `brief` subcommand and `bin/task-brief`**

`task_sections` subclasses `html.parser.HTMLParser`: on `starttag section` push a frame recording `getpos()`; collect text between the frame's first heading start/end tags (ignore headings once a nested section opened); on `endtag section` pop and set `end` to the index just past the `>` found from the end tag's position. Convert `getpos()` (line, column) to offsets with a table of line starts computed by splitting on `"\n"` (keep `\r`). Frames left on the stack at EOF have `end=None`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m unittest discover -s tests/html -t tests/html`
Expected: OK (the real-upstream test runs when superpowers 7.x is installed, else skips).

- [ ] **Step 6: Commit**

```bash
git add plugins/superpowers-html tests/html
git commit -m "feat(superpowers-html): task-brief extracts one task section from an HTML plan"
```

---

### Task 5: `bin/task-start` for executing-plans

**Files:**
- Create: `plugins/superpowers-html/bin/task-start` (bash, mode `100755`)
- Test: `tests/html/test_task_start.py`

**Interfaces:**
- Consumes: `bin/task-brief` (Task 4: prints `wrote <path>: N lines`); `superpowers-html upstream-root` (Task 3); upstream `skills/subagent-driven-development/scripts/sdd-repo --with-commit` (7.0.2 `executing-plans/scripts/task-start:21-25`).
- Produces: `bin/task-start PLAN_FILE TASK_NUMBER` — wrong arg count → `usage: task-start PLAN_FILE TASK_NUMBER`, exit 2; no upstream → the `upstream-root` message, exit 2; `repo=$("${BASH:-bash}" "$sdd/sdd-repo" --with-commit)` (failure propagates); `out=$("${BASH:-bash}" "$here/task-brief" "$plan" "$n")` (failure propagates its exit code); brief path parsed with upstream's `sed -n 's/^wrote \(.*\): [0-9][0-9]* lines$/\1/p'` (missing → `task-brief did not report a path: <out>`, exit 1); prints `brief: <path>` then `base: $(git -C "$repo" rev-parse --verify HEAD)`. Mirrors upstream task-start:14-32, but calls this plugin's task-brief.

- [ ] **Step 1: Write the failing tests**

Each test makes a temp git repo with one commit (`git init`, `git -c user.name=t -c user.email=t@t commit --allow-empty -m init`), copies `plan.html`/`plan.md` into it, and runs `bash BIN/task-start` with `cwd=repo` and `SUPERPOWERS_ROOT` = fake upstream copy.

```python
    def test_html_prints_brief_and_base(self):
        code, out, _ = start("plan.html", "6")
        lines = out.splitlines()
        self.assertEqual(code, 0)
        self.assertTrue(lines[0].startswith("brief: "))
        self.assertEqual(Path(lines[0][7:]).read_text(), section(PLAN_TEXT, "sec-task-6") + "\n")
        self.assertEqual(lines[1], "base: " + head_sha(repo))
    def test_markdown_goes_through_upstream(self):   # brief file content starts with "UPSTREAM plan.md 1"
    def test_usage_exit_2(self):                     # one arg -> 2
    def test_not_found_propagates_3(self):           # plan.html 9 -> 3, no "base:" on stdout
    def test_repo_without_commit_fails(self):        # fresh git init, no commit -> non-zero, no "base:"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s tests/html -t tests/html -p test_task_start.py`
Expected: FAIL (`bin/task-start` missing, bash exit 127).

- [ ] **Step 3: Implement `bin/task-start`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest discover -s tests/html -t tests/html`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/superpowers-html/bin/task-start tests/html
git commit -m "feat(superpowers-html): task-start for inline execution of HTML plans"
```

---

### Task 6: the `html-docs` overlay skill

**Files:**
- Create: `plugins/superpowers-html/skills/html-docs/SKILL.md`
- Create: `plugins/superpowers-html/skills/html-docs/spec-format.md` — symlink to `../../../../docs/spec-format.md`
- Modify: `tests/test_format_links.sh` (add the second link path)
- Create: `tests/test_html_docs_skill.sh`
- Create: `tests/html/test_anchors.py`

**Interfaces:**
- Consumes: `bin/superpowers-html compat` (Task 3), `bin/task-brief` (Task 4), `bin/task-start` (Task 5), reached from the skill as `<this skill's base directory>/../../bin/<name>` (the convention `tests/test_jev_skills.sh:22` pins for the jev skill).
- Produces: `superpowers-html:html-docs`, which overrides these upstream (7.0.2) steps, each named by its section heading:

  | Upstream file (under `skills/`) | Heading | Override |
  |---|---|---|
  | `brainstorming/SKILL.md` | `## The Written Design` | spec goes to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.html`, in the format; the human partner's preferences still override path and format |
  | `writing-plans/SKILL.md` | `## Overview` | "Save plans to" becomes `docs/superpowers/plans/YYYY-MM-DD-<feature>.html` |
  | `writing-plans/SKILL.md` | `## Plan Document Header` | the `header` (h1 + one-line `p`, plus the "For agentic workers" line as `aside data-kind="note"`), then section `sec-overview` with the Goal, Architecture, Tech Stack and Spec lines (builder's call on the id: the spec names none); Global Constraints is section `sec-global-constraints`; Review Focus is section `sec-review-focus` |
  | `writing-plans/SKILL.md` | `## Task Structure` | each task is a `section` with id `sec-task-N` and an `h2` starting `Task N:`; Files and Interfaces are lists inside it; each step is a checklist `li` with id `tN-sK`; code is `pre` > `code data-lang` |
  | `writing-plans/SKILL.md` | `## Execution Handoff` | the handoff messages name the `.html` path |
  | `subagent-driven-development/SKILL.md` | `### 1. Dispatch the implementer` | for an `.html` plan run this plugin's `task-brief` (same arguments) instead of `scripts/task-brief` |
  | `executing-plans/SKILL.md` | `### 1. Take the task` | for an `.html` plan run this plugin's `task-start` instead of `scripts/task-start` |

  Plus: never reorder a superpowers step; nobody ticks plan checkboxes during execution (the ledger is the record, so plan edits never land in a review diff); other upstream scripts (`sdd-workspace`, `review-package`, `task-done`) take the `.html` plan unchanged; read `spec-format.md` in this skill's directory; once per session run `superpowers-html compat` and, if `compatible` is false, tell the human partner once that superpowers-html was written against superpowers 7.0.2, name the installed version, and carry on.

- [ ] **Step 1: Write the failing tests**

`tests/test_html_docs_skill.sh`: frontmatter has exactly `name: html-docs` and a `description` starting `Use when` or `Use alongside`, ≤ 500 chars (as `tests/test_jev_skills.sh:8-15`); the skill contains each of these strings:

```sh
for s in '## The Written Design' '## Overview' '## Plan Document Header' '## Task Structure' '## Execution Handoff' \
         '### 1. Dispatch the implementer' '### 1. Take the task' \
         'docs/superpowers/specs/YYYY-MM-DD-<topic>-design.html' 'docs/superpowers/plans/YYYY-MM-DD-<feature>.html' \
         'sec-global-constraints' 'sec-task-N' 'tN-sK' 'Task N:' \
         '../../bin/task-brief' '../../bin/task-start' '../../bin/superpowers-html compat' \
         'spec-format.md' '7.0.2' 'checkbox'; do
  grep -qF -- "$s" "$skill" || fail "html-docs skill missing: $s"
done
```

`tests/test_format_links.sh`: add `plugins/superpowers-html/skills/html-docs/spec-format.md` to `links`.

`tests/html/test_anchors.py`: `ANCHORS` is the table above as `{relative_path: [heading, ...]}`. `test_skill_names_every_anchor` (each heading appears in `SKILL.md`). `test_anchors_exist_in_installed_superpowers`, skipped unless `upstream.superpowers_root(os.environ)` finds an install whose major is `7`: each heading is a whole line of the named upstream file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `sh tests/test_html_docs_skill.sh; sh tests/test_format_links.sh`
Expected: `FAIL:` lines (skill and link missing).

- [ ] **Step 3: Create the symlink**

Run: `ln -s ../../../../docs/spec-format.md plugins/superpowers-html/skills/html-docs/spec-format.md`

- [ ] **Step 4: Write `SKILL.md`**

Wording is the builder's (spec: "Left to the builder"); content is the Interfaces block above. Do not restate the format; point at `spec-format.md`.

- [ ] **Step 5: Run the full suite**

Run: `sh tests/run.sh`
Expected: all `PASS:` lines, both unittest runs `OK`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add plugins/superpowers-html/skills tests
git commit -m "feat(superpowers-html): html-docs skill overlays brainstorming, writing-plans and the plan executors"
```

---

## Open questions

- **Hook opt-out.** superpowers-jev has `SUPERPOWERS_JEV_HOOKS=off`; the spec gives superpowers-html no switch. Recommendation: none for 0.1.0 (disabling the plugin is the switch; YAGNI).
- **Where the version warning surfaces.** The spec puts the check in the skill ("warns once"). It could also go in the SessionStart note. Recommendation: skill only, as specced; the note stays static so it can never fail on a compat lookup.

## Self-review notes

- Spec coverage: supersonic 0.3.0 → Task 2; jev 0.7.0 → Task 1; hook, plugin, marketplace, manifests → Task 3; task-brief → Task 4; task-start → Task 5; html-docs, version check, symlink → Task 6; "symlink resolves" test → Tasks 2 and 6; "supercomposer names .html paths" → Task 2; task-brief found / not found / 6 vs 6b / markdown pass-through → Task 4; hook note and exit 0 on error → Task 3; jev builders on HTML fixtures → Task 1. Calls made without asking: operator plans HTML (Task 2 conditional line), own task-start (Task 5), no ticking (Task 6), structured sections to Jev (Task 1), 7.x check (Tasks 3, 6).
- Exit code 4 (unclosed section) is added beyond the spec's "2 usage, 3 not found", mirroring upstream's exit 4 for an unclosed fence.
