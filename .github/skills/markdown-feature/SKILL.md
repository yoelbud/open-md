---
name: markdown-feature
description: "Use when adding or changing Markdown syntax support, block kinds, IR schema, renderer output, fixtures, editable preview behavior, source/IR/preview synchronization, or Markdown round-trip behavior in open-md."
argument-hint: "Markdown feature or behavior"
---

# Markdown Feature Workflow

Use this skill for changes that affect how Markdown source becomes IR, rendered HTML, or editable preview UI.

## Procedure

1. Map the affected surfaces using [architecture reference](./references/architecture.md).
2. Preserve block-level invariants: exact source slices, stable hashes for unchanged blocks, and per-block render isolation.
3. Update Rust and frontend contracts together when the IR shape or block kind set changes.
4. Add tests at the layer where behavior is owned:
   - `om-core` tests for segmentation and IR invariants.
   - `om-render` tests for HTML output.
   - `om-app` tests for CLI payload shape.
   - `frontend\test` Vitest tests for stub parsing, store behavior, and UI-independent helpers.
5. Use the `open-md-quality` skill to select validation commands.

## Rules

- Do not treat the frontend stub as authoritative when Rust owns the behavior; keep them aligned until IPC/codegen replaces the stub.
- Do not change fixture snapshots casually. Snapshot changes should be explained by a deliberate behavior change.
- Do not store preview-only settings in Markdown source.
