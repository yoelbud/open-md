# open-md

A snappy local Markdown viewer and editor with three synchronized panes:

1. **Source** — raw Markdown (CodeMirror 6)
2. **IR** — block-level intermediate representation (JSON tree)
3. **Preview** — rendered HTML, editable in place

Performance is the headline feature: edits in any pane re-parse and re-render
only the changed blocks, never the whole document.

## Status

Pre-alpha. Currently at **M0 — skeleton** (see [`plan.md`](plan.md) in the
session workspace for the full roadmap).

## Stack

- **Tauri 2** shell, packaged as a small native desktop binary
- **Rust** core (`crates/om-core`, `crates/om-render`, `crates/om-app`)
- **Solid.js + Vite + TypeScript** frontend
- **CodeMirror 6** for the source pane
- **pulldown-cmark** + GFM for parsing

## Development

Prerequisites: Rust (stable), Node 20+, npm.

```sh
# install frontend deps
cd frontend && npm install && cd ..

# run a dev build of the frontend only (browser preview, no Tauri)
cd frontend && npm run dev

# typecheck Rust workspace
cargo check --workspace

# run the full Tauri desktop app (when wired up)
cd crates/om-app && cargo run
```

## License

Dual-licensed under MIT or Apache-2.0.
