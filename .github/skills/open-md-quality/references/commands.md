# OpenMD Quality Commands

Run commands from the repository root unless noted. In Copilot CLI on Windows, use PowerShell and Windows paths.

## Rust

| Goal | Command |
| --- | --- |
| Check formatting | `cargo fmt --all --check` |
| Apply formatting | `cargo fmt --all` |
| Lint | `cargo clippy --workspace --all-targets --locked -- -D warnings` |
| Build | `cargo build --workspace --all-targets --locked` |
| Test | `cargo test --workspace --locked` |
| Docs | `cargo doc --workspace --no-deps --locked` |

## Frontend

| Goal | Command |
| --- | --- |
| Install locked dependencies | `Set-Location frontend && npm ci` |
| Typecheck | `Set-Location frontend && npm run typecheck` |
| Unit tests | `Set-Location frontend && npm test` |
| Production build | `Set-Location frontend && npm run build` |

## Targeted Checks

| Area | Start with |
| --- | --- |
| Segmenter or IR | `cargo test -p om-core` |
| Renderer or fixture snapshots | `cargo test -p om-render` |
| CLI payload behavior | `cargo test -p om-app --test cli` |
| Frontend store | `Set-Location frontend && npm test -- store.test.ts` |
| Markdown table helpers | `Set-Location frontend && npm test -- table.test.ts` |
| IPC stub | `Set-Location frontend && npm test -- stub.test.ts` |

## Full Review Gate

For a cross-cutting code change, run:

```powershell
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
Set-Location frontend && npm run typecheck && npm test && npm run build
```

If the frontend directory change makes the current shell stay inside `frontend\`, return to the repository root before running Rust commands.
