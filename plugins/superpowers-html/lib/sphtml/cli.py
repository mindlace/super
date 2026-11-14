"""superpowers-html command line: hook, compat, upstream-root."""
import json
import os
import sys

from . import hook, upstream


def main(argv):
    env = dict(os.environ)
    cmd = argv[0] if argv else ""
    if cmd == "hook":
        if len(argv) > 1 and argv[1] == "session-start":
            print(json.dumps(hook.session_start()))
        return 0
    if cmd == "compat":
        print(json.dumps(upstream.compat(env)))
        return 0
    if cmd == "upstream-root":
        root = upstream.superpowers_root(env)
        if root is None:
            print("superpowers-html: no installed superpowers found (set SUPERPOWERS_ROOT)",
                  file=sys.stderr)
            return 1
        print(root)
        return 0
    print("usage: superpowers-html {hook session-start|compat|upstream-root}", file=sys.stderr)
    return 2
