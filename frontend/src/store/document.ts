import { createSignal, createMemo, batch } from "solid-js";
import type { Block, DocumentPayload } from "../ipc/types";
import { parseDocument } from "../ipc/stub";

export type PaneId = "source" | "ir" | "preview";

// --- undo / redo -----------------------------------------------------------

const HISTORY_LIMIT = 200;

type HistoryEntry = { src: string; path: string };
const history: HistoryEntry[] = [];
let historyPos = -1; // points to current state
let skipHistory = false; // prevent recording during undo/redo replay

const pushHistory = (src: string, path: string) => {
  if (skipHistory) return;
  // Discard any redo states when a new edit is made.
  history.splice(historyPos + 1);
  history.push({ src, path });
  if (history.length > HISTORY_LIMIT) history.shift();
  historyPos = history.length - 1;
};

export const canUndo = () => historyPos > 0;
export const canRedo = () => historyPos < history.length - 1;

// --- initial content -------------------------------------------------------

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

const [source, setSourceRaw] = createSignal(SAMPLE);
const [path, setPathRaw] = createSignal("(untitled).md");

// Wrapper that also records history.
const setSource = (s: string) => {
  setSourceRaw(s);
  pushHistory(s, path());
};
const setPath = (p: string) => setPathRaw(p);

// Seed history with the initial document.
pushHistory(SAMPLE, "(untitled).md");

export const undo = () => {
  if (!canUndo()) return;
  historyPos--;
  const entry = history[historyPos]!;
  skipHistory = true;
  batch(() => { setSourceRaw(entry.src); setPathRaw(entry.path); });
  skipHistory = false;
};
export const redo = () => {
  if (!canRedo()) return;
  historyPos++;
  const entry = history[historyPos]!;
  skipHistory = true;
  batch(() => { setSourceRaw(entry.src); setPathRaw(entry.path); });
  skipHistory = false;
};

export const newDocument = () => {
  batch(() => { setPath("(untitled).md"); setSource(""); });
};

export const useSource = () => source;
export const useSetSource = () => setSource;
export const usePath = () => path;
export const useSetPath = () => setPath;

export const useDocument = createMemo<DocumentPayload>(() =>
  parseDocument(source(), path()),
);

// --- pane visibility -------------------------------------------------------

const [visible, setVisible] = createSignal<Record<PaneId, boolean>>({
  source: true,
  ir: true,
  preview: true,
});

export const usePaneVisible = () => visible;
export const togglePane = (id: PaneId) => {
  const v = visible();
  // Don't allow hiding the last visible pane.
  const remaining = Object.values({ ...v, [id]: !v[id] }).filter(Boolean).length;
  if (remaining === 0) return;
  setVisible({ ...v, [id]: !v[id] });
};

// --- block-level edits -----------------------------------------------------

// Replace one block's source slice in the document. Used by IR + Preview panes.
export const replaceBlockSource = (block: Block, newSource: string) => {
  const [start, end] = block.src_range;
  const current = source();
  // Re-locate the block by exact source match in case offsets are stale.
  const slice = current.slice(start, end);
  if (slice === block.source) {
    setSource(current.slice(0, start) + newSource + current.slice(end));
    return;
  }
  const idx = current.indexOf(block.source);
  if (idx >= 0) {
    setSource(
      current.slice(0, idx) + newSource + current.slice(idx + block.source.length),
    );
  }
};

// --- block reordering & multi-delete ---------------------------------------

// Reassemble the document from an ordered list of block sources.
// Separates blocks with a single blank line.
const rebuildFromBlocks = (blocks: Block[]) => {
  setSource(
    blocks.map((b) => b.source.replace(/\n+$/, "")).join("\n\n") + "\n",
  );
};

export const moveBlocksUp = (ids: Set<string>) => {
  const blocks = useDocument().blocks;
  const indices = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => ids.has(b.id))
    .map(({ i }) => i);
  if (!indices.length || indices[0] === 0) return;
  const result = [...blocks];
  // Move each selected block one position up (top-down to avoid clobbering).
  for (const i of indices) {
    [result[i - 1], result[i]] = [result[i]!, result[i - 1]!];
  }
  rebuildFromBlocks(result);
};

export const moveBlocksDown = (ids: Set<string>) => {
  const blocks = useDocument().blocks;
  const indices = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => ids.has(b.id))
    .map(({ i }) => i)
    .reverse(); // process bottom-up
  if (!indices.length || indices[0] === blocks.length - 1) return;
  const result = [...blocks];
  for (const i of indices) {
    [result[i], result[i + 1]] = [result[i + 1]!, result[i]!];
  }
  rebuildFromBlocks(result);
};

export const deleteBlocks = (ids: Set<string>) => {
  const blocks = useDocument().blocks.filter((b) => !ids.has(b.id));
  rebuildFromBlocks(blocks);
};

// --- inserting new blocks --------------------------------------------------

