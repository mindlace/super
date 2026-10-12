"""Hook entry points: session-start, prompt-route, stop-verify.

Every path returns "" (no output) or one JSON object, never raises, and the
launcher always exits 0: a missing or down Jev never blocks or alters a session.
Contracts (code.claude.com/docs/en/hooks): SessionStart/UserPromptSubmit add context via
hookSpecificOutput.additionalContext; Stop blocks via {"decision":"block","reason":...}
and carries stop_hook_active + last_assistant_message on stdin.
"""
import json
import sys

from . import ask as ask_mod
from . import log
from .builders import superpowers as sp
from .mode import resolve_mode

SESSION_NOTE = (
    "superpowers-jev is active (Jev mode: %s). When running superpowers:subagent-driven-development, "
    "superpowers:verification-before-completion, or superpowers:diagnosing-superpowers, also load "
    "superpowers-jev:jev-gates.\n"
    "In shadow mode Jev only logs; every superpowers step runs unchanged."
)

MIN_PROMPT_WORDS = 3


def _context(event, text):
    return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}


def session_start(inp, env):
    mode = resolve_mode(env)
    if mode == "off":
        return None
    return _context("SessionStart", SESSION_NOTE % mode)


def _pending_path(inp, env):
    sid = "".join(ch for ch in str(inp.get("session_id") or "") if ch.isalnum() or ch in "-_")
    if not sid:
        return None
    return log.log_dir(env, inp.get("cwd")) / "sessions" / (sid + ".json")


def prompt_route(inp, env):
    if resolve_mode(env, "prompt-route") == "off":
        return None
    prompt = (inp.get("prompt") or "").strip()
    if not prompt or prompt.startswith("/") or len(prompt.split()) < MIN_PROMPT_WORDS:
        return None
    root = sp.superpowers_root(env)
    if root is None:
        return None
    state = sp.skills_state(prompt, root)
    if not state["skills"]:
        return None
    res = ask_mod.ask("prompt-route", state, env, cwd=inp.get("cwd"))
    if not res.get("enabled"):
        return None
    path = _pending_path(inp, env)
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"prompt_route_call_id": res["call_id"]}), encoding="utf-8")
    skill = (res.get("verdict") or {}).get("skill")
    if res.get("mode") == "on" and skill:
        p = res["detail"]["confidences"].get("skill", 0.0)
        return _context("UserPromptSubmit",
                        "Likely applicable skill: %s (Jev p=%.2f). Hint only; apply your own "
                        "judgment per superpowers:using-superpowers." % (skill, p))
    return None


HOOKS = {"session-start": session_start, "prompt-route": prompt_route}


def run(name, stdin, env):
    try:
        stdin_text = stdin.read() if hasattr(stdin, "read") else stdin
        inp = json.loads(stdin_text) if stdin_text.strip() else {}
        out = HOOKS[name](inp, env)
    except Exception as exc:  # a hook never fails the session
        sys.stderr.write("jev hook %s: %r\n" % (name, exc))
        return ""
    return json.dumps(out) if out else ""


def cmd_hook(args, env):
    out = run(args.name, sys.stdin, env)
    if out:
        sys.stdout.write(out + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("hook", help="run a Claude Code hook (reads hook JSON on stdin; always exits 0)")
    p.add_argument("name")  # no choices=: an unknown name must reach run() and exit 0 (fail open)
    p.set_defaults(func=cmd_hook)
