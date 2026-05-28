import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const WASM_BINDGEN_VERSION = "0.2.122";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const repoRoot = resolve(frontendDir, "..");
const outDir = join(frontendDir, "src", "wasm");
const wasmInput = join(
  repoRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "om_wasm.wasm",
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
};

const readCommand = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) return null;
  return `${result.stdout}${result.stderr}`;
};

const wasmBindgenVersion = readCommand("wasm-bindgen", ["--version"]);
if (!wasmBindgenVersion?.includes(WASM_BINDGEN_VERSION)) {
  throw new Error(
    `wasm-bindgen CLI ${WASM_BINDGEN_VERSION} is required. ` +
      `Install it with: cargo install wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION} --locked`,
  );
}

run("rustup", ["target", "add", "wasm32-unknown-unknown"]);
run("cargo", [
  "build",
  "--release",
  "--locked",
  "-p",
  "om-wasm",
  "--target",
  "wasm32-unknown-unknown",
]);

mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  if (entry === "om_wasm.d.ts") continue;
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

if (!existsSync(wasmInput)) {
  throw new Error(`expected WASM artifact was not built: ${wasmInput}`);
}

run("wasm-bindgen", [
  wasmInput,
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  "om_wasm",
  "--no-typescript",
]);
