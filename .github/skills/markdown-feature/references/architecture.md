# Markdown Feature Architecture

## Pipeline

Markdown source flows through these layers:

1. `crates\om-core`: segments source into top-level `Block` values.
2. `crates\om-render`: renders each `Block.source` slice to HTML.
3. `crates\om-app`: reads files, runs segmentation/rendering, and emits JSON payloads.
4. `frontend\src\ipc\types.ts`: mirrors the Rust payload shape by hand in M0.
5. `frontend\src\ipc\stub.ts`: browser-side M0 parser/renderer used until real Tauri IPC is wired.
6. `frontend\src\store\document.ts`: owns source, path, history, pane layout, and preview metadata.
7. `frontend\src\panes`: Source, IR, and Preview editors consume the same document payload.

## Core Invariants

- A top-level Markdown block is the unit of identity, hashing, editing, and rendering.
- `src_range` is a byte range into the original source and must slice back to `source`.
- `hash` changes only when that block's source slice changes.
- `BlockKind` is serialized as `snake_case`; TypeScript unions must match Rust names.
- Per-block rendering intentionally does not resolve cross-block references.
- Preview typography and layout settings are document metadata, not Markdown source.

## Common Change Map

| Change | Likely files |
| --- | --- |
| New block kind | `crates\om-core\src\ir.rs`, `crates\om-core\src\segment.rs`, `frontend\src\ipc\types.ts`, `frontend\src\ipc\stub.ts`, panes/tests |
| Renderer behavior | `crates\om-render\src\lib.rs`, fixture snapshot tests, frontend stub if still mirrored |
| CLI payload shape | `crates\om-app\src\main.rs`, `crates\om-app\tests\cli.rs`, frontend IPC types |
| Editable preview round-trip | `frontend\src\panes\preview`, `frontend\src\store\document.ts`, Vitest tests |
| Table or image helpers | `frontend\src\markdown`, preview block views, IPC stub/types, Vitest tests |

## Test Expectations

- Segmenter changes should cover deterministic output, expected block kinds, exact source ranges, and unchanged-block hash stability.
- Renderer changes should cover escaped HTML, expected tags, and fixture snapshots.
- CLI changes should cover success payloads and error paths.
- Frontend changes should cover pure helpers and store behavior with Vitest before relying on manual UI checks.
