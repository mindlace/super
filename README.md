# super

A Claude Code plugin marketplace with two plugins.

| Plugin | What it does |
|---|---|
| `supersonic` | `supersonic:superconductor` conducts a multi-spec build through operator subagents. `supersonic:supercomposer` composes the design package it executes. |
| `superpowers-jev` | Optional [TypeSafe](https://typesafe.ai) Jev typed judgments at 13 decision points in superpowers and supersonic. Shadow mode by default. Fails open. |

## Install

```
/plugin marketplace add mindlace/super
/plugin install supersonic@super
/plugin install superpowers-jev@super
```

For local development, add the checkout as a directory marketplace instead:
`/plugin marketplace add ~/Projects/super`.

`superpowers-jev` overlays the official `superpowers` plugin and does not replace it. Keep superpowers installed.

## Jev modes

`superpowers-jev` sends nothing until `TYPESAFE_API_KEY` is set.

| Variable | Effect |
|---|---|
| `SUPERPOWERS_JEV=off\|shadow\|on` | Defaults to `shadow` when `TYPESAFE_API_KEY` is set, and to `off` otherwise. |
| `SUPERPOWERS_JEV_ON=re-review,tier` | Promotes the listed points to `on` while the rest stay in shadow. |
| `SUPERPOWERS_JEV_HOOKS=off` | Turns the three hooks off (nothing is sent from them, and the session note is not injected). Skill points keep working. |

## What is sent

Once `TYPESAFE_API_KEY` is set, text leaves your machine for `https://api.typesafe.ai/v1/systemone` (or `JEV_ENDPOINT`), **including in shadow mode**, where Jev only logs and never acts. Each request carries the point's state and its questions. Nothing is sent without the key.

| Source | What it sends | When |
|---|---|---|
| `prompt-route` hook | Each prompt you submit that has at least 3 words and does not start with `/`, plus the names and descriptions of the installed superpowers skills. | Every such prompt. |
| `verify-stop` hook | Claude's last message (up to 4000 characters) and the last 10 Bash commands since Claude's last file edit, each with up to 500 characters of command and the last 1500 characters of its output. Output can contain secrets that a command printed. | Every time Claude stops. |
| `jev cite` | The cited line and 5 lines either side, for each file a report cites. A cited file can be anywhere on disk, including absolute paths outside the project. | When a skill runs the `citation` point. |
| Skill points | Whatever state the point assembles: review findings and fix-diff hunks, the task brief or spec text, the agent's report, the ledger excerpt, the design's requirements. | When a skill runs that point. |

The `session-start` hook sends nothing. Every request and answer is also written to the local log.

To keep skill points and stop the hooks, set `SUPERPOWERS_JEV_HOOKS=off`. To keep the hooks off and still send nothing from skills, unset `TYPESAFE_API_KEY` (or set `SUPERPOWERS_JEV=off`), which turns every path off: hooks, skill points, and `jev ask`. Disabling or uninstalling the plugin also stops everything.

In shadow mode, Jev's verdict is logged next to Claude's in `.superpowers/jev/log.jsonl`, at the main checkout's root, and nothing acts on it. `jev report` prints per-point agreement, the confident-and-wrong rate, and the Claude dispatches that `on` mode would have skipped.

Locating the main checkout's root needs git 2.31 or newer (`rev-parse --path-format=absolute`). With older git, in a submodule, or in a bare repo, there is no main checkout to find, and the log falls back to `$HOME/.superpowers/jev/log.jsonl`.

The `jev` command is on the Bash tool's PATH only while Claude Code runs. To run `jev report` from a terminal, call it by path from inside the repository whose log you want: `<plugin dir>/bin/jev report` (for a local checkout, `~/Projects/super/plugins/superpowers-jev/bin/jev report`; for an installed plugin, the `bin/jev` under its directory in `~/.claude/plugins/`). `jev report` shows agreement with Claude on Jev's raw answer and on the verdict an `on` run would act on, next to a count of abstentions.

## Tests

`sh tests/run.sh` runs the sh tests and the Python suite (stdlib `unittest`, with a local stub server). The live smoke test runs only with `JEV_LIVE=1`.

## License

MIT. See [LICENSE](LICENSE).
