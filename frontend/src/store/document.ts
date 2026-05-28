import { createSignal, createMemo, batch } from "solid-js";
import type {
  Block,
  DocumentPayload,
  PreviewContentWidth,
  PreviewDocumentMeta,
  PreviewFontFamily,
} from "../ipc/types";
import {
  createMarkdownFile as desktopCreateMarkdownFile,
  isDesktopRuntime,
  loadProjectFile as desktopLoadProjectFile,
  openMarkdownFile as desktopOpenMarkdownFile,
  openProjectFolder as desktopOpenProjectFolder,
  saveMarkdownFile as desktopSaveMarkdownFile,
} from "../ipc/desktop";
import type { LoadedMarkdownFile, ProjectFile, ProjectPayload } from "../ipc/desktop";
import { parseDocument } from "../ipc/stub";
import { storeAsset } from "./assets";

export const PANE_IDS = ["source", "ir", "preview"] as const;
export type PaneId = (typeof PANE_IDS)[number];
export type LayoutPresetId = "balanced" | "write" | "review" | "inspect";
export type ActiveLayoutId = LayoutPresetId | "custom";
export type PaneMoveDirection = -1 | 1;
export type PaneDropPosition = "before" | "after";
export type EditingPoint = {
  pane: PaneId;
  sourceOffset: number;
};

export type LayoutPreset = {
  id: LayoutPresetId;
  label: string;
  description: string;
  order: PaneId[];
  sizes: Record<PaneId, number>;
  visible: Record<PaneId, boolean>;
};

const DEFAULT_PANE_ORDER: PaneId[] = ["source", "ir", "preview"];
const DEFAULT_PANE_SIZES: Record<PaneId, number> = {
  source: 1,
  ir: 1,
  preview: 1,
};
const UNTITLED_PATH = "(untitled).md";

export const PANE_SIZE_MIN = 0.35;
const PANE_SIZE_MAX = 4;

const clampPaneSize = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PANE_SIZE_MAX, Math.max(PANE_SIZE_MIN, Math.round(value * 100) / 100));
};

const copyPaneSizes = (sizes: Record<PaneId, number>): Record<PaneId, number> => ({
  source: clampPaneSize(sizes.source),
  ir: clampPaneSize(sizes.ir),
  preview: clampPaneSize(sizes.preview),
});

const copyPaneVisibility = (
  next: Record<PaneId, boolean>,
): Record<PaneId, boolean> => {
  const visibleCount = PANE_IDS.filter((id) => next[id]).length;
  return visibleCount > 0 ? { ...next } : { ...next, source: true };
};

const LAYOUT_PRESETS_BY_ID: Record<LayoutPresetId, LayoutPreset> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Equal Source, IR, and Preview panes.",
    order: [...DEFAULT_PANE_ORDER],
    sizes: { source: 1, ir: 1, preview: 1 },
    visible: { source: true, ir: true, preview: true },
  },
  write: {
    id: "write",
    label: "Write",
    description: "Focus on source editing with a live preview.",
    order: ["source", "preview", "ir"],
    sizes: { source: 1.25, ir: 0.7, preview: 1.35 },
    visible: { source: true, ir: false, preview: true },
  },
  review: {
    id: "review",
    label: "Review",
    description: "Put the rendered document first for reading and editing.",
    order: ["preview", "source", "ir"],
    sizes: { source: 1, ir: 0.7, preview: 1.6 },
    visible: { source: true, ir: false, preview: true },
  },
  inspect: {
    id: "inspect",
    label: "Inspect",
    description: "Emphasize block-level IR alongside source and preview.",
    order: ["source", "ir", "preview"],
    sizes: { source: 0.9, ir: 1.6, preview: 0.9 },
    visible: { source: true, ir: true, preview: true },
  },
};

export const LAYOUT_PRESETS = Object.values(LAYOUT_PRESETS_BY_ID);

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

