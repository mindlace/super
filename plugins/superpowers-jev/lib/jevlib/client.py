"""POST to TypeSafe System One. One attempt, 3 s timeout, no retries: a slow Jev
must never stall a caller, and every failure becomes JevUnavailable."""
import json
import urllib.error
import urllib.request

DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
TIMEOUT_S = 3.0


class JevUnavailable(Exception):
    pass


def post(payload, key, endpoint=None, timeout=TIMEOUT_S):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint or DEFAULT_ENDPOINT, data=body, method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        exc.close()
        raise JevUnavailable("http %d" % exc.code)
    except Exception as exc:  # any transport failure, including http.client.HTTPException
        raise JevUnavailable("%s: %s" % (type(exc).__name__, exc))
    if not isinstance(data, dict) or not isinstance(data.get("answers"), dict):
        raise JevUnavailable("malformed response")
    return data
