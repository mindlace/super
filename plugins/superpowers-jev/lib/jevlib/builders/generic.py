"""`jev state k=v k=@file k:=json`: assemble a flat state object from arguments."""
import json
from pathlib import Path

from . import _run


def build_state(pairs):
    state = {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep or not key:
            raise ValueError("expected key=value, key=@file, or key:=json, got %r" % pair)
        if key.endswith(":"):
            state[key[:-1]] = json.loads(value)
        elif value.startswith("@"):
            state[key] = Path(value[1:]).read_text(encoding="utf-8")
        else:
            state[key] = value
    return state


def add_parser(sub):
    p = sub.add_parser("state", help="build state from key=value, key=@file, key:=json")
    p.add_argument("pairs", nargs="+")
    p.set_defaults(func=lambda a, env: _run(lambda: build_state(a.pairs)))
