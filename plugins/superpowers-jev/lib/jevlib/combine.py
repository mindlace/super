"""Combination rules: code, not model.

Jev answers narrow questions; these functions decide. Jev never counts or does
arithmetic. Noul thresholds are on P(yes); Choice/Score `confidence` is the API's
distribution-concentration statistic.

Every rule returns {"verdict": ..., "confident": bool, "items"?: [...], "detail": {...}}.
"""


def _noul(answer):
    return float(answer["noul"])


def _conf(answer):
    return float(answer.get("confidence", 0.0))


def _max_noul(base, answers, index):
    ps = [_noul(a) for q, a in answers.items()
          if index[q]["base"] == base and a.get("type") == "noul"]
    return max(ps) if ps else None


def cond_true(cond, answers, index, state, missing):
    """A floor/override condition. `missing` is the value when its evidence is absent:
    floors pass missing=True (fail safe: the floor applies), overrides pass False."""
    if "noul" in cond:
        p = _max_noul(cond["noul"], answers, index)
        return missing if p is None else p >= cond["over"]
    value = state.get(cond["state"])
    if "over" in cond:
        return missing if value is None else value > cond["over"]
    if "is" in cond:
        return value == cond["is"]
    if "not" in cond:
        return value != cond["not"]
    return missing


def any_true_over(params, answers, index, state):
    """SDE-cascade max gate: hit if any Noul's P(yes) >= its threshold."""
    thresholds = params.get("thresholds", {})
    fired, confident, seen = [], True, 0
    for qid, a in answers.items():
        if a.get("type") != "noul":
            continue
        seen += 1
        t = thresholds.get(index[qid]["base"], params["threshold"])
        p = _noul(a)
        if p >= t:
            fired.append(qid)
        elif p > 1 - t:
            confident = False
    if fired:
        return {"verdict": params["hit"], "confident": True, "detail": {"fired": sorted(fired)}}
    # No Noul answered (all skipped, or none returned): a miss is not evidence of clean.
    confident = confident and seen > 0
    return {"verdict": params["miss"], "confident": confident, "detail": {"fired": []}}


def all_true_over(params, answers, index, state):
    """Hit only if every listed Noul is over its own threshold (verify-stop)."""
    over, confident_no = [], False
    for base, t in params["thresholds"].items():
        p = _max_noul(base, answers, index)
        if p is None:
            return {"verdict": params["miss"], "confident": False,
                    "detail": {"over": over, "missing": base}}
        if p >= t:
            over.append(base)
        elif p <= 1 - t:
            confident_no = True
    if len(over) == len(params["thresholds"]):
        return {"verdict": params["hit"], "confident": True, "detail": {"over": over}}
    return {"verdict": params["miss"], "confident": confident_no, "detail": {"over": over}}


def _apply_floors(pick, order, floors, answers, index, state):
    for floor in floors:
        conds = floor.get("when")
        applies = conds is None or any(cond_true(c, answers, index, state, missing=True)
                                       for c in conds)
        if applies and pick in order and order.index(pick) > order.index(floor["min"]):
            pick = floor["min"]
    return pick


def pick_if_confident(params, answers, index, state):
    """Per non-item Choice: the pick if confidence >= threshold and not excluded, else None.
    `order` (most capable first) + `floors` raise a pick to a minimum; `overrides`
    force a pick from state facts that code, not Jev, can count."""
    picks, choices, confidences, confident_keys, detail = {}, {}, {}, {}, {}
    for qid, a in answers.items():
        if a.get("type") != "choice" or index[qid]["item"] is not None:
            continue
        choice, conf = a["choice"], _conf(a)
        choices[qid], confidences[qid] = choice, conf
        confident_keys[qid] = conf >= params["threshold"]
        pick = choice if confident_keys[qid] and choice not in params.get("exclude", []) else None
        if pick is not None and qid in params.get("floors", {}):
            floored = _apply_floors(pick, params["order"], params["floors"][qid],
                                    answers, index, state)
            if floored != pick:
                detail.setdefault("floored", {})[qid] = [pick, floored]
                pick = floored
        picks[qid] = pick
    for ov in params.get("overrides", []):
        if any(cond_true(c, answers, index, state, missing=False) for c in ov["when"]):
            picks[ov["question"]] = ov["pick"]
            detail.setdefault("overridden", []).append(ov["question"])
    detail.update(choices=choices, confidences=confidences, confident_keys=confident_keys)
    confident = bool(confident_keys) and all(confident_keys.values())
    return {"verdict": picks, "confident": confident, "detail": detail}


