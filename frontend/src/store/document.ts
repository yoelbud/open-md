import { createSignal, createMemo } from "solid-js";
import type { DocumentPayload } from "../ipc/types";
import { parseDocument } from "../ipc/stub";

const SAMPLE = `# Welcome to open-md

This is the **M0 skeleton**. All three panes below render from the same
in-memory document. Editing happens in the *source* pane for now —
*IR* and *Preview* will become editable in later milestones.

## A list

- segmenter is in Rust (\`crates/om-core\`)
- renderer is in Rust (\`crates/om-render\`)
- this preview uses a TS stub until Tauri is wired in M1

## A code block

\`\`\`rust
fn main() {
    println!("hello, open-md");
}
\`\`\`

> Block-level IR is the seam used for caching and incremental rendering.
`;

const [source, setSource] = createSignal(SAMPLE);
const [path, setPath] = createSignal("(untitled).md");

export const useSource = () => source;
export const useSetSource = () => setSource;
export const usePath = () => path;
export const useSetPath = () => setPath;

export const useDocument = createMemo<DocumentPayload>(() =>
  parseDocument(source(), path()),
);

export const openFile = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".md,.markdown,text/markdown,text/plain";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPath(file.name);
    setSource(text);
  };
  input.click();
};
