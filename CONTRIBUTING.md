# Contributing to open-md

Thanks for contributing! This project is built for **agent-assisted
development**, so the workflow below applies equally to humans and AI agents.
Read [`AGENTS.md`](AGENTS.md) first for the tool-neutral overview.

## Prerequisites

- Rust (stable; `rust-toolchain.toml` pins the channel + components)
- Node 20+ and npm
- `wasm-bindgen` CLI matching the workspace pin:

  ```sh
  cargo install wasm-bindgen-cli --version 0.2.122 --locked
  ```

## Project layout

| Path | Purpose |
| --- | --- |
| `crates/om-core` | Markdown segmentation and block IR |
| `crates/om-render` | Per-block HTML rendering |
| `crates/om-engine` | Shared engine wiring core + render |
| `crates/om-wasm` | WebAssembly bindings for browser preview |
| `crates/om-app` | CLI / Tauri shell boundary |
| `crates/xtask` | Local task runner (`cargo xtask ci`) |
| `frontend/` | Solid.js + Vite + TypeScript UI |
| `fixtures/` | Markdown fixtures used by tests |

## Architecture invariants (do not break)

The block-scoped pipeline is the product. Preserve:

- **Targeted updates** — edit one block, re-parse/re-render only that block; never
  fall back to whole-document reparsing unless a task explicitly requires it.
- **Exact `src_range`** — every block maps back to its precise source span.
- **Stable hashes** — unchanged blocks keep their content hash across edits.
- **Per-block rendering** — HTML is produced block by block.
- **IR contract sync** — `BlockKind`, `Block`, and payload fields must stay
  identical across the Rust core and the frontend (`stub.ts` / IPC types).
- **CLI JSON payload shape** — the `om-app` payload contract is covered by tests.

## Quality gates (CI parity)

`.github/workflows/ci.yml` is the source of truth. Run everything locally with:

```sh
cargo xtask ci
```

Run subsets while iterating (see the `open-md-quality` skill for guidance):

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

Rules:

- Do not add linting/formatting/testing/package tools unless explicitly requested.
- Dependencies are exact-pinned. Do not upgrade or add deps for convenience.
- Unsafe Rust is forbidden; `clippy::all` is denied; public Rust APIs need docs.

## The agentic dev loop

Specialist agents in [`.github/agents/`](.github/agents) form one pipeline. See the
`agentic-workflow` skill for full handoff rules.

1. **Feature Scout** picks one ROADMAP item + kickoff brief.
2. **Maintainer** implements the smallest complete change.
3. **Testing / Linting / Formatting** validate (targeted → full gate).
4. **Review** checks invariants, IR-contract sync, and gate parity.
5. **Scribe** updates README/ROADMAP/rustdoc and contract docs.
6. **Ship** writes the commit + PR and opens it.

## Definition of Done

A change is done only when **all** hold:

- [ ] `cargo xtask ci` passes (or every individual gate passes).
- [ ] IR contract changes are mirrored in both Rust and frontend.
- [ ] New behavior is covered by tests protecting the invariants above.
- [ ] Public Rust APIs are documented; no new clippy/doc warnings.
- [ ] `ROADMAP.md` checkboxes and any affected docs are updated.
- [ ] The PR description states what changed, why, and the validation run.

## Filing issues

Use the structured templates under `.github/ISSUE_TEMPLATE/`. Feature requests
should reference the relevant `ROADMAP.md` entry (with its Value/Effort tag) so
the Feature Scout can triage them consistently.

## GitHub automation

Repository-side automation lives in `.github/workflows/`:

- **`ci.yml`** — Rust + frontend gates on Linux/Windows/macOS (the source of truth
  for `cargo xtask ci`).
- **`labeler.yml`** — applies `area:*` labels to PRs from path globs in
  `.github/labeler.yml`.
- **`copilot-review.yml`** — requests a Copilot review when a non-draft PR opens.
- **`copilot-assign.yml`** — hands an issue to the Copilot coding agent when it is
  labeled `copilot`.

The two Copilot workflows are best-effort (`continue-on-error`) and require the
Copilot coding agent / code review to be enabled for the repository; they no-op
otherwise. The `copilot` and `area:*` labels must exist in the repository for
labeling and triage to work.

## Commit & PR conventions

- Keep commits focused and the message imperative ("Add table sort", not "Added").
- Open PRs against `main`; fill out the pull request template checklist.
- Keep committed code, docs, and CI platform-neutral.