const resetHistory = (src: string, path: string) => {
  history.splice(0);
  history.push({ src, path });
  historyPos = 0;
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
const [path, setPathRaw] = createSignal(UNTITLED_PATH);
const [editingPoint, setEditingPointRaw] = createSignal<EditingPoint | null>(null);
const [projectRoot, setProjectRootRaw] = createSignal<string | null>(null);
const [projectFiles, setProjectFilesRaw] = createSignal<ProjectFile[]>([]);
const [activeProjectFile, setActiveProjectFileRaw] = createSignal<string | null>(null);

// Preview-only document presentation. This deliberately lives outside the
// Markdown source/history so changing reading/editing ergonomics never dirties
// the document.
export const DEFAULT_PREVIEW_SETTINGS: PreviewDocumentMeta = {
  fontFamily: "sans",
  fontSizePx: 16,
  lineHeight: 1.65,
  contentWidth: "readable",
};

const PREVIEW_FONT_FAMILIES: PreviewFontFamily[] = ["sans", "serif", "mono"];
const PREVIEW_CONTENT_WIDTHS: PreviewContentWidth[] = ["fluid", "readable", "wide"];

const clampPreviewNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
};

const normalizePreviewSettings = (
  settings: PreviewDocumentMeta,
): PreviewDocumentMeta => ({
  fontFamily: PREVIEW_FONT_FAMILIES.includes(settings.fontFamily)
    ? settings.fontFamily
    : DEFAULT_PREVIEW_SETTINGS.fontFamily,
  fontSizePx: clampPreviewNumber(settings.fontSizePx, 12, 28, DEFAULT_PREVIEW_SETTINGS.fontSizePx),
  lineHeight: clampPreviewNumber(settings.lineHeight, 1.2, 2.2, DEFAULT_PREVIEW_SETTINGS.lineHeight),
  contentWidth: PREVIEW_CONTENT_WIDTHS.includes(settings.contentWidth)
    ? settings.contentWidth
    : DEFAULT_PREVIEW_SETTINGS.contentWidth,
});

const [previewSettings, setPreviewSettingsRaw] = createSignal<PreviewDocumentMeta>({
  ...DEFAULT_PREVIEW_SETTINGS,
});

// Wrapper that also records history.
const setSource = (s: string) => {
  setSourceRaw(s);
  pushHistory(s, path());
};
const setPath = (p: string) => {
  setPathRaw(p);
  if (historyPos >= 0) history[historyPos] = { ...history[historyPos]!, path: p };
};

const replaceDocument = (
  file: LoadedMarkdownFile,
  activeFilePath: string | null,
) => {
  batch(() => {
    setPathRaw(file.path);
    setSourceRaw(file.source);
    setEditingPointRaw(null);
    setActiveProjectFileRaw(activeFilePath);
  });
  resetHistory(file.source, file.path);
};

const clampSourceOffset = (offset: number) => {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(source().length, Math.max(0, Math.trunc(offset)));
};

// Seed history with the initial document.
resetHistory(SAMPLE, UNTITLED_PATH);

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
  replaceDocument({ path: UNTITLED_PATH, source: "" }, null);
};

export const useSource = () => source;
export const useSetSource = () => setSource;
export const usePath = () => path;
export const useSetPath = () => setPath;
export const useProjectRoot = () => projectRoot;
export const useProjectFiles = () => projectFiles;
export const useActiveProjectFile = () => activeProjectFile;
export const usePreviewSettings = () => previewSettings;
export const useEditingPoint = () => editingPoint;

const normalizePathForCompare = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const normalizeRelativePath = (value: string) => value.replace(/\\/g, "/");

export const relativePathInProject = (
  root: string,
  filePath: string,
): string | null => {
  const normalizedRoot = normalizePathForCompare(root);
  const normalizedPath = filePath.replace(/\\/g, "/");
  const comparablePath = normalizePathForCompare(filePath);
  const prefix = `${normalizedRoot}/`;
  if (!comparablePath.startsWith(prefix)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
};

const sameFilePath = (a: string, b: string) =>
  normalizePathForCompare(a) === normalizePathForCompare(b);

const sortProjectFiles = (files: ProjectFile[]) =>
  [...files].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }),
  );

const normalizeProjectFile = (file: ProjectFile): ProjectFile => ({
  path: file.path,
  relativePath: normalizeRelativePath(file.relativePath),
});

export const applyProject = (project: ProjectPayload) => {
  batch(() => {
    setProjectRootRaw(project.root);
    setProjectFilesRaw(sortProjectFiles(project.files.map(normalizeProjectFile)));
    setActiveProjectFileRaw(null);
  });
};

