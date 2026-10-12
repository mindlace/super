"""POST to TypeSafe System One. One attempt, one overall 3 s deadline, no retries: a slow
Jev must never stall a caller, and every failure becomes JevUnavailable. urlopen's timeout
is per socket operation and DNS is unbounded, so the exchange runs in a daemon thread that
the caller abandons at the deadline."""
import json
import threading
import urllib.error
import urllib.request

DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
TIMEOUT_S = 3.0


class JevUnavailable(Exception):
    pass


def _exchange(payload, key, endpoint, timeout, box):
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint or DEFAULT_ENDPOINT, data=body, method="POST",
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            box["data"] = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        exc.close()
        box["error"] = "http %d" % exc.code
    except Exception as exc:  # any transport failure, including http.client.HTTPException
        box["error"] = "%s: %s" % (type(exc).__name__, exc)


def post(payload, key, endpoint=None, timeout=TIMEOUT_S):
    box = {}
    worker = threading.Thread(target=_exchange, args=(payload, key, endpoint, timeout, box),
                              daemon=True)
    worker.start()
    worker.join(timeout)
    if worker.is_alive():
        raise JevUnavailable("timeout: no complete response within %gs" % timeout)
    if "error" in box:
        raise JevUnavailable(box["error"])
    data = box.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("answers"), dict):
        raise JevUnavailable("malformed response")
    return data
