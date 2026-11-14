"""superpowers-html command line: hook, compat, upstream-root, brief."""
import json
import os
import sys

from . import brief, hook, upstream


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
    if cmd == "brief" and len(argv) == 4:
        return _brief(*argv[1:])
    print("usage: superpowers-html {hook session-start|compat|upstream-root|brief PLAN N OUT}",
          file=sys.stderr)
    return 2


NO_TASKS = ('task-brief: no task sections found. A task is a <section> whose first heading '
            'starts with "Task <id>" (docs/spec-format.md, "Example: a plan").')


def _brief(plan, n, out):
    with open(plan, encoding="utf-8", newline="") as f:
        html = f.read()
    try:
        text = brief.extract(html, n)
    except brief.TaskNotFound:
        print("task %s not found in %s (no section headed 'Task %s')" % (n, plan, n),
              file=sys.stderr)
        if not brief.task_sections(html):
            print(NO_TASKS, file=sys.stderr)
        return 3
    except brief.SectionUnclosed as exc:
        print("task-brief: the <section> opened at line %d of %s never closes; close it and rerun"
              % (exc.line, plan), file=sys.stderr)
        return 4
    with open(out, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return 0
