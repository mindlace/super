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
from . import log, report
from .builders import superpowers as sp
from .builders import transcript
from .mode import resolve_mode

SESSION_NOTE = (
    "superpowers-jev is active (Jev mode: %s). When running superpowers:subagent-driven-development, "
    "superpowers:verification-before-completion, or superpowers:diagnosing-superpowers, also load "
    "superpowers-jev:jev-gates.\n"
    "In shadow mode Jev only logs; every superpowers step runs unchanged."
)

MIN_PROMPT_WORDS = 3

VERIFY_BLOCK_REASON = (
    "Jev verify-stop: your last message claims the work is complete, fixed, or passing, but no "
    "command output since your last edit supports that claim. Per "
    "superpowers:verification-before-completion (The Gate Function), run the command that proves "
    "it and show its output, or state the actual status."
)


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


def _clear_pending(path):
    try:
        if path:
            path.unlink()
    except OSError:
        pass


def prompt_route(inp, env):
    if resolve_mode(env, "prompt-route") == "off":
        return None
    # A new prompt supersedes the previous one: drop its pending call id first, so every skip
    # path below leaves nothing for the Stop hook to record against a stale call.
    _clear_pending(_pending_path(inp, env))
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
        p = ((res.get("detail") or {}).get("confidences") or {}).get("skill", 0.0)
        return _context("UserPromptSubmit",
                        "Likely applicable skill: %s (Jev p=%.2f). Hint only; apply your own "
                        "judgment per superpowers:using-superpowers." % (skill, p))
    return None


def _record_prompt_route(inp, env, entries):
    """Claude's verdict for the turn's prompt-route call: the first superpowers skill it invoked."""
    path = _pending_path(inp, env)
    if not path or not path.exists():
        return
    try:
        call_id = json.loads(path.read_text(encoding="utf-8"))["prompt_route_call_id"]
    except (OSError, ValueError, KeyError):
        _clear_pending(path)
        return
    used = [s for s in transcript.skills_used_since_last_prompt(entries) if s.startswith("superpowers:")]
    report.record(call_id, {"picks": {"skill": used[0] if used else "none"}}, env, inp.get("cwd"))
    _clear_pending(path)  # consumed: one prompt-route call is recorded at most once


def stop_verify(inp, env):
    if resolve_mode(env) == "off":
        return None
    if inp.get("stop_hook_active"):
        return None   # loop guard: this stop was already continued by a stop hook
    entries = transcript.load(inp.get("transcript_path"))
    _record_prompt_route(inp, env, entries)
    last = inp.get("last_assistant_message") or transcript.last_assistant_text(entries)
    if not last or not last.strip():
        return None
    state = transcript.stop_state(entries, last)
    res = ask_mod.ask("verify-stop", state, env, cwd=inp.get("cwd"))
    if res.get("call_id"):   # keep the judged input so the call can be labeled later
        log.safe_append(log.state_entry(res["call_id"], state, inp.get("session_id"),
                                        inp.get("transcript_path"), "hook"), env, inp.get("cwd"))
    if res.get("enabled") and res.get("mode") == "on" and res.get("verdict") == "block":
        return {"decision": "block", "reason": VERIFY_BLOCK_REASON}
    return None


HOOKS = {"session-start": session_start, "prompt-route": prompt_route, "stop-verify": stop_verify}


def run(name, stdin, env):
    if (env.get("SUPERPOWERS_JEV_HOOKS") or "").strip().lower() == "off":
        return ""   # hooks disabled; skill points (jev ask) are unaffected
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
