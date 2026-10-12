"""`jev ask`: validate → size-check → call Jev → combine in code → log. Fails open, always."""
import secrets
import time

from . import client, combine, log, schema, templates
from .mode import resolve_mode


def new_call_id():
    return time.strftime("%Y%m%dT%H%M%S") + "-" + secrets.token_hex(3)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def disabled(reason, **extra):
    out = {"enabled": False, "reason": reason}
    out.update(extra)
    return out


def summary_confidence(answers):
    """Per question: Choice/Score confidence, or the Noul's P(yes)."""
    return {qid: a.get("confidence", a.get("noul")) for qid, a in answers.items()}


def ask(point, state, env, call_id=None, cwd=None, post=None, write_log=True):
    """Never raises: any exception becomes {"enabled": False, "reason": "internal error: ..."}."""
    post = post or client.post
    try:
        mode = resolve_mode(env, point)
    except Exception as exc:  # direct callers never see an exception
        return disabled("internal error: %s" % type(exc).__name__)
    if mode == "off":
        return disabled("mode off")
    call_id = call_id or new_call_id()
    entry = {"type": "call", "call_id": call_id, "ts": now(), "point": point, "mode": mode}

    def fail(reason):
        if write_log:
            log.safe_append(dict(entry, verdict=None, confident=False, error=reason), env, cwd)
        return disabled(reason, call_id=call_id, point=point, mode=mode)

    try:
        return _run(point, state, env, cwd, post, write_log, entry, fail)
    except Exception as exc:  # fail open on anything unexpected in the body
        return fail("internal error: %s" % type(exc).__name__)


def _run(point, state, env, cwd, post, write_log, entry, fail):
    call_id, mode = entry["call_id"], entry["mode"]
    try:
        template = templates.load_template(point, env)
    except templates.TemplateError as exc:
        return disabled(str(exc), call_id=call_id, point=point)
    entry.update(template_version=template.get("version"), compare=template.get("compare"),
                 on_skips=template.get("on_skips"))

    errors = schema.validate(template["state_schema"], state)
    if errors:
        return fail("state invalid: " + errors[0])
    tokens = templates.estimate_tokens(state)
    if tokens > templates.STATE_TOKEN_LIMIT:
        return fail("state over budget: ~%d tokens > %d (refused, not truncated)"
                    % (tokens, templates.STATE_TOKEN_LIMIT))
    try:
        payload, index = templates.build_request(template, state)
    except templates.TemplateError as exc:
        return fail(str(exc))
    except Exception as exc:  # fail open on any unexpected expansion error
        return fail("expansion failed: %r" % (exc,))
    if not payload["questions"]:
        return fail("no questions apply to this state")
    if templates.estimate_tokens(payload) > templates.REQUEST_TOKEN_LIMIT:
        return fail("request over budget")
    try:
        response = post(payload, env.get("TYPESAFE_API_KEY", ""), endpoint=env.get("JEV_ENDPOINT"))
    except client.JevUnavailable as exc:
        return fail("jev unavailable: %s" % exc)
    answers = response["answers"]
    try:
        result = combine.apply(template, answers, index, state)
    except Exception as exc:  # fail open on any unexpected combination error
        return fail("combine failed: %r" % (exc,))
    detail = result.get("detail", {})
    labels = templates.item_labels(template, state)
    if labels is not None:
        detail = dict(detail, labels=labels)
    out = {"enabled": True, "call_id": call_id, "point": point, "mode": mode,
           "template_version": template.get("version"), "verdict": result["verdict"],
           "confident": result["confident"], "items": result.get("items"),
           "detail": detail, "raw": answers}
    if write_log:
        log.safe_append(dict(entry, verdict=result["verdict"], confident=result["confident"],
                             items=result.get("items"), detail=detail,
                             confidence=summary_confidence(answers), raw=answers,
                             model=response.get("model")), env, cwd)
    return out
