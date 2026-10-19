"""Readers for the Claude Code transcript JSONL (hook input `transcript_path`).

The format is observed, not a documented contract (the hooks docs say only "Path to
conversation JSON ... may lag"), so every accessor is defensive. Observed shape:
entries with "type" user|assistant and message.content either a string (human
prompt) or a list of blocks: text, tool_use {id, name, input}, tool_result
{tool_use_id, content}. Meta entries carry isMeta; subagent entries isSidechain.
"""
import json
from pathlib import Path

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
MAX_COMMANDS = 10
OUTPUT_TAIL_CHARS = 1500
LAST_MESSAGE_CHARS = 4000
TAIL_BYTES = 256 * 1024   # a Stop hook only needs the current turn; never read a whole long session


def _read_tail(path, tail_bytes=TAIL_BYTES):
    with open(path, "rb") as fh:
        if tail_bytes is None:
            return fh.read().decode("utf-8", errors="replace")
        size = fh.seek(0, 2)
        fh.seek(max(0, size - tail_bytes))
        data = fh.read()
    if size > tail_bytes:
        data = data.split(b"\n", 1)[1] if b"\n" in data else b""   # drop the cut first line
    return data.decode("utf-8", errors="replace")


def load(path, tail_bytes=TAIL_BYTES):
    """Entries from the last `tail_bytes` of the transcript; None reads the whole file."""
    if not path:
        return []
    try:
        text = _read_tail(path, tail_bytes)
    except OSError:
        return []
    out = []
    for line in text.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            out.append(entry)
    return out


def _content(entry):
    msg = entry.get("message")
    return msg.get("content") if isinstance(msg, dict) else None


def _blocks(entry, kind):
    c = _content(entry)
    if not isinstance(c, list):
        return []
    return [b for b in c if isinstance(b, dict) and b.get("type") == kind]


def is_human_prompt(entry):
    if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isSidechain"):
        return False
    c = _content(entry)
    if isinstance(c, str):
        return bool(c.strip())
    return bool(_blocks(entry, "text")) and not _blocks(entry, "tool_result")


def since_last_prompt(entries):
    start = 0
    for i, entry in enumerate(entries):
        if is_human_prompt(entry):
            start = i + 1
    return entries[start:]


def _result_text(block):
    c = block.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(b.get("text", "") for b in c if isinstance(b, dict))
    return ""


def skills_used_since_last_prompt(entries):
    used = []
    for entry in since_last_prompt(entries):
        if entry.get("type") != "assistant":
            continue
        for b in _blocks(entry, "tool_use"):
            if b.get("name") == "Skill":
                skill = (b.get("input") or {}).get("skill")
                if skill:
                    used.append(skill)
    return used


def last_assistant_text(entries):
    for entry in reversed(entries):
        if entry.get("type") == "assistant":
            texts = [b.get("text", "") for b in _blocks(entry, "text")]
            if any(t.strip() for t in texts):
                return "\n".join(texts).strip()
    return ""


def stop_state(entries, last_message):
    """verify-stop state: the final message plus Bash commands (and output tails) run
    in this turn after its last file edit."""
    uses, results, last_edit = [], {}, -1
    for entry in since_last_prompt(entries):
        if entry.get("type") == "assistant":
            for b in _blocks(entry, "tool_use"):
                uses.append(b)
                if b.get("name") in EDIT_TOOLS:
                    last_edit = len(uses) - 1
        elif entry.get("type") == "user":
            for b in _blocks(entry, "tool_result"):
                results[b.get("tool_use_id")] = _result_text(b)
    commands = []
    for b in uses[last_edit + 1:]:
        if b.get("name") == "Bash":
            commands.append({"command": str((b.get("input") or {}).get("command", ""))[:500],
                             "output_tail": results.get(b.get("id"), "")[-OUTPUT_TAIL_CHARS:]})
    return {"last_message": last_message[-LAST_MESSAGE_CHARS:],
            "commands_since_last_edit": commands[-MAX_COMMANDS:]}
