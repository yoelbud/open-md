---
description: "Use when changing Markdown parsing, block IR, rendering, fixtures, preview editing, incremental updates, source/IR/preview synchronization, or Markdown feature support."
applyTo: ["fixtures/**/*.md", "crates/om-core/**", "crates/om-render/**", "frontend/src/markdown/**", "frontend/src/panes/**", "frontend/src/ipc/**", "frontend/src/store/document.ts"]
---

# Markdown IR Instructions

- The top-level block is the cache, diff, edit, and render unit. Preserve that boundary when adding features.
- Lists, tables, and block quotes are currently emitted as single top-level blocks. Do not split nested children unless the task explicitly changes the IR model.
- `render_block` should render a block from its own source slice. Cross-block references such as footnotes are intentionally not resolved by per-block rendering today.
- `BlockKind` is serialized as `snake_case`; frontend unions and UI labels must stay compatible.
- Table and image editing have extra frontend preview metadata/helpers. Keep round-trips source-preserving and cover them with Vitest tests.
- Fixture or snapshot changes should represent meaningful rendering/IR behavior, not incidental formatting.
- When changing a Markdown behavior, check all affected surfaces: Rust segmenter, Rust renderer, CLI payload, frontend types, frontend stub, Source/IR/Preview panes, fixtures, and tests.
