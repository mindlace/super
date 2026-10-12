"""Shared test support: import path, paths, a stub System One server, answer synthesis."""
import json
import os
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "superpowers-jev"
JEV = PLUGIN / "bin" / "jev"
QUESTIONS = PLUGIN / "questions"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
TOY_TEMPLATES = FIXTURES / "templates"
STATES = FIXTURES / "states"
sys.path.insert(0, str(PLUGIN / "lib"))


class StubServer:
    """Local stand-in for api.typesafe.ai.

    `responder(payload) -> (status, body, delay_seconds)`. Requests are recorded in
    `self.requests` as {"payload": ..., "auth": ...}.
    """

    def __init__(self, responder):
        self.responder = responder
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                outer.requests.append({"payload": payload,
                                       "auth": self.headers.get("Authorization")})
                status, body, delay = outer.responder(payload)
                if delay:
                    time.sleep(delay)
                data = json.dumps(body).encode("utf-8")
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, *args):
                pass

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.httpd.daemon_threads = True
        self.url = "http://127.0.0.1:%d/v1/systemone" % self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()


def answer_all(payload, pick=None, noul=0.1, conf=0.95):
    """A well-formed System One response for every question in `payload`.

    pick: option name, or callable(qid, options) -> option; default is the first option.
    noul: P(yes), or callable(qid) -> P(yes).
    """
    answers = {}
    for qid, q in payload["questions"].items():
        if q["type"] == "noul":
            answers[qid] = {"type": "noul", "noul": noul(qid) if callable(noul) else noul}
        elif q["type"] == "choice":
            opts = list(q["criteria"])
            choice = pick(qid, opts) if callable(pick) else (pick if pick in opts else opts[0])
            answers[qid] = {"type": "choice", "choice": choice, "confidence": conf,
                            "probabilities": {o: (1.0 if o == choice else 0.0) for o in opts}}
        else:
            levels = q["criteria"]
            answers[qid] = {"type": "score", "score": 0.0, "confidence": conf,
                            "legend": {str(i): lvl for i, lvl in enumerate(levels)},
                            "probabilities": {str(i): (1.0 if i == 0 else 0.0)
                                              for i in range(len(levels))}}
    return {"model": "jev-1.13.0", "answers": answers,
            "usage": {"input_tokens": 10, "output_tokens": 1}}


def ok(**kw):
    """Responder: 200 with answer_all(payload, **kw)."""
    return lambda payload: (200, answer_all(payload, **kw), 0)


def make_env(endpoint=None, **extra):
    """An isolated env dict: test key, temp log dir, temp HOME."""
    d = tempfile.mkdtemp(prefix="jevtest-")
    env = {"TYPESAFE_API_KEY": "test-key", "JEV_LOG_DIR": os.path.join(d, "log"), "HOME": d}
    if endpoint:
        env["JEV_ENDPOINT"] = endpoint
    env.update(extra)
    return env


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))
