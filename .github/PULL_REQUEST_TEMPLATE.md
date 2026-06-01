<!-- Keep this concise. See CONTRIBUTING.md for the full Definition of Done. -->

## Summary

<!-- What does this change do, and why? Link the ROADMAP item or issue. -->

Closes #

## Affected surfaces

<!-- Check all that apply. -->

- [ ] `om-core` (segmentation / IR)
- [ ] `om-render` (per-block HTML)
- [ ] `om-engine` / `om-wasm`
- [ ] `om-app` (CLI / Tauri boundary)
- [ ] Frontend (panes / store / IPC types)
- [ ] Docs / ROADMAP only

## Definition of Done

- [ ] `cargo xtask ci` passes (or every individual gate passes).
- [ ] IR contract changes (`BlockKind` / `Block` / payload) are mirrored in **both**
      Rust and frontend, or N/A.
- [ ] Invariants preserved: exact `src_range`, stable hashes, per-block render,
      CLI JSON payload shape, frontend state sync.
- [ ] Tests added/updated to cover the change.
- [ ] Public Rust APIs documented; no new clippy/doc warnings.
- [ ] `ROADMAP.md` checkboxes / affected docs updated.

## Validation

<!-- Paste the command(s) run and the result, e.g. `cargo xtask ci` → pass. -->
