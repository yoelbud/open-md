# open-md Copilot Instructions

## Project Shape

- `open-md` is a local Markdown viewer/editor with synchronized Source, IR, and Preview panes.
- Rust workspace crates live under `crates\`: `om-core` owns segmentation and IR, `om-render` owns per-block HTML rendering, `om-engine` wires core + render, `om-wasm` exposes the browser bindings, `om-app` is the CLI/Tauri shell boundary, and `xtask` is the local task runner.
- The frontend is Solid.js, Vite, and TypeScript under `frontend\`.
- Preserve the block-scoped pipeline: Markdown source -> block IR -> per-block HTML -> editable panes. Do not replace a targeted block update with whole-document reparsing or rerendering unless the task explicitly requires it.

## Agent Workflow

- Prefer the workspace custom agents for focused work:
  - `OpenMD Feature Scout` to pick the next ROADMAP item with a kickoff brief.
  - `OpenMD Maintainer` for implementation work that should coordinate specialists.
  - `OpenMD Testing` for targeted/full tests and failure triage.
  - `OpenMD Linting` for clippy, TypeScript, doc, and build quality gates.
  - `OpenMD Formatting` for formatter checks and `cargo fmt`.
  - `OpenMD Review` for high-signal diff review before merge (invariants + IR contract).
  - `OpenMD Scribe` for docs/ROADMAP/rustdoc status hygiene after a change lands.
  - `OpenMD Ship` to run the full gate, craft the commit/PR, and open it.
- Use the `agentic-workflow` skill to coordinate the end-to-end loop and handoffs
  (scout → maintainer → testing/linting/formatting → review → scribe → ship).
- Use the `open-md-quality` skill before finishing code changes or when choosing validation commands.
- Use the `markdown-feature` skill when changing Markdown syntax support, block kinds, IR schema, rendering, editable preview behavior, fixtures, or source/IR/preview synchronization.
- Keep Rust and frontend contract surfaces in sync when the IR shape changes, especially `BlockKind`, `Block`, and payload fields.

## Commands

- Run every CI gate locally: `cargo xtask ci` (Rust then frontend). Subsets: `cargo xtask rust`, `cargo xtask frontend`.
- Rust format check: `cargo fmt --all --check`
- Rust format apply: `cargo fmt --all`
- Rust lint: `cargo clippy --workspace --all-targets --locked -- -D warnings`
- Rust tests: `cargo test --workspace --locked`
- Rust build: `cargo build --workspace --all-targets --locked`
- Rust docs: `cargo doc --workspace --no-deps --locked`
- Frontend install: `Set-Location frontend && npm ci`
- Frontend typecheck: `Set-Location frontend && npm run typecheck`
- Frontend tests: `Set-Location frontend && npm test`
- Frontend build: `Set-Location frontend && npm run build`

## Conventions

- In Copilot CLI on Windows, use PowerShell commands and Windows path separators. Keep committed code, docs, and CI platform-neutral unless the task is Windows-specific.
- Do not add new linting, formatting, testing, or package-management tools unless explicitly requested. The frontend currently has typecheck, test, and build scripts, but no ESLint or Prettier script.
- Dependencies are exact-pinned. Do not upgrade or add dependencies for convenience.
- Rust has strict workspace lints: unsafe code is forbidden, `clippy::all` is denied, and public Rust APIs should have useful docs.
- Tests should protect core invariants: exact `src_range`, stable hashes for unchanged blocks, per-block rendering, CLI JSON payload shape, and frontend state synchronization.
## Resilient File Editing

When the `edit` tool is interrupted or stalls, fall back immediately to PowerShell string replacement — do not retry the same `edit` call:

```powershell
$file = "path\to\file"
$content = Get-Content $file -Raw
$content = $content -replace '(?s)old pattern', 'new content'
# OR for literal strings:
$content = $content.Replace('exact old text', 'new text')
Set-Content $file $content -NoNewline
```

Key rules:
- Use `-replace` with `(?s)` flag for multi-line patterns.
- Use `.Replace()` for literal strings (no regex special chars).
- Always verify with `Select-String` or `Get-Content` after writing.
- When adding new crates to `Cargo.toml`, run `cargo test --workspace` without `--locked` first to update `Cargo.lock`, then subsequent runs can use `--locked`.
- Vitest cannot load real WASM; the `wasmStubPlugin` in `vite.config.ts` provides a virtual module when `src/wasm/om_wasm.js` is absent.