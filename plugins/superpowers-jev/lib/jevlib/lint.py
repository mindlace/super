"""Template lint (the meta-schema). A malformed template is a test failure, not a runtime path."""
import json
import re

from .combine import RULES
from .schema import KEYWORDS

TOP_KEYS = {"point", "version", "plugin", "anchor", "cookbook", "model", "state_schema",
            "questions", "combine", "compare", "on_skips", "claude_verdict_example", "notes"}
COMPARE_KINDS = {"verdict", "picks", "items", "coverage"}
PLUGINS = {"superpowers", "supersonic"}
QID_RE = re.compile(r"^[a-z][a-z_]*$")
POLARITIES = {"true_is_problem", "true_is_fact"}


def _schema_errors(schema, path):
    if not isinstance(schema, dict):
        return ["%s: schema must be an object" % path]
    errs = ["%s: unsupported schema keyword %r" % (path, k) for k in schema if k not in KEYWORDS]
    for name, sub in schema.get("properties", {}).items():
        errs += _schema_errors(sub, "%s.%s" % (path, name))
    if "items" in schema:
        errs += _schema_errors(schema["items"], path + "[]")
    return errs


def _lint_question(qid, q, props):
    p = "question %s" % qid
    errs = []
    if not QID_RE.match(qid):
        errs.append(p + ": id must match [a-z][a-z_]*")
    if q.get("type") not in ("noul", "choice", "score"):
        return errs + [p + ": type must be noul, choice, or score"]
    if not q.get("instructions"):
        errs.append(p + ": no instructions")
    text = json.dumps(q.get("instructions"))
    if "for_each" in q:
        if props.get(q["for_each"], {}).get("type") != "array":
            errs.append(p + ": for_each must name an array property of state_schema")
        if "{i}" not in text:
            errs.append(p + ": a for_each question must reference its item with {i}")
    elif "{i}" in text:
        errs.append(p + ": {i} used without for_each")
    if "only_if" in q:
        key = q["only_if"] if isinstance(q["only_if"], str) else q["only_if"].get("key")
        if key not in props:
            errs.append(p + ": only_if names unknown state key %r" % key)
    if q["type"] == "noul":
        if set(q.get("criteria") or {}) != {"true", "false"}:
            errs.append(p + ": a noul needs criteria with exactly true and false")
        if q.get("polarity") not in POLARITIES:
            errs.append(p + ": a noul needs polarity true_is_problem or true_is_fact")
    elif q["type"] == "choice":
        keys = list(q.get("criteria") or {})
        if not keys:
            errs.append(p + ": a choice needs criteria")
        elif keys[0] != q.get("conservative"):
            errs.append(p + ": first option must be the declared conservative option %r"
                        % q.get("conservative"))
        if q.get("no_match") not in keys:
            errs.append(p + ": a choice must include its no_match option in its fixed criteria")
        if len(keys) > 255:
            errs.append(p + ": more than 255 options")
        dyn = q.get("options_from_state")
        if dyn and props.get(dyn.get("path"), {}).get("type") != "array":
            errs.append(p + ": options_from_state.path must name an array property")
    else:
        crit = q.get("criteria")
        if not isinstance(crit, list) or not 2 <= len(crit) <= 10:
            errs.append(p + ": a score needs 2-10 levels")
    return errs


def _lint_combine(t):
    c, qs = t["combine"], t["questions"]
    rule = c.get("rule")
    if rule not in RULES:
        return ["combine: unknown rule %r" % rule]
    errs = []
    if "threshold" in c and not 0.5 <= c["threshold"] <= 1:
        errs.append("combine: threshold must be within [0.5, 1]")
    if rule == "any_true_over":
        for qid, q in qs.items():
            if q["type"] == "noul" and q.get("polarity") != "true_is_problem":
                errs.append("any_true_over: %s must be phrased so true = something is wrong" % qid)
    if rule == "all_true_over":
        for base in c.get("thresholds", {}):
            if qs.get(base, {}).get("type") != "noul":
                errs.append("all_true_over: %s is not a noul question" % base)
    if rule in ("per_item_pick", "items_true_over"):
        q = qs.get(c.get("question"), {})
        if "for_each" not in q:
            errs.append("%s: question must be a for_each question" % rule)
        if rule == "per_item_pick" and q.get("type") == "score" and "score_levels" not in c:
            errs.append("per_item_pick: a score question needs score_levels")
    if rule in ("pick_if_confident", "gated_pick"):
        choice_opts = set()
        for q in qs.values():
            if q["type"] == "choice":
                choice_opts |= set(q.get("criteria") or {})
        for ex in c.get("exclude", []):
            if ex not in choice_opts:
                errs.append("combine: exclude option %r is not a fixed choice option" % ex)
        order = c.get("order", [])
        for qid, floors in c.get("floors", {}).items():
            crit = qs.get(qid, {}).get("criteria") or {}
            for o in order:
                if o not in crit:
                    errs.append("combine: order option %r missing from %s" % (o, qid))
            for f in floors:
                if f.get("min") not in order:
                    errs.append("combine: floor min %r not in order" % f.get("min"))
    if rule == "gated_pick":
        for base in c["gate"]["questions"]:
            if qs.get(base, {}).get("type") != "noul":
                errs.append("gated_pick: gate question %s must be a noul" % base)
        if "for_each" not in qs.get(c["fits"]["question"], {}):
            errs.append("gated_pick: fits question must be a for_each noul")
    return errs


def lint_template(t, stem):
    missing = TOP_KEYS - set(t)
    if missing:
        return ["missing keys: %s" % sorted(missing)]
    errs = ["unknown key %r" % k for k in sorted(set(t) - TOP_KEYS)]
    if t["point"] != stem:
        errs.append("point %r must equal file name %r" % (t["point"], stem))
    if not isinstance(t["version"], int) or isinstance(t["version"], bool) or t["version"] < 1:
        errs.append("version must be an integer >= 1")
    if t["plugin"] not in PLUGINS:
        errs.append("plugin must be one of %s" % sorted(PLUGINS))
    for key in ("anchor", "cookbook", "model"):
        if not isinstance(t[key], str) or not t[key].strip():
            errs.append("%s must be a non-empty string" % key)
    s = t["state_schema"]
    if not isinstance(s, dict) or s.get("type") != "object" or s.get("additionalProperties") is not False:
        errs.append("state_schema must be a closed object (additionalProperties: false)")
    else:
        errs += _schema_errors(s, "state_schema")
    props = s.get("properties", {}) if isinstance(s, dict) else {}
    if not t["questions"]:
        errs.append("no questions")
    for qid, q in t["questions"].items():
        errs += _lint_question(qid, q, props)
    if not errs:
        errs += _lint_combine(t)
    if t["compare"] not in COMPARE_KINDS:
        errs.append("compare must be one of %s" % sorted(COMPARE_KINDS))
    if t["on_skips"] is not None and set(t["on_skips"]) != {"verdict", "dispatch"}:
        errs.append("on_skips must be null or {verdict, dispatch}")
    return errs
