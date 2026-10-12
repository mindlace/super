import json
import unittest

import support
from jevlib import cli, log, report


def call(cid, point, compare, verdict, confident=True, ts="2026-10-11T10:00:00", **kw):
    e = {"type": "call", "call_id": cid, "point": point, "compare": compare, "verdict": verdict,
         "confident": confident, "ts": ts, "on_skips": kw.pop("on_skips", None)}
    e.update(kw)
    return e


def rec(cid, verdict):
    return {"type": "record", "call_id": cid, "claude_verdict": verdict}


class ReportMathTest(unittest.TestCase):
    def test_verdict_agreement_and_confident_wrong(self):
        rows = report.build_report([
            call("a", "report-evidence", "verdict", "complete"),
            call("b", "report-evidence", "verdict", "missing_evidence"),
            call("c", "report-evidence", "verdict", "complete", confident=False),
            rec("a", {"verdict": "complete"}),
            rec("b", {"verdict": "complete"}),
            rec("c", {"verdict": "missing_evidence"}),
        ])["report-evidence"]
        r = rows
        self.assertEqual(r["units"], 3)
        self.assertEqual(r["agree"], 1)
        self.assertAlmostEqual(r["agreement"], 1 / 3)
        self.assertEqual((r["confident_units"], r["confident_wrong"]), (2, 1))
        self.assertAlmostEqual(r["confident_wrong_rate"], 0.5)

    def test_items_units_and_would_skip(self):
        skip = {"verdict": "return_to_implementer", "dispatch": "scoped re-reviewer"}
        items = [{"index": 0, "pick": "not_addressed", "confident": True},
                 {"index": 1, "pick": "addressed", "confident": False}]
        rows = report.build_report([
            call("a", "re-review", "items", "return_to_implementer", items=items, on_skips=skip),
            rec("a", {"items": ["not_addressed", "not_addressed"]}),
            call("b", "re-review", "items", "dispatch_rereview", items=[], on_skips=skip),
        ])["re-review"]
        self.assertEqual((rows["units"], rows["agree"]), (2, 1))
        self.assertEqual((rows["confident_units"], rows["confident_wrong"]), (1, 0))
        self.assertEqual(rows["would_skip"], 1)
        self.assertEqual(rows["unrecorded"], ["b"])

    def test_picks_compare_raw_choice(self):
        detail = {"choices": {"skill": "none"}, "confident_keys": {"skill": True}}
        rows = report.build_report([
            call("a", "prompt-route", "picks", {"skill": None}, detail=detail),
            rec("a", {"picks": {"skill": "none"}}),
        ])["prompt-route"]
        self.assertEqual((rows["units"], rows["agree"]), (1, 1))

    def test_coverage_units(self):
        rows = report.build_report([
            call("a", "fidelity-coverage", "coverage", {"uncovered": [2], "multiply_covered": [0]},
                 detail={"n_requirements": 3}),
            rec("a", {"uncovered": [2], "multiply_covered": []}),
        ])["fidelity-coverage"]
        self.assertEqual((rows["units"], rows["agree"]), (3, 2))

    def test_errors_counted_not_compared_and_latest_record_wins(self):
        rows = report.build_report([
            call("a", "tier", "picks", None, error="jev unavailable: http 500"),
            call("b", "tier", "picks", {"implementer": "cheap"},
                 detail={"choices": {"implementer": "cheap"}, "confident_keys": {"implementer": True}}),
            rec("b", {"picks": {"implementer": "standard"}}),
            rec("b", {"picks": {"implementer": "cheap"}}),
        ])["tier"]
        self.assertEqual((rows["calls"], rows["errors"], rows["agree"]), (2, 1, 1))

    def test_since_and_point_filters(self):
        entries = [call("a", "tier", "picks", {}, ts="2026-10-01T00:00:00"),
                   call("b", "tier", "picks", {}, ts="2026-10-11T00:00:00"),
                   call("c", "severity", "items", "agree")]
        self.assertEqual(report.build_report(entries, since="2026-10-05")["tier"]["calls"], 1)
        self.assertEqual(list(report.build_report(entries, point="severity")), ["severity"])

    def test_format_has_header_and_dash_for_no_data(self):
        text = report.format_report(report.build_report([call("a", "tier", "picks", {})]))
        self.assertIn("would-skip", text.splitlines()[0])
        self.assertIn(" - ", text)


class RecordCliTest(unittest.TestCase):
    def test_record_appends_and_report_reads_it(self):
        env = support.make_env()
        log.append(call("x1", "re-review", "items", "dispatch_rereview",
                        items=[{"index": 0, "pick": "addressed", "confident": True}]), env)
        self.assertEqual(cli.main(["record", "x1", '{"items": ["addressed"]}'], env), 0)
        rows = report.build_report(log.read_entries(env))
        self.assertEqual(rows["re-review"]["agree"], 1)

    def test_record_rejects_non_object(self):
        env = support.make_env()
        self.assertEqual(cli.main(["record", "x1", '["addressed"]'], env), 2)
        self.assertEqual(cli.main(["record", "x1", "not json"], env), 2)


if __name__ == "__main__":
    unittest.main()