def gated_pick(params, answers, index, state):
    """Skill-suggestion cookbook in one request: a Choice over the roster, a mean
    'does this need a skill at all' gate over Nouls, and a per-candidate 'fits' Noul
    that must clear `fits.min` for the picked candidate."""
    result = pick_if_confident(params, answers, index, state)
    gate = params["gate"]
    oriented = []
    for base in gate["questions"]:
        p = _max_noul(base, answers, index)
        if p is not None:
            oriented.append(1.0 - p if base in gate.get("inverted", []) else p)
    gate_mean = sum(oriented) / len(oriented) if oriented else 0.0
    fits = params["fits"]
    q = params["question"]
    pick = result["verdict"].get(q)
    fit_p = None
    if pick is not None:
        names = [row.get(fits["key"]) for row in state.get(fits["state_path"], [])]
        if pick in names:
            qid = "%s.%d" % (fits["question"], names.index(pick))
            fit_p = _noul(answers[qid]) if qid in answers else None
        if gate_mean < gate["min_mean"] or fit_p is None or fit_p < fits["min"]:
            result["verdict"][q] = None
    result["detail"].update(gate_mean=gate_mean, fit=fit_p)
    return result


def _item_pick(answer, params):
    if answer.get("type") == "score":
        probs = answer.get("probabilities") or {}
        if probs:
            level = max(probs, key=lambda k: float(probs[k]))   # most likely level, as confidence uses
        else:
            level = int(float(answer["score"]) + 0.5)
        levels = params["score_levels"]
        return levels[min(len(levels) - 1, max(0, int(level)))]
    return answer["choice"]


def per_item_pick(params, answers, index, state):
    """Per-item Choice/Score (one question per state item, citation-check style).

    escalate_if: hit when any item picks one of `options` at >= `threshold`
                 (plus every entry of state[also_flag], flagged deterministically).
    compare_to:  'contested' when a confident item differs from state[path][i][field]
                 by >= min_distance levels in `order`.
    """
    items = []
    for qid, a in answers.items():
        meta = index[qid]
        if meta["base"] != params["question"] or meta["item"] is None:
            continue
        conf = _conf(a)
        items.append({"index": meta["item"], "pick": _item_pick(a, params), "confidence": conf,
                      "confident": conf >= params["threshold"]})
    items.sort(key=lambda it: it["index"])
    confident = bool(items) and all(it["confident"] for it in items)
    verdict, detail = [it["pick"] for it in items], {}
    esc = params.get("escalate_if")
    if esc:
        flagged = [it["index"] for it in items
                   if it["pick"] in esc["options"] and it["confidence"] >= esc["threshold"]]
        also = list(state.get(params["also_flag"], [])) if params.get("also_flag") else []
        verdict = esc["hit"] if (flagged or also) else esc["miss"]
        detail.update(flagged=flagged, also_flagged=also)
        if flagged or also:
            confident = True
    cmp_ = params.get("compare_to")
    if cmp_:
        rows, order = state.get(cmp_["state_path"], []), cmp_["order"]
        contested = []
        for it in items:
            other = rows[it["index"]].get(cmp_["field"]) if it["index"] < len(rows) else None
            if (it["confident"] and other in order and it["pick"] in order
                    and abs(order.index(it["pick"]) - order.index(other))
                    >= cmp_.get("min_distance", 1)):
                contested.append(it["index"])
        verdict = "contested" if contested else "agree"
        detail["contested"] = contested
    return {"verdict": verdict, "confident": confident, "items": items, "detail": detail}


def items_true_over(params, answers, index, state):
    """Rerank-style per-item Noul: the item indices whose P(yes) >= threshold.
    An item is uncertain when |2p - 1| < min_confidence."""
    t, floor = params["threshold"], params.get("min_confidence", 0.6)
    carried, uncertain = [], []
    for qid, a in answers.items():
        meta = index[qid]
        if meta["base"] != params["question"] or meta["item"] is None:
            continue
        p = _noul(a)
        if p >= t:
            carried.append(meta["item"])
        if abs(2 * p - 1) < floor:
            uncertain.append(meta["item"])
    return {"verdict": sorted(carried), "confident": not uncertain,
            "detail": {"uncertain": sorted(uncertain)}}


def count_exactly_one(carrier_lists, n_items):
    """Across several per-spec item lists: which items have 0 or >= 2 carriers."""
    counts = [0] * n_items
    for carried in carrier_lists:
        for i in set(carried):
            if 0 <= i < n_items:
                counts[i] += 1
    return {"uncovered": [i for i, c in enumerate(counts) if c == 0],
            "multiply_covered": [i for i, c in enumerate(counts) if c >= 2],
            "counts": counts}


RULES = {
    "any_true_over": any_true_over,
    "all_true_over": all_true_over,
    "pick_if_confident": pick_if_confident,
    "gated_pick": gated_pick,
    "per_item_pick": per_item_pick,
    "items_true_over": items_true_over,
}


def apply(template, answers, index, state):
    params = dict(template["combine"])
    rule = RULES[params.pop("rule")]
    known = {q: a for q, a in answers.items() if q in index}
    return rule(params, known, index, state)
