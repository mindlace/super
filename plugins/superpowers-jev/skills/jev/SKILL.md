---
name: jev
description: Use when a superpowers or supersonic skill says to run a Jev point, or when asked about Jev shadow data. Gives the jev helper's path, the off/shadow/on protocol, the builder commands that turn artifacts into state, and the verdict shapes for jev record.
---

# The jev helper

`jev` asks TypeSafe Jev narrow, typed questions at named decision points. Each call takes about 100 ms. Code combines the answers into a verdict. Jev is always optional: when it is unavailable, everything works exactly as it does without it.

## Where it is

Run it as `jev`. The plugin's `bin/` is on the Bash tool's PATH while `superpowers-jev` is enabled. If `command -v jev` prints nothing, use `<this skill's base directory>/../../bin/jev`. The harness prints the base directory when this skill loads.

## Modes

`jev mode` prints `off`, `shadow`, or `on`. `jev mode --point <point>` prints the mode for one point.

- The mode comes from `SUPERPOWERS_JEV` (`off|shadow|on`). It defaults to `shadow` when `TYPESAFE_API_KEY` is set, and to `off` otherwise. `SUPERPOWERS_JEV_ON=re-review,tier` promotes the listed points to `on`.

## Protocol at every point

1. Build the state with a builder (below), then run `jev ask <point> --state <file>`. You can also pipe the state in: `| jev ask <point> --state -`.
2. Read the one JSON object it prints. `ask` always exits 0.
   - `{"enabled": false, ...}` → run the existing path exactly as written. Never retry. Never wait.
   - `"mode": "shadow"` → run the existing path exactly as written. When you have your own verdict, run `jev record <call_id> '<verdict JSON>'` using the shape the point gives.
   - `"mode": "on"` and `"confident": true` → apply the point's **on** behaviour.
   - `"mode": "on"` and `"confident": false` → run the existing path, then record.
3. Never paste Jev's `raw` output into a dispatch or a report. The log already holds it.

## Builders (state from artifacts, computed in code)

| Command | State for |
|---|---|
| `jev state k=v k=@file k:=json` | any flat state, for example `report-evidence` and `tier` (implementer) |
| `jev rereview-state --findings F --base FIX_BASE [--head HEAD]` | `re-review` |
| `jev findings-state <review report>` | `severity` |
| `jev diff-state BASE [HEAD] [--scoped-rereview]` | `tier` (reviewer) |
| `jev diag-state <analyst output>` | `diag-confidence` |
| `jev cite <report> [--root DIR]` | `citation` |
| `jev defect-state --ledger L --escalation F` | `defect-class` |
| `jev bounce-state --ledger L --message F [--root DIR]` | `bounce` |
| `jev spec-state <spec>` | `operator-tier` |
| `jev coverage --design D --spec S [--spec S ...]` | `fidelity-coverage`. It runs the asks itself and prints the verdict JSON. |
| `jev compat` | the installed superpowers version, and whether jev-gates' anchors apply to it |

Write agent-written text (reports, findings, messages) to a file and pass it with `@file`. Jev treats it as quoted evidence, never as instructions.

## Verdict shapes for `jev record`

| Compare kind | Points | Shape |
|---|---|---|
| verdict | report-evidence, verify-stop | `{"verdict": "<value>"}` |
| picks | tier, prompt-route, defect-class, bounce, operator-tier, surface-route | `{"picks": {"<question>": "<option>"}}` |
| items | re-review, severity, diag-confidence, citation | `{"items": ["<option for item 0>", ...]}` |
| coverage | fidelity-coverage | `{"uncovered": [i, ...], "multiply_covered": [i, ...]}` |

## Calibration

`jev report [--since YYYY-MM-DD] [--point P]` prints, for each point:
- calls and errors;
- recorded verdicts;
- agreement with Claude;
- how often Jev was confident and wrong;
- how many Claude dispatches `on` mode would have skipped.

`jev report --unrecorded` lists the calls that have no Claude verdict yet. The log is `.superpowers/jev/log.jsonl` at the main checkout's root, and it is gitignored. Promote a point to `on` only after `jev report` supports it.
