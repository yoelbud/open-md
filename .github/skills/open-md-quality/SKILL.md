---
name: open-md-quality
description: "Use when validating open-md changes, choosing test commands, running CI parity checks, formatting, linting, clippy, typecheck, Vitest, cargo test, cargo doc, Vite build, or preparing work for review."
argument-hint: "Changed area or validation goal"
---

# OpenMD Quality

Use this skill to choose the smallest useful validation set first, then the full gate when a change is ready for review.

## Procedure

1. Identify the changed area: Rust core/render/CLI, frontend, docs-only, workflow/config, or cross-cutting IR contract.
2. Use the command matrix in [quality commands](./references/commands.md).
3. Prefer targeted commands while iterating.
4. Run the full relevant gate before finishing code changes:
   - Rust changes: format check, clippy, tests, and usually build/docs.
   - Frontend changes: typecheck, tests, and build.
   - Cross-cutting changes: both Rust and frontend gates.
5. If a command fails, fix the root cause and rerun the failing command before broadening scope.

## Rules

- Use only existing repository commands and scripts.
- Do not add linting, formatting, or testing tools unless explicitly requested.
- Treat `.github\workflows\ci.yml` as the source of truth for CI parity.
- If frontend dependencies are missing, use `npm ci` from `frontend\` before running frontend checks.
