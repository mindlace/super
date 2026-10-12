"""The installed superpowers plugin: where it is, its version, its skills.

Anchors in jev-gates and the templates were verified against v7.0.0. The anchored
files (subagent-driven-development/{SKILL.md,re-review-prompt.md,task-reviewer-prompt.md,
implementer-prompt.md}, requesting-code-review/code-reviewer.md,
verification-before-completion/SKILL.md, using-superpowers/SKILL.md,
diagnosing-superpowers/prompts/*.md) are byte-identical in v6.4.1 and v6.4.2
(`git diff v6.4.1 v7.0.0 -- <those paths>` is empty, checked 2026-10-11), and the
official marketplace pins v6.4.1, so those versions are verified-compatible too.
"""
import json
import os
from pathlib import Path

from . import _run

VERIFIED_COMPATIBLE = ("6.4.1", "6.4.2")
COMPATIBLE_MAJOR = "7"
SKIP_SKILLS = ("using-superpowers",)


def _load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def superpowers_root(env):
    if env.get("SUPERPOWERS_ROOT"):
        return Path(env["SUPERPOWERS_ROOT"])
    home = Path(env.get("HOME") or os.path.expanduser("~"))
    installed = _load(home / ".claude" / "plugins" / "installed_plugins.json").get("plugins", {})
    enabled = _load(home / ".claude" / "settings.json").get("enabledPlugins", {})
    candidates = []
    for key, records in installed.items():
        if key.split("@")[0] != "superpowers":
            continue
        for rec in records or []:
            if rec.get("installPath"):
                candidates.append((enabled.get(key) is True, Path(rec["installPath"])))
    candidates.sort(key=lambda c: not c[0])   # enabled installs first
    for _, path in candidates:
        if (path / "skills").is_dir():
            return path
    return None


def version(root):
    return _load(Path(root) / ".claude-plugin" / "plugin.json").get("version")


def compat(env):
    root = superpowers_root(env)
    ver = version(root) if root else None
    ok = bool(ver) and (ver.split(".")[0] == COMPATIBLE_MAJOR or ver in VERIFIED_COMPATIBLE)
    return {"superpowers_root": str(root) if root else None, "superpowers_version": ver,
            "compatible": ok,
            "anchors_verified_against": "7.0.0 (identical in %s)" % ", ".join(VERIFIED_COMPATIBLE)}


def _frontmatter(text):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    out = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, val = line.partition(":")
        if sep:
            out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def skills(root):
    out = []
    for skill_md in sorted(Path(root).glob("skills/*/SKILL.md")):
        fm = _frontmatter(skill_md.read_text(encoding="utf-8"))
        name = fm.get("name") or skill_md.parent.name
        if name in SKIP_SKILLS or not fm.get("description"):
            continue
        out.append({"name": "superpowers:" + name, "description": fm["description"]})
    return out


def skills_state(prompt, root):
    return {"prompt": prompt, "skills": skills(root)}


def _skills_state_cmd(args, env):
    root = superpowers_root(env)
    return skills_state(args.prompt, root) if root else {"prompt": args.prompt, "skills": []}


def add_parser(sub):
    p = sub.add_parser("compat", help="installed superpowers version and anchor compatibility")
    p.set_defaults(func=lambda a, env: _run(lambda: compat(env)))
    p = sub.add_parser("skills-state", help="prompt-route state for a prompt (debugging)")
    p.add_argument("prompt")
    p.set_defaults(func=lambda a, env: _run(lambda: _skills_state_cmd(a, env)))