const upsertProjectFile = (filePath: string) => {
  const root = projectRoot();
  if (!root) return;
  const relativePath = relativePathInProject(root, filePath);
  if (!relativePath) return;
  setProjectFilesRaw((files) => {
    const next = files.filter((file) => !sameFilePath(file.path, filePath));
    next.push({ path: filePath, relativePath: normalizeRelativePath(relativePath) });
    return sortProjectFiles(next);
  });
};

const activePathForLoadedFile = (filePath: string) => {
  const root = projectRoot();
  return root && relativePathInProject(root, filePath) ? filePath : null;
};

export const loadMarkdownFile = (
  file: LoadedMarkdownFile,
  activeFilePath = activePathForLoadedFile(file.path),
) => {
  replaceDocument(file, activeFilePath);
  if (activeFilePath) upsertProjectFile(file.path);
};

export const setEditingPoint = (point: EditingPoint) => {
  setEditingPointRaw({
    pane: point.pane,
    sourceOffset: clampSourceOffset(point.sourceOffset),
  });
};

export const clearEditingPoint = (pane?: PaneId) => {
  const current = editingPoint();
  if (!current) return;
  if (pane && current.pane !== pane) return;
  setEditingPointRaw(null);
};

export const isEditingPointInBlock = (point: EditingPoint | null, block: Block) => {
  if (!point) return false;
  const [start, end] = block.src_range;
  if (end <= start) return point.sourceOffset === start;
  return point.sourceOffset >= start && point.sourceOffset <= end;
};

export const setPreviewTypography = (patch: Partial<PreviewDocumentMeta>) => {
  setPreviewSettingsRaw(normalizePreviewSettings({ ...previewSettings(), ...patch }));
};

export const resetPreviewTypography = () => {
  setPreviewSettingsRaw({ ...DEFAULT_PREVIEW_SETTINGS });
};

export const useDocument = createMemo<DocumentPayload>(() => {
  const doc = parseDocument(source(), path());
  return { ...doc, preview: previewSettings() };
});

// --- pane visibility -------------------------------------------------------

const [visible, setVisible] = createSignal<Record<PaneId, boolean>>({
  source: true,
  ir: true,
  preview: true,
});
const [paneOrder, setPaneOrder] = createSignal<PaneId[]>([...DEFAULT_PANE_ORDER]);
const [paneSizes, setPaneSizesRaw] = createSignal<Record<PaneId, number>>(
  copyPaneSizes(DEFAULT_PANE_SIZES),
);
const [activeLayout, setActiveLayout] = createSignal<ActiveLayoutId>("balanced");

export const usePaneVisible = () => visible;
export const usePaneOrder = () => paneOrder;
export const usePaneSizes = () => paneSizes;
export const useActiveLayout = () => activeLayout;
export const useVisiblePanes = () => () =>
  paneOrder().filter((id) => visible()[id]);

export const togglePane = (id: PaneId) => {
  const v = visible();
  const next = { ...v, [id]: !v[id] };
  // Don't allow hiding the last visible pane.
  const remaining = PANE_IDS.filter((paneId) => next[paneId]).length;
  if (remaining === 0) return;
  batch(() => {
    setVisible(next);
    setActiveLayout("custom");
  });
};

export const applyLayoutPreset = (id: LayoutPresetId) => {
  const preset = LAYOUT_PRESETS_BY_ID[id];
  batch(() => {
    setPaneOrder([...preset.order]);
    setPaneSizesRaw(copyPaneSizes(preset.sizes));
    setVisible(copyPaneVisibility(preset.visible));
    setActiveLayout(id);
  });
};

export const resetLayout = () => applyLayoutPreset("balanced");

export const resetPaneSizes = () => {
  batch(() => {
    setPaneSizesRaw(copyPaneSizes(DEFAULT_PANE_SIZES));
    setActiveLayout("custom");
  });
};

export const movePaneRelative = (
  id: PaneId,
  targetId: PaneId,
  position: PaneDropPosition,
) => {
  if (id === targetId) return;
  const current = paneOrder();
  if (!current.includes(id) || !current.includes(targetId)) return;
  const without = current.filter((paneId) => paneId !== id);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex < 0) return;
  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  const next = [
    ...without.slice(0, insertAt),
    id,
    ...without.slice(insertAt),
  ];
  batch(() => {
    setPaneOrder(next);
    setActiveLayout("custom");
  });
};

