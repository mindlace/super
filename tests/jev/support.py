"""Shared test support: import path, paths, a stub System One server, answer synthesis."""
import json
import os
import re
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

from jevlib import templates  # noqa: E402  (needs the path entry above)


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


def template(point):
    return load_json(QUESTIONS / (point + ".json"))


def fixture_state(point):
    return load_json(STATES / (point + ".json"))


def ask_point(point, state, responder, **env_extra):
    """Run jevlib.ask.ask for a real template against a stub. Returns (out, requests)."""
    from jevlib import ask
    with StubServer(responder) as srv:
        out = ask.ask(point, state, make_env(srv.url, **env_extra))
    return out, srv.requests


MIN_LITERAL = 20  # shorter state values (enum labels, "DONE") collide with prose by chance


def strings(obj):
    """Every string inside a JSON value."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from strings(v)


def evidence_paths(sch, prefix=""):
    """Paths of state_schema properties whose description marks them as quoted evidence."""
    out = []
    for name, prop in sch.get("properties", {}).items():
        path = prefix + name
        if "quoted evidence" in prop.get("description", ""):
            out.append(path)
        if prop.get("type") == "array" and isinstance(prop.get("items"), dict):
            out += evidence_paths(prop["items"], path + "[].")
        elif prop.get("type") == "object":
            out += evidence_paths(prop, path + ".")
    return out


def state_values(state, path):
    """String values found in `state` at a path like findings[].text."""
    nodes = [state]
    for seg in path.split("."):
        is_list = seg.endswith("[]")
        name = seg[:-2] if is_list else seg
        nxt = []
        for n in nodes:
            v = n.get(name) if isinstance(n, dict) else None
            if is_list and isinstance(v, list):
                nxt += v
            elif v is not None:
                nxt.append(v)
        nodes = nxt
    return [s for n in nodes for s in strings(n)]


def agent_text_violations(t, state, paths):
    """Why `t` fails to pass agent-written text as quoted evidence; [] when it complies.

    Each field must be named in the question instructions only as a backticked
    state path (a), and never interpolated into instructions or criteria (b).
    """
    problems = []
    instr = "\n".join(s for q in t["questions"].values() for s in strings(q.get("instructions", "")))
    unticked = re.sub(r"`[^`]*`", "", instr)
    ticked = re.findall(r"`([^`]*)`", instr)
    for path in paths:
        root = re.split(r"[.\[]", path)[0]
        if not any(span.startswith(root) for span in ticked):
            problems.append("%s: never referenced as a backticked state path" % path)
        # A path-shaped or snake_case name outside backticks is prose using the field as text.
        if re.search(r"\b%s(\[|\.)" % re.escape(root), unticked) or ("_" in root and root in unticked):
            problems.append("%s: named outside backticks" % path)
    # (b) no templating other than the item index, and no state value copied into the text.
    for q in t["questions"].values():
        for s in list(strings(q.get("instructions", ""))) + list(strings(q.get("criteria", ""))):
            if re.search(r"\{(?!i\})", s):
                problems.append("placeholder other than {i} in question text: %s" % s[:60])
    qs, _ = templates.expand_questions(t, state)
    rendered = "\n".join(s for q in qs.values()
                         for s in list(strings(q.get("instructions", ""))) + list(strings(q.get("criteria", ""))))
    for path in paths:
        for v in state_values(state, path):
            if len(v) >= MIN_LITERAL and v in rendered:
                problems.append("%s: value interpolated into question text" % path)
    return problems
