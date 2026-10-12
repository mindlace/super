"""Command-line entry for bin/jev. `ask` always prints one JSON object and exits 0."""
import argparse
import contextlib
import io
import json
import os
import sys
from pathlib import Path

from . import ask as ask_mod
from .mode import resolve_mode


def command_modules():
    """Modules exposing add_parser(subparsers); each sets func(args, env) -> exit code.
    `jev ask` skips them, so a broken builder import can never break fail-open asks."""
    return []


def read_json_arg(value):
    """A JSON literal, @path, or - for stdin."""
    if value == "-":
        return json.loads(sys.stdin.read())
    if value.startswith("@"):
        return json.loads(Path(value[1:]).read_text(encoding="utf-8"))
    return json.loads(value)


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")


def cmd_ask(args, env):
    try:
        state = read_json_arg(args.state if args.state == "-" else "@" + args.state)
    except (OSError, ValueError) as exc:
        emit(ask_mod.disabled("cannot read state: %s" % exc))
        return 0
    emit(ask_mod.ask(args.point, state, env, call_id=args.call_id))
    return 0


def cmd_mode(args, env):
    sys.stdout.write(resolve_mode(env, args.point) + "\n")
    return 0


def build_parser(include_modules=True):
    parser = argparse.ArgumentParser(prog="jev", description="TypeSafe Jev judgments for superpowers.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("ask", help="ask a point's questions; prints JSON; always exits 0")
    p.add_argument("point")
    p.add_argument("--state", required=True, help="state JSON file, or - for stdin")
    p.add_argument("--call-id")
    p.set_defaults(func=cmd_ask)
    p = sub.add_parser("mode", help="print off|shadow|on")
    p.add_argument("--point")
    p.set_defaults(func=cmd_mode)
    for mod in (command_modules() if include_modules else []):
        mod.add_parser(sub)
    return parser


def _ask_main(argv, env):
    """`jev ask` never exits non-zero: argparse's SystemExit becomes a usage reason."""
    captured = io.StringIO()
    try:
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            args = build_parser(include_modules=False).parse_args(argv)
    except SystemExit:
        emit(ask_mod.disabled(captured.getvalue().strip() or "usage: jev ask POINT --state FILE"))
        return 0
    try:
        return cmd_ask(args, env)
    except Exception as exc:  # fail open, always
        emit(ask_mod.disabled("internal error: %r" % (exc,)))
        return 0


def main(argv, env=None):
    env = dict(os.environ) if env is None else env
    if argv and argv[0] == "ask":
        return _ask_main(argv, env)
    args = build_parser().parse_args(argv)
    return args.func(args, env)
