import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import support
from jevlib import cli, ctx, log, schema, state
from jevlib.builders import cite, htmldoc, ledger, spec

FX = support.FIXTURES


class CiteTest(unittest.TestCase):
    def test_extract_claim_forms(self):
        claims = cite.extract_claims((FX / "survey-report.md").read_text())
        self.assertEqual([(c["file"], c["line"], c["end"]) for c in claims],
                         [("cited.py", 8, 8), ("cited.py", 4, 5), ("missing.py", 3, 3), ("cited.py", 400, 400)])

    def test_state_sections_and_unreadable(self):
        s = cite.build_state((FX / "survey-report.md").read_text(), FX)
        self.assertEqual(len(s["claims"]), 2)
        first = s["claims"][0]
        self.assertIn("returns {} for an empty file", first["claim"])
        self.assertTrue(first["section"].startswith("3: "))   # 8 - 5
        self.assertIn("8:     if not text:", first["section"])
        self.assertEqual([u["why"] for u in s["unreadable"]], ["file not found", "line out of range"])

    def test_no_claims(self):
        self.assertEqual(cite.build_state("nothing cited here", FX), {"claims": [], "unreadable": []})


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

    def test_markdown_table_starting_with_separator_has_empty_header(self):
        got = spec.md_sections("# T\n## A\n| --- |\n")
        self.assertEqual(got[1]["tables"][0]["header"], [])

    def test_html_table_without_thead_takes_leading_th_row_as_header(self):
        got = htmldoc.sections('<article><section id="a"><h2>A</h2><table><tr><th>Claim</th></tr>'
                               '<tr><td>A</td></tr></table></section></article>')
        t = got[0]["tables"][0] if got[0].get("tables") else got[1]["tables"][0]
        self.assertEqual((t["header"], t["rows"]), (["Claim"], [["A"]]))

    def test_br_and_hr_break_lines_in_both_forms(self):
        for br, hr in (("<br>", "<hr>"), ("<br/>", "<hr/>")):
            got = htmldoc.sections('<article><section id="a"><h2>A</h2><p>one%stwo</p><p>x%sy</p></section></article>'
                                   % (br, hr))
            self.assertEqual(got[0]["text"], "one\ntwo\nx\ny", br)

    def test_spec_summary_goal_breaks_at_br(self):
        p = Path(tempfile.mkdtemp()) / "g.html"
        p.write_text('<article><header><h1>T</h1></header><section id="g"><h2>Goal</h2>'
                     '<p>one<br>two</p></section></article>', encoding="utf-8")
        self.assertEqual(ledger.spec_summary(p), "T: one two")

    def test_title(self):
        self.assertEqual(htmldoc.title((FX / "spec-a.html").read_text()), "Auth spec")
        self.assertIsNone(htmldoc.title("<p>x</p>"))

    def test_both_formats_validate_against_the_template(self):
        t = support.template("fidelity-coverage")
        self.assertEqual(t["version"], 2)
        for p in ("spec-a.md", "spec-a.html", "spec-b.md", "spec-b.html"):
            state = {"requirements": ["r"], "spec_sections": spec.spec_sections(FX / p)}
            self.assertEqual(schema.validate(t["state_schema"], state), [], p)


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.text = (FX / "ledger.md").read_text()

    def test_defect_classes_from_tally_then_tags(self):
        self.assertEqual(ledger.defect_classes(self.text),
                         ["missing-declaration", "unmodeled-consumer", "schema-drift"])

    def test_spec_summary_html(self):
        self.assertEqual(ledger.spec_summary(FX / "spec-a.html"),
                         "Auth spec: Validate session tokens in middleware for every route.")

    def test_spec_summary_html_without_h1_reports(self):
        p = Path(tempfile.mkdtemp()) / "s.html"
        p.write_text('<article><p>x</p></article>', encoding="utf-8")
        self.assertEqual(ledger.spec_summary(p), "%s (no h1)" % p)

    def test_live_operators_are_dispatched_only_with_spec_summaries(self):
        ops = ledger.live_operators(self.text, FX)
        self.assertEqual([o["slug"] for o in ops], ["auth", "billing"])
        self.assertEqual(ops[0]["summary"], "Auth spec: Validate session tokens in middleware for every route.")


