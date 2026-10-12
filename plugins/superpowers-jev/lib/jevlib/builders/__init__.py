"""State builders: turn real artifacts into a point's state JSON (code, not model)."""
import subprocess
import sys

from ..cli import emit


def fail(msg):
    """Builders exit 1 on bad input; a following `jev ask --state -` then fails open."""
    sys.stderr.write("jev: %s\n" % msg)
    return 1


def _run(fn):
    """Shared builder command body: emit fn()'s state, or fail with exit 1 on bad input."""
    try:
        emit(fn())
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        return fail(str(exc))
    return 0
