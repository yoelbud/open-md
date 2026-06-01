# open-md

A snappy local Markdown viewer and editor with three synchronized panes:

1. **Source** — raw Markdown (CodeMirror 6)
2. **IR** — block-level intermediate representation (JSON tree)
3. **Preview** — rendered HTML, editable in place

Performance is the headline feature: edits in any pane re-parse and re-render
only the changed blocks, never the whole document.

## Status

Alpha (`0.1.0-alpha.2`). The core three-pane pipeline and a broad feature set
are in place; see [`ROADMAP.md`](ROADMAP.md) for the authoritative list of what
is **shipped** versus **planned**, and for how to pick the next feature.

## Stack

- **Tauri 2** shell, packaged as a small native desktop binary
- **Rust** core (`crates/om-core`, `crates/om-render`, `crates/om-engine`, `crates/om-wasm`, `crates/om-app`)
- **Solid.js + Vite + TypeScript** frontend
- **CodeMirror 6** for the source pane
- **pulldown-cmark** + GFM for parsing

## Development

Prerequisites: Rust (stable), Node 20+, npm, and the `wasm-bindgen` CLI
version matching the workspace dependency:

```sh
cargo install wasm-bindgen-cli --version 0.2.122 --locked
```

```sh
# install frontend deps
cd frontend && npm install && cd ..

# run a dev build of the frontend only (browser preview, no Tauri)
# this compiles the shared Rust engine to WebAssembly first
cd frontend && npm run dev

# typecheck Rust workspace
cargo check --workspace

# run the full Tauri desktop app (when wired up)
cd crates/om-app && cargo run
```

## Testing

The project has multiple test layers, all enforced in CI:

```sh
# Rust: format, lints, unit + property + snapshot + CLI integration + doc tests
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked

# Frontend: strict TypeScript + Vitest unit tests + production build
cd frontend
npm run typecheck
npm test
npm run build
```

## Performance

A dependency-free benchmark harness measures the core pipeline (segmentation +
per-block rendering) on synthetic large documents:

```sh
cargo run --release --example bench_pipeline
```

This prints a table of timings for documents ranging from 1 000 to 50 000
blocks, covering:

- **Segmentation throughput** — `segment()` alone
- **Full payload render** — segment + render all blocks (rich + plain HTML)
- **Re-segmentation** — whole-doc re-parse after a small edit

Regression guards also run as part of `cargo test` (Rust) and `npm test`
(frontend), asserting that the pipeline stays within generous wall-clock
budgets and does not exhibit quadratic scaling.

## Contributing & agentic development

This repo is set up for agent-assisted development. Start with
[`AGENTS.md`](AGENTS.md) (tool-neutral entry point) and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev loop, quality gates, and the
specialist agents under [`.github/agents/`](.github/agents). Run every CI gate
locally in one command with `cargo xtask ci`.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or
  <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or
  <https://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in the work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.
