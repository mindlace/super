import contextlib
import io
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

    def test_picks_also_score_the_acted_on_verdict(self):
        gated = {"choices": {"skill": "superpowers:systematic-debugging"}, "confident_keys": {"skill": True}}
        floored = {"choices": {"implementer": "cheap"}, "confident_keys": {"implementer": True}}
        entries = [
            # prompt-route: the gate suppressed the pick (verdict None), Claude used no skill.
            call("g1", "prompt-route", "picks", {"skill": None}, detail=gated),
            rec("g1", {"picks": {"skill": "none"}}),
            # gated and Claude did use the skill: Jev abstained, so nothing to score as acted.
            call("g2", "prompt-route", "picks", {"skill": None}, detail=gated),
            rec("g2", {"picks": {"skill": "superpowers:systematic-debugging"}}),
            # tier: the floor raised the raw choice, and the acted-on verdict is the right one.
            call("f1", "tier", "picks", {"implementer": "standard"},
                 detail=dict(floored, floored={"implementer": ["cheap", "standard"]})),
            rec("f1", {"picks": {"implementer": "standard"}}),
        ]
        rows = report.build_report(entries)
        g, f = rows["prompt-route"], rows["tier"]
        self.assertEqual((g["units"], g["agree"]), (2, 1))              # raw: g1 wrong, g2 right
        self.assertEqual((g["acted_units"], g["acted_agree"], g["abstained"]), (1, 1, 1))
        self.assertEqual((f["units"], f["agree"]), (1, 0))              # raw choice was below the floor
        self.assertEqual((f["acted_units"], f["acted_agree"], f["abstained"]), (1, 1, 0))
        self.assertAlmostEqual(f["acted_agreement"], 1.0)
        self.assertIn("acted", report.format_report(rows).splitlines()[0])

    def test_non_picks_kinds_act_on_their_raw_value(self):
        rows = report.build_report([
            call("a", "report-evidence", "verdict", "complete"), rec("a", {"verdict": "complete"}),
        ])["report-evidence"]
        self.assertEqual((rows["acted_units"], rows["acted_agree"]), (1, 1))

    def test_units_tolerate_missing_detail_and_item_fields(self):
        self.assertEqual(report.units(call("a", "tier", "picks", {}, detail=None), {"picks": {"x": "y"}}),
                         [(None, None, "y", False)])
        self.assertEqual(report.units(call("b", "re-review", "items", "x", items=[{"index": 0}]),
                                      {"items": ["addressed"]}), [(None, None, "addressed", False)])

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

    def test_conf_wrong_scores_acted_pick(self):
        detail = {"choices": {"implementer": "standard"}, "confident_keys": {"implementer": True}}
        r = report.build_report([
            call("a", "tier", "picks", {"implementer": "capable"}, detail=detail),
            rec("a", {"picks": {"implementer": "capable"}}),
        ])["tier"]
        self.assertEqual((r["confident_wrong"], r["confident_units"], r["agree"]), (0, 1, 0))

    def test_conf_wrong_counts_acted_mismatch(self):
        detail = {"choices": {"implementer": "cheap"}, "confident_keys": {"implementer": True}}
        r = report.build_report([
            call("a", "tier", "picks", {"implementer": "standard"}, detail=detail),
            rec("a", {"picks": {"implementer": "capable"}}),
        ])["tier"]
        self.assertEqual((r["confident_wrong"], r["confident_units"]), (1, 1))

    def test_gated_none_matches_claude_none(self):
        detail = {"choices": {"skill": "superpowers:x"}, "confident_keys": {"skill": True}}
        r = report.build_report([
            call("a", "prompt-route", "picks", {"skill": None}, detail=detail),
            rec("a", {"picks": {"skill": "none"}}),
        ])["prompt-route"]
        self.assertEqual((r["acted_agree"], r["confident_wrong"]), (1, 0))

    def test_abstain_not_conf_wrong(self):
        detail = {"choices": {"implementer": "cheap"}, "confident_keys": {"implementer": True}}
        r = report.build_report([
            call("a", "tier", "picks", {"implementer": None}, detail=detail),
            rec("a", {"picks": {"implementer": "capable"}}),
        ])["tier"]
        self.assertEqual((r["abstained"], r["confident_units"]), (1, 0))

    def test_verdict_points_unchanged(self):
        r = report.build_report([
            call("a", "verify-stop", "verdict", "block"), rec("a", {"verdict": "allow"}),
        ])["verify-stop"]
        self.assertEqual((r["agreement"], r["acted_agreement"], r["confident_wrong"]), (0, 0, 1))

    def test_format_column_order(self):
        header = report.format_report(report.build_report([call("a", "tier", "picks", {})]))
        self.assertEqual(header.splitlines()[0].split()[:8],
                         ["point", "calls", "err", "rec", "acted-agreement", "conf-wrong",
                          "abstain", "raw-agreement"])

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
        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(cli.main(["record", "x1", '["addressed"]'], env), 2)
            self.assertEqual(cli.main(["record", "x1", "not json"], env), 2)
        self.assertIn("jev record:", err.getvalue())

    def test_record_for_unknown_call_id_warns_but_exits_zero(self):
        env = support.make_env()
        log.append(call("known", "tier", "picks", {}), env)
        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(cli.main(["record", "nope", '{"verdict": "x"}'], env), 0)
            self.assertEqual(cli.main(["record", "known", '{"picks": {}}'], env), 0)
        self.assertEqual(err.getvalue().count("unknown call_id"), 1)
        self.assertIn("nope", err.getvalue())
        self.assertEqual(len([e for e in log.read_entries(env) if e["type"] == "record"]), 2)

    def test_report_tolerates_retired_point(self):
        env = support.make_env()
        entries = [
            call("old", "operator-tier", "picks", {"tier": "capable"},
                 detail={"choices": {"tier": "standard"}}),
            rec("old", {"picks": {"tier": "capable"}}),
        ]
        rows = report.build_report(entries)
        self.assertIn("operator-tier", rows)
        self.assertEqual(rows["operator-tier"]["recorded"], 1)
        self.assertIn("operator-tier", report.format_report(rows))


if __name__ == "__main__":
    unittest.main()
