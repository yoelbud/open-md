# AGENTS.md

Tool-neutral entry point for AI agents and contributors working in `open-md`.
This file intentionally stays thin and links to the authoritative context so
nothing diverges. If you only read one file, read this, then follow the links.

## What this project is

`open-md` is a local Markdown viewer/editor with three synchronized panes —
**Source** (CodeMirror 6), **IR** (block JSON), and editable **Preview** — with
per-block incremental re-parse/re-render. Preserve the block-scoped pipeline:
`Markdown source -> block IR -> per-block HTML -> editable panes`. Do not replace
a targeted block update with whole-document reparsing unless explicitly required.

## Authoritative context (read these)

- **Global instructions:** [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
- **Path-scoped instructions:** [`.github/instructions/`](.github/instructions)
  - `rust.instructions.md` — Rust crates, Cargo, clippy, segmentation, rendering, CLI.
  - `markdown-ir.instructions.md` — parsing, block IR, fixtures, sync, features.
  - `frontend.instructions.md` — Solid.js, IPC types, panes, store, Vitest.
- **Skills:** [`.github/skills/`](.github/skills)
  - `open-md-quality` — how to choose validation commands / CI parity.
  - `markdown-feature` — adding Markdown syntax, block kinds, IR/render changes.
  - `agentic-workflow` — the end-to-end dev loop and agent handoffs.
- **Backlog & status:** [`ROADMAP.md`](ROADMAP.md) is the single source of truth
  for shipped vs planned.

## Repository layout

- `crates/om-core` — Markdown segmentation and block IR.
- `crates/om-render` — per-block HTML rendering.
- `crates/om-engine` — shared engine wiring core + render.
- `crates/om-wasm` — WebAssembly bindings for the browser preview.
- `crates/om-app` — CLI / Tauri shell boundary.
- `crates/xtask` — local task runner (`cargo xtask ci` runs every gate).
- `frontend/` — Solid.js + Vite + TypeScript UI.
- `fixtures/` — Markdown fixtures used by tests.

## Specialist agents

The dev loop is split across agents in [`.github/agents/`](.github/agents):

| Agent | Role |
| --- | --- |
| **OpenMD Feature Scout** | Picks one next feature from `ROADMAP.md` + kickoff brief. |
| **OpenMD Maintainer** | Implements the change; coordinates specialists. |
| **OpenMD Testing** | Selects and runs the right tests; triages failures. |
| **OpenMD Linting** | Clippy, typecheck, doc, and build gates. |
| **OpenMD Formatting** | `cargo fmt` checks and fixes. |
| **OpenMD Review** | High-signal diff review; invariant + contract checks. |
| **OpenMD Scribe** | Updates README/ROADMAP/rustdoc; keeps contracts in sync. |
| **OpenMD Ship** | Crafts commit + PR, runs the full gate, opens the PR. |

See `agentic-workflow` skill for how they hand off.

## Quality gates (CI parity)

Run all gates locally with one command:

```sh
cargo xtask ci
```

GitHub-side automation lives in `.github/workflows/`: `ci.yml` (gates),
`labeler.yml` (path-based PR labels), `copilot-review.yml` (request Copilot review
on PRs), and `copilot-assign.yml` (assign issues labeled `copilot` to the Copilot
coding agent).

Or run the gates individually (see `.github/workflows/ci.yml` for the source of truth):

```sh
# Rust
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --workspace --all-targets --locked
cargo test --workspace --locked
cargo doc --workspace --no-deps --locked

# Frontend (from frontend/)
npm ci
npm run typecheck
npm test
npm run build
```

## Ground rules

- Keep Rust and frontend IR contracts in sync (`BlockKind`, `Block`, payload fields).
- Dependencies are exact-pinned; do not upgrade or add deps for convenience.
- Do not add linting/formatting/testing/package tools unless the task requires it.
- Unsafe Rust is forbidden; `clippy::all` is denied; public Rust APIs need docs.
- Protect core invariants: exact `src_range`, stable hashes for unchanged blocks,
  per-block rendering, CLI JSON payload shape, frontend state synchronization.
- On Windows + Copilot CLI use PowerShell and Windows paths, but keep committed
  code, docs, and CI platform-neutral.
