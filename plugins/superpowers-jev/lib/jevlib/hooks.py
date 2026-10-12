"""Hook entry points: session-start, prompt-route, stop-verify.

Every path returns "" (no output) or one JSON object, never raises, and the
launcher always exits 0: a missing or down Jev never blocks or alters a session.
Contracts (code.claude.com/docs/en/hooks): SessionStart/UserPromptSubmit add context via
hookSpecificOutput.additionalContext; Stop blocks via {"decision":"block","reason":...}
and carries stop_hook_active + last_assistant_message on stdin.
"""
import json
import sys

from .mode import resolve_mode

SESSION_NOTE = (
    "superpowers-jev is active (Jev mode: %s). When running superpowers:subagent-driven-development, "
    "superpowers:verification-before-completion, or superpowers:diagnosing-superpowers, also load "
    "superpowers-jev:jev-gates.\n"
    "In shadow mode Jev only logs; every superpowers step runs unchanged."
)


def _context(event, text):
    return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}


def session_start(inp, env):
    mode = resolve_mode(env)
    if mode == "off":
        return None
    return _context("SessionStart", SESSION_NOTE % mode)


HOOKS = {"session-start": session_start}


def run(name, stdin_text, env):
    try:
        inp = json.loads(stdin_text) if stdin_text.strip() else {}
        out = HOOKS[name](inp, env)
    except Exception as exc:  # a hook never fails the session
        sys.stderr.write("jev hook %s: %r\n" % (name, exc))
        return ""
    return json.dumps(out) if out else ""


def cmd_hook(args, env):
    out = run(args.name, sys.stdin.read(), env)
    if out:
        sys.stdout.write(out + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("hook", help="run a Claude Code hook (reads hook JSON on stdin; always exits 0)")
    p.add_argument("name")  # no choices=: an unknown name must reach run() and exit 0 (fail open)
    p.set_defaults(func=cmd_hook)
