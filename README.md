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

In shadow mode, Jev's verdict is logged next to Claude's in `.superpowers/jev/log.jsonl`, at the main checkout's root, and nothing acts on it. `jev report` prints per-point agreement, the confident-and-wrong rate, and the Claude dispatches that `on` mode would have skipped.

Locating the main checkout's root needs git 2.31 or newer. With older git, the log falls back to a location under `$HOME`.

## Tests

`sh tests/run.sh` runs the sh tests and the Python suite (stdlib `unittest`, with a local stub server). The live smoke test runs only with `JEV_LIVE=1`.

## License

MIT. See [LICENSE](LICENSE).