class SpecTest(unittest.TestCase):
    def test_spec_state_command_removed(self):
        with self.assertRaises(SystemExit) as cm:
            cli.main(["spec-state", "x"])
        self.assertEqual(cm.exception.code, 2)

    def test_traceability_requirements(self):
        self.assertEqual(spec.traceability_requirements((FX / "design.md").read_text()),
                         ["Tokens are validated by middleware", "Prices are integer cents",
                          "Search reads the product index"])

    def test_coverage_counts_carriers_across_specs_and_logs_once(self):
        carried = {"spec-a.md": [0], "spec-b.md": [0, 1]}

        def fake_ask(point, state, env, call_id=None, cwd=None, write_log=True):
            self.assertEqual(point, "fidelity-coverage")
            self.assertFalse(write_log)
            name = "spec-a.md" if state["spec_sections"][0]["heading"] == "Auth spec" else "spec-b.md"
            return {"enabled": True, "verdict": carried[name], "confident": True, "raw": {},
                    "template_version": 2}

        env = support.make_env()
        out = spec.coverage(FX / "design.md", [FX / "spec-a.md", FX / "spec-b.md"], env,
                            call_id="cov-1", ask_fn=fake_ask)
        self.assertEqual(out["verdict"], {"uncovered": [2], "multiply_covered": [0]})
        self.assertEqual([t["index"] for t in out["targets"]], [0, 2])
        entries = log.read_entries(env)
        self.assertEqual(len(entries), 1)
        self.assertEqual((entries[0]["call_id"], entries[0]["compare"]), ("cov-1", "coverage"))
        st = state.load("cov-1", env)
        self.assertEqual(st["requirements"], spec.traceability_requirements((FX / "design.md").read_text()))
        self.assertEqual(set(st["specs"]), {str(FX / "spec-a.md"), str(FX / "spec-b.md")})
        d = log.log_dir(env)
        a = state.read_blob(st["specs"][str(FX / "spec-a.md")], d)
        self.assertEqual(a, {"requirements": st["requirements"],
                             "spec_sections": spec.spec_sections(FX / "spec-a.md")})
        self.assertEqual(a["spec_sections"][0]["heading"], "Auth spec")
        self.assertEqual(set(entries[0]["ctx"]), set(ctx.CTX_KEYS))

    def test_coverage_big_specs_rebuild_exactly(self):
        tmp = Path(tempfile.mkdtemp())
        paths = []
        for i in range(3):
            p = tmp / ("big%d.md" % i)
            p.write_text("# Big %d\n" % i + ("x" * 150000), encoding="utf-8")
            paths.append(p)
        env = support.make_env()
        spec.coverage(FX / "design.md", paths, env, call_id="cov-big",
                      ask_fn=lambda *a, **k: {"enabled": True, "verdict": [0], "confident": True,
                                              "raw": {}, "template_version": 2})
        st = state.load("cov-big", env)
        d = log.log_dir(env)
        for p in paths:
            self.assertEqual(state.read_blob(st["specs"][str(p)], d),
                             {"requirements": st["requirements"],
                              "spec_sections": spec.spec_sections(p)})

    def test_html_traceability_skips_earlier_tables(self):
        self.assertEqual(spec.requirements(FX / "design.html"),
                         spec.traceability_requirements((FX / "design.md").read_text()))

    def test_html_traceability_by_section_heading(self):
        html = ('<article><section id="s"><h2>Traceability</h2><table id="t"><caption>Claims</caption>'
                '<thead><tr><th scope="col">Claim</th></tr></thead><tbody><tr><td>A</td></tr></tbody>'
                '</table></section></article>')
        self.assertEqual(spec.html_traceability_requirements(html), ["A"])

    def test_html_traceability_without_thead_skips_th_header_row(self):
        html = ('<article><section id="s"><h2>Traceability</h2><table id="t"><caption>Claims</caption>'
                '<tr><th scope="col">Claim</th></tr><tr><td>A</td></tr></table></section></article>')
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

    def test_coverage_fails_open_when_any_spec_ask_is_disabled(self):
        env = support.make_env()
        out = spec.coverage(FX / "design.md", [FX / "spec-a.md"], env,
                            ask_fn=lambda *a, **k: {"enabled": False, "reason": "jev unavailable: http 529"})
        self.assertFalse(out["enabled"])
        self.assertIn("http 529", out["reason"])

    def test_coverage_mode_off(self):
        env = support.make_env(SUPERPOWERS_JEV="off")
        self.assertEqual(spec.coverage(FX / "design.md", [FX / "spec-a.md"], env)["reason"], "mode off")


class BuilderCliTest(unittest.TestCase):
    def test_cite_spec_ledger_registered(self):
        def run(*args):
            p = subprocess.run([str(support.JEV)] + list(args), capture_output=True, text=True, timeout=20)
            self.assertEqual(p.returncode, 0, p.stderr)
            return json.loads(p.stdout)
        self.assertEqual(len(run("cite", str(FX / "survey-report.md"), "--root", str(FX))["claims"]), 2)
        self.assertEqual(len(run("defect-state", "--ledger", str(FX / "ledger.md"),
                                 "--escalation", str(FX / "spec-a.md"))["classes"]), 3)


if __name__ == "__main__":
    unittest.main()
