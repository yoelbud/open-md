/// <reference types="vitest" />
import { resolve } from "path";
import { existsSync } from "fs";
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

// Provide a no-op stub for the WASM module when the generated file is absent
// (i.e. during `npm test` and before `npm run build:wasm`).
const wasmStubPlugin = (): Plugin => {
  const wasmId = resolve(__dirname, "src/wasm/om_wasm.js");
  return {
    name: "wasm-stub",
    enforce: "pre",
    resolveId(id, importer) {
      if (!importer) return;
      const abs = resolve(importer, "..", id);
      if (abs === wasmId && !existsSync(wasmId)) {
        return "\0wasm-stub";
      }
    },
    load(id) {
      if (id === "\0wasm-stub") {
        return `export default async function init() {}
export function parse_document_json(_source, _path) {
  throw new Error("[open-md] WASM not built yet. Run: npm run build:wasm");
}`;
      }
    },
  };
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [wasmStubPlugin(), solid()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});