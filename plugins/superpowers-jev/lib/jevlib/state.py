"""Content-addressed gzipped state blobs: <log dir>/states/<sha[:2]>/<sha>.json.gz."""
import gzip
import hashlib
import json
import os
import re
import sys
import tempfile
import zlib
from pathlib import Path

from . import log

MAX_BLOB_BYTES = 256 * 1024
_SHA = re.compile(r"[0-9a-f]{64}")


def canonical(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")


def blob_path(log_dir, sha):
    return Path(log_dir) / "states" / sha[:2] / (sha + ".json.gz")


def write_blob(obj, log_dir):
    raw = canonical(obj)
    payload = obj
    if len(raw) > MAX_BLOB_BYTES:
        payload = {"truncated": True, "bytes": len(raw),
                   "head": raw[:MAX_BLOB_BYTES].decode("utf-8", "ignore")}
    data = canonical(payload)
    sha = hashlib.sha256(data).hexdigest()
    path = blob_path(log_dir, sha)
    if path.exists():
        return sha
    log.ensure_dir(log_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(gzip.compress(data, mtime=0))
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return sha


def read_blob(sha, log_dir):
    if not isinstance(sha, str) or not _SHA.fullmatch(sha):
        return None
    try:
        obj = json.loads(gzip.decompress(blob_path(log_dir, sha).read_bytes()).decode("utf-8"))
    except (OSError, ValueError, EOFError, zlib.error):
        return None
    return obj if isinstance(obj, dict) else None


def safe_write(obj, env, cwd=None, d=None):
    try:
        return write_blob(obj, d if d is not None else log.log_dir(env, cwd))
    except Exception as exc:  # persisting is best-effort
        sys.stderr.write("jev: state write failed: %s\n" % exc)
        return None


def loader(entries, log_dir):
    calls = {}
    for e in entries:
        if e.get("type") == "call" and e.get("call_id"):
            calls[e["call_id"]] = e
    states = log.states_by_call(entries)

    def get(call_id):
        sha = (calls.get(call_id) or {}).get("state_sha")
        if sha:
            got = read_blob(sha, log_dir)
            if got is not None:
                return got
        st = states.get(call_id)
        if st:
            if st.get("state_sha"):
                got = read_blob(st["state_sha"], log_dir)
                if got is not None:
                    return got
            if st.get("state") is not None:
                return st["state"]
        return None
    return get


def load(call_id, env, cwd=None, entries=None):
    d = log.log_dir(env, cwd)
    if entries is None:
        entries = log.read_dir(d)
    return loader(entries, d)(call_id)
