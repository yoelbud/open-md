---
description: "Use when editing Rust crates, Cargo manifests, tests, clippy fixes, formatter issues, Markdown segmentation, rendering, or the om-app CLI."
applyTo: ["Cargo.toml", "Cargo.lock", "crates/**/*.rs", "crates/**/Cargo.toml"]
---

# Rust Workspace Instructions

- Keep `crates\om-core` free of Tauri, IO, and UI dependencies. It is the reusable parsing, IR, diffing, and block-caching core.
- Keep `crates\om-render` focused on per-block HTML rendering from `om-core` blocks.
- Keep `crates\om-app` as the CLI/Tauri boundary. It may read files and serialize payloads, but core parsing/rendering should stay in the library crates.
- Keep parser options aligned between segmentation and rendering unless the change deliberately creates a documented difference.
- Treat `Block.src_range` as byte ranges into the original UTF-8 source. Tests should assert the range slices back to `Block.source`.
- Treat `Block.hash` as the cache key for incremental rendering. Unchanged blocks should keep their hashes across unrelated edits.
- If `BlockKind` or payload shape changes, update Rust serialization and frontend `frontend\src\ipc\types.ts` together.
- Prefer precise error messages over broad catch-all handling. CLI errors should explain the path or operation that failed.
- Add or update Rust tests near the behavior: module unit tests, `crates\om-core\tests` property tests, `crates\om-render\tests` fixture/snapshot tests, or `crates\om-app\tests` CLI integration tests.
