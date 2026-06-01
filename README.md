# open-md

**A git-native Markdown workspace for documenting code repos — and presenting
that documentation to others.** Open a repo or folder, write the docs that live
beside your code, review them against git, and present them as a live slide deck
— all in one local, Markdown-native app.

Where VS Code treats Markdown as just another file, Typora gives you a single
editing surface, and Obsidian builds a personal knowledge vault, open-md is
built around your **repository**: it is git-aware, fully local (no cloud, no
account), Markdown-native end to end, and it can **present** your finished doc
without exporting to another tool.

## Modes — the workflow

Instead of a flat pile of features, open-md is organized into a few
intent-named **Modes** you switch between as your work changes shape:

| Mode         | What it's for                                                  |
| ------------ | -------------------------------------------------------------- |
| **Write**    | Draft prose with a live preview.                               |
| **Document** | Document your repo: Source + Preview with an outline and project sidebar, git-aware. |
| **Review**   | Review changes with block-level diff, comments, and proofreading. |
| **Present**  | Present your document as a live fullscreen slide deck, keyboard-navigable. |
| **Inspect**  | (Advanced) the block-level IR pane, for looking under the hood. |

The natural journey: **open a repo/folder → Document it → Review it against git
→ Present it to others.**

## Presentation mode

Press **F5** to turn the current document into a live, fullscreen slide deck —
navigate with the keyboard and present directly from the app, no export step
required. This is part of the **Present** mode above.

## Status

Alpha (`0.1.0-alpha.2`). The Modes workflow, the core rendering pipeline, and a
broad feature set are in place; see [`ROADMAP.md`](ROADMAP.md) for the
authoritative list of what is **shipped** versus **planned**, and for how to
pick the next feature.

## Under the hood / power features

Beneath the Modes, open-md is a three-pane pipeline you can open up via the
**Inspect** mode:

1. **Source** — raw Markdown (CodeMirror 6)
2. **IR** — block-level intermediate representation (JSON tree)
3. **Preview** — rendered HTML, editable in place

Performance is a core differentiator: edits in any pane re-parse and re-render
only the changed blocks, never the whole document. The IR pane exposes that
block-level model directly — a power feature for anyone who wants to see how a
document is segmented and rendered.

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
