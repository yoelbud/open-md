---
description: "Use when editing the Solid.js frontend, TypeScript IPC types, panes, preview editing, table/image UI, store state, Vite, or Vitest tests."
applyTo: ["frontend/**/*.ts", "frontend/**/*.tsx", "frontend/**/*.css", "frontend/**/*.html", "frontend/package.json", "frontend/package-lock.json", "frontend/vite.config.ts", "frontend/tsconfig.json"]
---

# Frontend Instructions

- Keep the frontend buildable as a browser/Vite app while Tauri IPC is still being wired in.
- `frontend\src\ipc\types.ts` mirrors the Rust IR by hand for now. Keep it aligned with Rust `Block`, `BlockKind`, and document payload fields.
- `frontend\src\ipc\stub.ts` is an M0 browser-side parser/renderer stub. If Rust behavior changes and the frontend still depends on the stub, update the stub and tests in the same change.
- `frontend\src\store\document.ts` owns source, path, undo/redo, pane layout, and preview presentation settings. Preview typography and layout metadata should not dirty Markdown source.
- Solid state should use signals/memos consistently. Avoid hidden mutable state unless the surrounding module already uses it intentionally for shared UI state.
- Add or update Vitest tests in `frontend\test` for store behavior, parser helpers, IPC stubs, and UI-independent logic.
- Do not introduce frontend linting or formatting dependencies unless explicitly requested; use existing `npm run typecheck`, `npm test`, and `npm run build` scripts.