export const movePane = (id: PaneId, direction: PaneMoveDirection) => {
  const visibleIds = paneOrder().filter((paneId) => visible()[paneId]);
  const currentIndex = visibleIds.indexOf(id);
  if (currentIndex < 0) return;
  const target = visibleIds[currentIndex + direction];
  if (!target) return;
  movePaneRelative(id, target, direction < 0 ? "before" : "after");
};

export const resizePanePair = (leftId: PaneId, rightId: PaneId, delta: number) => {
  if (leftId === rightId || !Number.isFinite(delta)) return;
  const sizes = paneSizes();
  const left = sizes[leftId];
  const right = sizes[rightId];
  const total = left + right;
  const nextLeft = Math.min(
    total - PANE_SIZE_MIN,
    Math.max(PANE_SIZE_MIN, left + delta),
  );
  const nextRight = total - nextLeft;
  batch(() => {
    setPaneSizesRaw({
      ...sizes,
      [leftId]: clampPaneSize(nextLeft),
      [rightId]: clampPaneSize(nextRight),
    });
    setActiveLayout("custom");
  });
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

// Read a File/Blob into the in-memory asset store and return its short
// markdown-friendly path (e.g. "assets/photo-ab12cd34.png").
export const ingestImageFile = async (
  file: File | Blob,
  hintName?: string,
): Promise<string> => {
  const name =
    hintName ?? (file instanceof File ? file.name : "image");
  return storeAsset(file, name);
};

// Open a native file picker and return a markdown image snippet, or null if
// the user cancelled. The chosen file is stored in the in-memory asset
// store and referenced by a short readable path — the document source stays
// clean and editable (no megabyte data: URLs).
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
        const path = await ingestImageFile(f);
        const alt = f.name.replace(/\.[^.]+$/, "");
        resolve(formatImageMarkdown({ alt, src: path }));
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

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write(data: BlobPart | string): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandle = {
  name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (
    options: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const notifyUnavailable = (message: string) => {
  if (typeof window.alert === "function") {
    window.alert(message);
  } else {
    console.warn(message);
  }
};

const reportFileError = (context: string, error: unknown) => {
  const message = `${context}: ${errorMessage(error)}`;
  console.error(message);
  notifyUnavailable(message);
};

export const saveFile = async () => {
  const src = source();
  const p = path();

  if (isDesktopRuntime()) {
    try {
      const saved = await desktopSaveMarkdownFile(p === UNTITLED_PATH ? null : p, src);
      if (!saved) return;
      setPath(saved.path);
      upsertProjectFile(saved.path);
      setActiveProjectFileRaw(activePathForLoadedFile(saved.path));
    } catch (error) {
      reportFileError("Save failed", error);
    }
    return;
  }

  const savePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: p,
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(src);
      await writable.close();
      setPath(handle.name);
      return;
    } catch (error) {
      if (isAbortError(error)) return;
      reportFileError("Save failed", error);
      return;
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
  if (isDesktopRuntime()) {
    try {
      const loaded = await desktopOpenMarkdownFile();
      if (loaded) loadMarkdownFile(loaded);
    } catch (error) {
      reportFileError("Open failed", error);
    }
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".md,.markdown,text/markdown,text/plain";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      loadMarkdownFile({ path: file.name, source: text });
    } catch (error) {
      reportFileError("Open failed", error);
    }
  };
  input.click();
};

export const createMarkdownFile = async () => {
  if (isDesktopRuntime()) {
    try {
      const loaded = await desktopCreateMarkdownFile(projectRoot());
      if (loaded) loadMarkdownFile(loaded);
    } catch (error) {
      reportFileError("Create file failed", error);
    }
    return;
  }

  newDocument();
  await saveFile();
};

export const openProject = async () => {
  if (!isDesktopRuntime()) {
    notifyUnavailable("Open Folder is available in the desktop app.");
    return;
  }

  try {
    const project = await desktopOpenProjectFolder();
    if (project) applyProject(project);
  } catch (error) {
    reportFileError("Open folder failed", error);
  }
};

export const openProjectFile = async (file: ProjectFile) => {
  if (!isDesktopRuntime()) {
    notifyUnavailable("Project files are available in the desktop app.");
    return;
  }

  try {
    const loaded = await desktopLoadProjectFile(file.path);
    if (loaded) loadMarkdownFile(loaded, file.path);
  } catch (error) {
    reportFileError("Open project file failed", error);
  }
};
