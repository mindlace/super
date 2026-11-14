# superspec

A local web app for reading and lightly editing superpowers spec files across
`~/Projects/`. Lists only specs that live in a worktree (active work) — specs in a
project's main checkout are not shown, and a worktree spec drops off the list once
the same file lands on main. Specs render as formatted HTML in a split-pane editor
with autosave. Deep-links (below) still open any spec by path, including ones on main.

## Running

Run every command below from `superspec/`. The app's own specs and plans live in `../docs/superpowers/`.

Development:

```bash
npm install
npm run dev
```

Persistent (built) server on `127.0.0.1:4510`:

```bash
npm run build
npm start
```

The app must be running before you use a deep-link.

## Agent deep-links

To point someone straight at a spec, link to:

```
http://localhost:4510/open?path=<absolute-path-to-spec.md>
```

The app opens with that spec selected. Example phrasing for an agent:
"I've written the spec at http://localhost:4510/open?path=/Users/you/Projects/foo/docs/superpowers/specs/2026-06-22-foo-design.md".

## Tests

```bash
npm test
```