export type BlockTemplate = {
  id: string;
  label: string;
  icon: string;
  // Markdown snippet, including the trailing blank line that separates blocks.
  // If `getSnippet` is present, it overrides this (used for interactive
  // templates like "image from file" that need to prompt the user).
  snippet: string;
  // Caret offset inside the snippet to focus after insertion (best-effort).
  caret?: number;
  // Async producer: returns the snippet to insert, or null to cancel.
  getSnippet?: () => Promise<string | null>;
};

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { id: "h1", label: "Heading 1", icon: "H1", snippet: "# Heading\n\n", caret: 2 },
  { id: "h2", label: "Heading 2", icon: "H2", snippet: "## Heading\n\n", caret: 3 },
  { id: "h3", label: "Heading 3", icon: "H3", snippet: "### Heading\n\n", caret: 4 },
  { id: "p",  label: "Paragraph", icon: "¶",  snippet: "Lorem ipsum.\n\n" },
  { id: "ul", label: "Bullet list", icon: "•",
    snippet: "- item one\n- item two\n- item three\n\n" },
  { id: "ol", label: "Numbered list", icon: "1.",
    snippet: "1. first\n2. second\n3. third\n\n" },
  { id: "task", label: "Task list", icon: "☑",
    snippet: "- [ ] todo\n- [ ] another\n- [x] done\n\n" },
  { id: "code", label: "Code block", icon: "</>",
    snippet: "```rust\nfn main() {\n    println!(\"hi\");\n}\n```\n\n" },
  { id: "quote", label: "Blockquote", icon: "❝",
    snippet: "> A quoted line.\n\n" },
  { id: "table", label: "Table", icon: "▦",
    snippet: "| col a | col b |\n| ----- | ----- |\n| 1     | 2     |\n\n" },
  { id: "hr", label: "Divider", icon: "—", snippet: "---\n\n" },
  { id: "link", label: "Link (paragraph)", icon: "🔗",
    snippet: "[link text](https://example.com)\n\n" },
  { id: "img", label: "Image (URL)", icon: "🖼",
    snippet: "![alt text](https://example.com/image.png)\n\n" },
  { id: "img-file", label: "Image from computer…", icon: "📁",
    snippet: "",
    getSnippet: async () => {
      const md = await pickImageFromFile();
      return md ? md + "\n\n" : null;
    } },
];

// --- image helpers ---------------------------------------------------------

// Build an image-block markdown snippet (no trailing newlines).
export const formatImageMarkdown = (opts: {
  alt: string;
  src: string;
  title?: string;
  width?: string | null;   // "300", "300px", "50%", or null
  height?: string | null;
  align?: "left" | "center" | "right" | null;
}): string => {
  const dim = (v?: string | null) => {
    if (!v) return "";
    if (/^\d+%$/.test(v)) return v;
    const m = /^(\d+)(?:px)?$/.exec(v);
    return m ? m[1]! : "";
  };
  const w = dim(opts.width);
  const h = dim(opts.height);
  const sizeToken = w || h ? ` =${w}x${h}` : "";
  const titlePart = opts.title ? ` "${opts.title.replace(/"/g, "")}"` : "";
  const alignPart = opts.align ? `{.${opts.align}}` : "";
  return `![${opts.alt}](${opts.src}${titlePart}${sizeToken})${alignPart}`;
};

// Convert a File/Blob to a data URL. Used for "load from computer" + paste/drop.
export const fileToDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

// Open a native file picker and return a markdown image snippet, or null if
// the user cancelled. The chosen file is embedded as a data URL so the
// document remains self-contained (no broken paths on move).
export const pickImageFromFile = async (): Promise<string | null> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    let settled = false;
    input.onchange = async () => {
      settled = true;
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const url = await fileToDataUrl(f);
        const alt = f.name.replace(/\.[^.]+$/, "");
        resolve(formatImageMarkdown({ alt, src: url }));
      } catch {
        resolve(null);
      }
    };
    // If the user cancels, `change` never fires. We rely on focus returning
    // to the window as a cancel signal so the promise resolves.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => { if (!settled) resolve(null); }, 300);
      },
      { once: true },
    );
    input.click();
  });
};

// Append an image at the end of the document (used by drop + paste).
export const appendImageBlock = (src: string, alt = "image") => {
  const snippet = formatImageMarkdown({ alt, src }) + "\n\n";
  insertBlockAfter(null, snippet);
};

// Insert `snippet` after the given block (or at end if block is null).
export const insertBlockAfter = (block: Block | null, snippet: string) => {
  const current = source();
  if (!block) {
    const pad = current.length === 0 || current.endsWith("\n\n") ? "" :
                current.endsWith("\n") ? "\n" : "\n\n";
    setSource(current + pad + snippet);
    return;
  }
  const [start, end] = block.src_range;
  const slice = current.slice(start, end);
  const anchorEnd = slice === block.source
    ? end
    : (() => {
        const idx = current.indexOf(block.source);
        return idx >= 0 ? idx + block.source.length : current.length;
      })();
  // Ensure a blank line separates blocks.
  const before = current.slice(0, anchorEnd);
  const after  = current.slice(anchorEnd);
  const pad = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  setSource(before + pad + snippet + after);
};

// Insert at the very top of the document.
export const insertBlockAtStart = (snippet: string) => {
  const current = source();
  const pad = current.startsWith("\n") || current.length === 0 ? "" : "\n";
  setSource(snippet + pad + current);
};

export const saveFile = async () => {
  const src = source();
  const p = path();
  // In M1 this will call Tauri's fs.writeTextFile. For now use the browser
  // File System Access API (Chrome/Edge) with a fallback to anchor download.
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: p,
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(src);
      await writable.close();
      setPath(handle.name as string);
      return;
    } catch {
      /* user cancelled or API unavailable, fall through */
    }
  }
  // Fallback: trigger a download.
  const blob = new Blob([src], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: p });
  a.click();
  URL.revokeObjectURL(url);
};

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
