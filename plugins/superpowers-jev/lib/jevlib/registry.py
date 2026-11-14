"""Registry of jev log dirs, so `jev report --all` can find logs across projects.

File: {"version": 1, "log_dirs": [absolute paths]}. Registration is skipped when
JEV_LOG_DIR is set without JEV_REGISTRY (tests and overrides never touch the real one).
"""
import json
import os
import sys
import tempfile
from pathlib import Path

PRUNE = {"node_modules", ".git"}


def registry_path(env):
    if env.get("JEV_REGISTRY"):
        return Path(env["JEV_REGISTRY"])
    if env.get("JEV_LOG_DIR"):
        return None
    home = env.get("HOME") or os.path.expanduser("~")
    return Path(home) / ".superpowers" / "jev" / "registry.json"


def load(env):
    path = registry_path(env)
    if path is None:
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    dirs = data.get("log_dirs") if isinstance(data, dict) else None
    if not isinstance(dirs, list):
        return []
    return [d for d in dirs if isinstance(d, str)]


def register(log_dirs, env):
    path = registry_path(env)
    if path is None:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(path) + ".lock", "a") as lock:
        try:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        except (ImportError, OSError):
            pass
        current = load(env)
        added = 0
        for d in log_dirs:
            s = str(Path(d).resolve())
            if s not in current:
                current.append(s)
                added += 1
        if added or not path.exists():
            fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    json.dump({"version": 1, "log_dirs": current}, fh)
                os.replace(tmp, path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise
        return added


def safe_register(log_dir, env):
    try:
        register([log_dir], env)
    except Exception as exc:  # registry trouble must never break a log append
        sys.stderr.write("jev: registry write failed: %s\n" % exc)


def existing(env):
    return [Path(d) for d in load(env) if Path(d).is_dir()]


def scan(roots):
    found = []
    for root in roots:
        for cur, dirs, files in os.walk(str(root), followlinks=False):
            dirs[:] = sorted(d for d in dirs
                             if d not in PRUNE and (d == ".superpowers" or not d.startswith(".")))
            p = Path(cur)
            if p.name == "jev" and p.parent.name == ".superpowers" and "log.jsonl" in files:
                if p not in found:
                    found.append(p)
    return sorted(found)


def cmd_register(args, env):
    if registry_path(env) is None:
        sys.stderr.write("jev register: no registry (JEV_LOG_DIR is set; set JEV_REGISTRY)\n")
        return 2
    found = scan([Path(r) for r in args.scan])
    sys.stdout.write(json.dumps({"found": len(found), "registered": register(found, env)}) + "\n")
    return 0


def add_parser(sub):
    p = sub.add_parser("register", help="register log dirs found under ROOTs")
    p.add_argument("--scan", nargs="+", required=True, metavar="ROOT")
    p.set_defaults(func=cmd_register)
