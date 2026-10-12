"""Mode resolution: off | shadow | on.

SUPERPOWERS_JEV = off | shadow | on. Default: shadow if TYPESAFE_API_KEY is set,
else off. SUPERPOWERS_JEV_ON=re-review,tier promotes listed points to on.
No key always means off: there is nothing to call.
"""
import sys

MODES = ("off", "shadow", "on")


def base_mode(env):
    key = (env.get("TYPESAFE_API_KEY") or "").strip()
    raw = (env.get("SUPERPOWERS_JEV") or "").strip().lower()
    if raw and raw not in MODES:
        sys.stderr.write("jev: ignoring invalid SUPERPOWERS_JEV=%r (want off|shadow|on)\n" % raw)
        raw = ""
    if not key:
        return "off"
    return raw or "shadow"


def on_points(env):
    raw = env.get("SUPERPOWERS_JEV_ON") or ""
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def resolve_mode(env, point=None):
    """The mode for one point (or the session-wide mode when point is None)."""
    mode = base_mode(env)
    if mode == "shadow" and point and point in on_points(env):
        return "on"
    return mode
