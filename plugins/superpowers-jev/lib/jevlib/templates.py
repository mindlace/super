"""Load question templates and expand them into one TypeSafe System One request."""
import json
import re
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parents[2]
POINT_RE = re.compile(r"^[a-z][a-z0-9-]*$")
STATE_TOKEN_LIMIT = 28000      # spec: refuse state > 28k tokens (chars/4)
REQUEST_TOKEN_LIMIT = 60000    # API: 64k per request; keep headroom
LABEL_CHARS = 80               # item labels in `ask` output: enough to align, cheap to carry
MAX_CHOICE_OPTIONS = 255       # API: at most 255 Choice options
TEMPLATE_ONLY_KEYS = ("for_each", "only_if", "options_from_state", "conservative",
                      "no_match", "polarity")


class TemplateError(Exception):
    pass


def questions_dir(env):
    return Path(env.get("JEV_QUESTIONS_DIR") or PLUGIN_ROOT / "questions")


def load_template(point, env):
    if not POINT_RE.match(point or ""):
        raise TemplateError("bad point name %r" % point)
    path = questions_dir(env) / (point + ".json")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise TemplateError("cannot load template %s: %s" % (path, exc))


def estimate_tokens(obj):
    """The spec's estimate: characters / 4. Never a tokenizer."""
    text = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    return len(text) // 4


def condition_holds(cond, state):
    """`only_if`: a state key that must be truthy, or {"key": k, "equals": v}."""
    if isinstance(cond, str):
        return bool(state.get(cond))
    return state.get(cond["key"]) == cond["equals"]


def _fill(value, i):
    if isinstance(value, str):
        return value.replace("{i}", str(i))
    if isinstance(value, list):
        return [_fill(v, i) for v in value]
    if isinstance(value, dict):
        return {k: _fill(v, i) for k, v in value.items()}
    return value


def choice_criteria(q, state):
    """Fixed options first (conservative first, per the template), then options from state."""
    criteria = dict(q["criteria"])
    dyn = q.get("options_from_state")
    if dyn:
        for entry in state.get(dyn["path"], []):
            if isinstance(entry, str):
                name, desc = entry, None
            else:
                name, desc = entry[dyn["key"]], entry.get(dyn.get("description", ""))
            if name not in criteria:
                criteria[name] = desc
    if len(criteria) > MAX_CHOICE_OPTIONS:
        raise TemplateError("%d options exceed the %d-option Choice limit"
                            % (len(criteria), MAX_CHOICE_OPTIONS))
    return criteria


def _api_question(q, state, i=None):
    out = {k: v for k, v in q.items() if k not in TEMPLATE_ONLY_KEYS}
    if q["type"] == "choice":
        out["criteria"] = choice_criteria(q, state)
    if i is not None:
        out["instructions"] = _fill(out["instructions"], i)
        if q["type"] == "noul":
            out["criteria"] = _fill(out["criteria"], i)
    return out


def expand_questions(template, state):
    """Return (questions, index); index[qid] = {"base": template question id, "item": int|None}.

    A `for_each` question becomes one API question per state item, keyed `<base>.<i>`,
    with `{i}` in its instructions replaced by the item index. All of a point's
    questions go out in one request over the same state.
    """
    questions, index = {}, {}
    for base, q in template["questions"].items():
        if "only_if" in q and not condition_holds(q["only_if"], state):
            continue
        if "for_each" in q:
            for i in range(len(state.get(q["for_each"], []))):
                qid = "%s.%d" % (base, i)
                questions[qid] = _api_question(q, state, i)
                index[qid] = {"base": base, "item": i}
        else:
            questions[base] = _api_question(q, state)
            index[base] = {"base": base, "item": None}
    return questions, index


def build_request(template, state):
    questions, index = expand_questions(template, state)
    payload = {"state": state, "model": template.get("model", "jev-latest"),
               "questions": questions}
    return payload, index


def item_labels(template, state):
    """Short labels for a per-item point's state items, in state order (None if undeclared).

    `item_label` = {"path": <array in state>, "field": <item property>}; `field` is omitted
    when the items are strings. Callers that filter or reorder their own list before asking
    use these to align each recorded verdict with the item it belongs to.
    """
    spec = template.get("item_label")
    if not spec:
        return None
    labels = []
    for item in state.get(spec["path"]) or []:
        text = item.get(spec["field"]) if spec.get("field") and isinstance(item, dict) else item
        labels.append(" ".join(str(text or "").split())[:LABEL_CHARS])
    return labels
