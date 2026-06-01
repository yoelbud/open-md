import { createSignal, createMemo, createEffect, batch } from "solid-js";
import type {
  Annotations,
  Block,
  DocumentPayload,
  MarkRange,
  PreviewContentWidth,
  PreviewDocumentMeta,
  PreviewFontFamily,
  ProjectFileFormat,
  RenderMode,
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
import { parseDocument } from "../ipc/runtime";
import { storeAsset } from "./assets";
import {
  EXAMPLE_FILES,
  EXAMPLE_PROJECT_FILES,
  EXAMPLE_ROOT,
  examplePath,
  getExampleFile,
  isExamplePath,
} from "./exampleProject";
import { recordRecent } from "./recents";

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

// Clean first-run defaults: a single Preview-only page. Source (Ctrl+1) and the
// developer-oriented IR pane (Ctrl+2) stay one click away but start hidden so a
// fresh launch is calm and uncluttered. Preview leads the order so revealing
// the other panes slots them in to its right.
const INITIAL_PANE_ORDER: PaneId[] = ["preview", "source", "ir"];
const INITIAL_PANE_VISIBLE: Record<PaneId, boolean> = {
  source: false,
  ir: false,
  preview: true,
};
const INITIAL_PANE_SIZES: Record<PaneId, number> = {
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
// A fresh launch starts empty so the Welcome screen can offer clean ways in.
// The bundled example project lives in store/exampleProject.ts and is only
// loaded when the user explicitly opens it.

const [source, setSourceRaw] = createSignal("");
const [path, setPathRaw] = createSignal(UNTITLED_PATH);

// --- IR annotation layer (rich inline formatting) --------------------------

const EMPTY_ANNOTATIONS: Annotations = { blocks: [] };

const [annotations, setAnnotationsRaw] = createSignal<Annotations>(EMPTY_ANNOTATIONS);
const [previewMode, setPreviewModeRaw] = createSignal<RenderMode>("rich");

export const useAnnotations = () => annotations;
export const usePreviewMode = () => previewMode;
export const setPreviewMode = (mode: RenderMode) => setPreviewModeRaw(mode);
export const setAnnotations = (next: Annotations) => setAnnotationsRaw(next);

// --- IR annotation mutation API --------------------------------------------
// The rich inline layer (highlight + text/background color) lives ONLY here in
// the IR, never in the Markdown body. The preview and IR toolbars mutate it
// through these helpers using character offsets into a block's clean source.

/** Supported colors for the formatting toolbars (mirrors `COLOR_PALETTE`). */
export const MARK_COLORS = [
  "red", "orange", "amber", "yellow", "green", "teal", "blue", "purple", "pink", "gray", "white",
  "black",
] as const;

export type MarkColor = (typeof MARK_COLORS)[number];

// Return the annotation ranges for a block index (empty when none).
export const rangesForBlockIndex = (blockIndex: number): MarkRange[] =>
  annotations().blocks.find((entry) => entry.index === blockIndex)?.ranges ?? [];

// Persist a fresh range list for one block, pruning empty entries so the IR
// stays minimal.
const writeBlockRanges = (blockIndex: number, ranges: MarkRange[]) => {
  const others = annotations().blocks.filter((entry) => entry.index !== blockIndex);
  const cleaned = ranges
    .filter((range) => range.end > range.start && range.marks.length > 0)
    .sort((a, b) => a.start - b.start);
  const next = cleaned.length ? [...others, { index: blockIndex, ranges: cleaned }] : others;
  next.sort((a, b) => a.index - b.index);
  setAnnotationsRaw({ blocks: next });
};

// Apply a transform to the marks covering an exact [start, end) span. Existing
// ranges that intersect the span are trimmed so neighboring formatting is
// preserved, and the transformed marks are stacked onto the targeted span. This
// keeps the stored ranges non-overlapping, which the renderer requires.
const mutateBlockRange = (
  blockIndex: number,
  start: number,
  end: number,
  transform: (marks: Set<string>) => void,
) => {
  if (end <= start) return;
  const ranges = rangesForBlockIndex(blockIndex);

  const base = new Set<string>();
  for (const range of ranges) {
    if (range.start <= start && range.end >= end) {
      for (const mark of range.marks) base.add(mark);
    }
  }
  transform(base);

  const kept: MarkRange[] = [];
  for (const range of ranges) {
    if (range.end <= start || range.start >= end) {
      kept.push(range);
      continue;
    }
    if (range.start < start) kept.push({ start: range.start, end: start, marks: [...range.marks] });
    if (range.end > end) kept.push({ start: end, end: range.end, marks: [...range.marks] });
  }
  if (base.size) kept.push({ start, end, marks: [...base] });
  writeBlockRanges(blockIndex, kept);
};

const withoutPrefix = (marks: Set<string>, prefix: string) => {
  for (const mark of [...marks]) if (mark.startsWith(prefix)) marks.delete(mark);
};

/** Toggle the highlight mark on the given span. */
export const toggleHighlight = (blockIndex: number, start: number, end: number) =>
  mutateBlockRange(blockIndex, start, end, (marks) => {
    if (marks.has("highlight")) marks.delete("highlight");
    else marks.add("highlight");
  });

/** Set (or clear, when `color` is null) the text color on the given span. */
export const setForeground = (
  blockIndex: number,
  start: number,
  end: number,
  color: MarkColor | null,
) =>
  mutateBlockRange(blockIndex, start, end, (marks) => {
    withoutPrefix(marks, "fg-");
    if (color) marks.add(`fg-${color}`);
  });

/** Set (or clear, when `color` is null) the background color on the given span. */
export const setBackground = (
  blockIndex: number,
  start: number,
  end: number,
  color: MarkColor | null,
) =>
  mutateBlockRange(blockIndex, start, end, (marks) => {
    withoutPrefix(marks, "bg-");
    if (color) marks.add(`bg-${color}`);
  });

/** Remove all marks from the given span. */
export const clearMarks = (blockIndex: number, start: number, end: number) =>
  mutateBlockRange(blockIndex, start, end, (marks) => marks.clear());

/** Remove a single stored range from a block (used by the IR annotation chips). */
export const removeBlockRange = (blockIndex: number, rangeIndex: number) => {
  const ranges = rangesForBlockIndex(blockIndex).filter((_, i) => i !== rangeIndex);
  writeBlockRanges(blockIndex, ranges);
};

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

// Decoupled hook so the diff store can snapshot a baseline on open/save without
// creating an import cycle between document.ts and diff.ts.
let baselineCaptureHook: (() => void) | null = null;
export const registerBaselineCapture = (fn: () => void) => {
  baselineCaptureHook = fn;
};
const captureBaseline = () => baselineCaptureHook?.();

const replaceDocument = (
  file: LoadedMarkdownFile,
  activeFilePath: string | null,
  nextAnnotations: Annotations = EMPTY_ANNOTATIONS,
) => {
  batch(() => {
    setPathRaw(file.path);
    setSourceRaw(file.source);
    setEditingPointRaw(null);
    setActiveProjectFileRaw(activeFilePath);
    setAnnotationsRaw(nextAnnotations);
  });
  resetHistory(file.source, file.path);
  captureBaseline();
};

const clampSourceOffset = (offset: number) => {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(source().length, Math.max(0, Math.trunc(offset)));
};

// Seed history with the initial (empty) document.
resetHistory("", UNTITLED_PATH);

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

// The Welcome screen shows when there is nothing meaningful loaded: an untitled,
// empty document with no project open. Any open/new/example action changes one
// of these and dismisses it.
export const useIsWelcome = () =>
  createMemo(
    () =>
      path() === UNTITLED_PATH &&
      source().length === 0 &&
      projectRoot() === null &&
      activeProjectFile() === null,
  );

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
  recordRecent({
    path: file.path,
    label: baseName(file.path) || file.path,
    kind: activeFilePath ? "project" : "file",
  });
};

// Load one bundled example document into the editor without touching the
// filesystem, so it works identically in the browser preview and the desktop
// build.
const loadExampleFile = (filePath: string) => {
  const file = getExampleFile(filePath);
  if (!file) return;
  replaceDocument({ path: filePath, source: file.source }, filePath, file.annotations);
  upsertProjectFile(filePath);
  recordRecent({ path: filePath, label: `Example: ${file.relativePath}`, kind: "example" });
};

// Opens the bundled, in-memory example project (showcase + getting started).
// This is the only place example content enters the app; nothing loads it by
// default.
export const openExampleProject = () => {
  batch(() => {
    setProjectRootRaw(EXAMPLE_ROOT);
    setProjectFilesRaw(sortProjectFiles(EXAMPLE_PROJECT_FILES.map(normalizeProjectFile)));
    setActiveProjectFileRaw(null);
  });
  const first = EXAMPLE_FILES[0];
  if (first) loadExampleFile(examplePath(first.relativePath));
};

// Clears any open project/folder, returning to a project-less state.
export const closeProject = () => {
  batch(() => {
    setProjectRootRaw(null);
    setProjectFilesRaw([]);
    setActiveProjectFileRaw(null);
  });
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
  const doc = parseDocument(source(), path(), annotations());
  return { ...doc, preview: previewSettings() };
});

// --- pane visibility -------------------------------------------------------

const [visible, setVisible] = createSignal<Record<PaneId, boolean>>({
  ...INITIAL_PANE_VISIBLE,
});
const [paneOrder, setPaneOrder] = createSignal<PaneId[]>([...INITIAL_PANE_ORDER]);
const [paneSizes, setPaneSizesRaw] = createSignal<Record<PaneId, number>>(
  copyPaneSizes(INITIAL_PANE_SIZES),
);
const [activeLayout, setActiveLayout] = createSignal<ActiveLayoutId>("custom");

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
    clearActiveMode();
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
    clearActiveMode();
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
    clearActiveMode();
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
    clearActiveMode();
  });
};

// --- outline + status bar visibility ---------------------------------------

const [outlineVisible, setOutlineVisible] = createSignal(false);
const [statusBarVisible, setStatusBarVisible] = createSignal(true);
const [commentsVisible, setCommentsVisibleRaw] = createSignal(false);

export const useOutlineVisible = () => outlineVisible;
export const useStatusBarVisible = () => statusBarVisible;
export const useCommentsVisible = () => commentsVisible;
export const toggleOutline = () => setOutlineVisible((v) => !v);
export const toggleStatusBar = () => setStatusBarVisible((v) => !v);
export const toggleComments = () => setCommentsVisibleRaw((v) => !v);

const [proofreadVisible, setProofreadVisible] = createSignal(false);
export const useProofreadVisible = () => proofreadVisible;
export const toggleProofread = () => setProofreadVisible((v) => !v);

// --- workspace modes -------------------------------------------------------
// Modes are the product's primary workflow surface: each is an intent-named
// workspace layered over the existing layout presets that also drives the side
// panels. Manual pane/panel edits clear the active mode (see clearActiveMode).

export type WorkspaceMode = "write" | "document" | "review" | "present" | "inspect";

export interface WorkspaceModeDef {
  id: WorkspaceMode;
  label: string;
  description: string;
}

export const WORKSPACE_MODES: WorkspaceModeDef[] = [
  { id: "write", label: "Write", description: "Draft prose with a live preview." },
  {
    id: "document",
    label: "Document",
    description: "Document your repo: source, preview, and an outline.",
  },
  {
    id: "review",
    label: "Review",
    description: "Review changes with comments and proofreading.",
  },
  { id: "present", label: "Present", description: "Present your document as a slide deck." },
  { id: "inspect", label: "Inspect", description: "Inspect the block-level IR." },
];

interface ModeLayout {
  layout: LayoutPresetId;
  outline: boolean;
  comments: boolean;
  proofread: boolean;
}

const MODE_LAYOUTS: Record<Exclude<WorkspaceMode, "present">, ModeLayout> = {
  write: { layout: "write", outline: false, comments: false, proofread: false },
  document: { layout: "balanced", outline: true, comments: false, proofread: false },
  review: { layout: "review", outline: false, comments: true, proofread: true },
  inspect: { layout: "inspect", outline: false, comments: false, proofread: false },
};

const [activeMode, setActiveMode] = createSignal<WorkspaceMode | null>(null);
export const useActiveMode = () => activeMode;

// Cleared whenever the user hand-tunes panes/panels away from a mode preset.
const clearActiveMode = () => setActiveMode(null);

const [presentationActive, setPresentationActive] = createSignal(false);
export const usePresentationActive = () => presentationActive;
export const openPresentation = () => setPresentationActive(true);
export const closePresentation = () => {
  setPresentationActive(false);
  if (activeMode() === "present") setActiveMode(prePresentMode);
};
export const togglePresentation = () => {
  if (presentationActive()) closePresentation();
  else applyWorkspaceMode("present");
};

let prePresentMode: WorkspaceMode | null = null;

export const applyWorkspaceMode = (mode: WorkspaceMode) => {
  if (mode === "present") {
    prePresentMode = activeMode() === "present" ? prePresentMode : activeMode();
    setActiveMode("present");
    openPresentation();
    return;
  }
  const cfg = MODE_LAYOUTS[mode];
  batch(() => {
    applyLayoutPreset(cfg.layout);
    setOutlineVisible(cfg.outline);
    setCommentsVisibleRaw(cfg.comments);
    setProofreadVisible(cfg.proofread);
    setDistractionFreeRaw(false);
    setActiveMode(mode);
  });
};

// --- layout persistence ----------------------------------------------------
// Remember the user's chrome between launches so returning power users keep
// their panes, while a first run still gets the clean Preview-only defaults.

const LAYOUT_STORAGE_KEY = "open-md:layout";

interface PersistedLayout {
  visible: Record<PaneId, boolean>;
  order: PaneId[];
  sizes: Record<PaneId, number>;
  activeLayout: ActiveLayoutId;
  outline: boolean;
  statusBar: boolean;
  mode: WorkspaceMode | null;
}

const WORKSPACE_MODE_IDS = new Set<string>(WORKSPACE_MODES.map((m) => m.id));
const isWorkspaceMode = (value: unknown): value is WorkspaceMode =>
  typeof value === "string" && WORKSPACE_MODE_IDS.has(value);

const layoutStorage = (): Storage | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

const isPaneRecord = (value: unknown): value is Record<PaneId, boolean> =>
  Boolean(value) &&
  typeof value === "object" &&
  PANE_IDS.every((id) => typeof (value as Record<string, unknown>)[id] === "boolean");

const isOrder = (value: unknown): value is PaneId[] =>
  Array.isArray(value) &&
  value.length === PANE_IDS.length &&
  PANE_IDS.every((id) => value.includes(id));

const readPersistedLayout = (): PersistedLayout | null => {
  const storage = layoutStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
    if (!isPaneRecord(parsed.visible) || !isOrder(parsed.order)) return null;
    const sizes = parsed.sizes && typeof parsed.sizes === "object" ? parsed.sizes : INITIAL_PANE_SIZES;
    return {
      visible: parsed.visible,
      order: parsed.order,
      sizes: copyPaneSizes(sizes as Record<PaneId, number>),
      activeLayout: (parsed.activeLayout as ActiveLayoutId) ?? "custom",
      outline: typeof parsed.outline === "boolean" ? parsed.outline : false,
      statusBar: typeof parsed.statusBar === "boolean" ? parsed.statusBar : true,
      mode: isWorkspaceMode(parsed.mode) ? parsed.mode : null,
    };
  } catch {
    return null;
  }
};

let restoringLayout = false;

// Applies any saved layout and starts persisting changes. Call once from the
// app shell so the reactive effect runs inside a root.
export const initLayoutPersistence = () => {
  const saved = readPersistedLayout();
  if (saved) {
    restoringLayout = true;
    batch(() => {
      setVisible(copyPaneVisibility(saved.visible));
      setPaneOrder([...saved.order]);
      setPaneSizesRaw(copyPaneSizes(saved.sizes));
      setActiveLayout(saved.activeLayout);
      setOutlineVisible(saved.outline);
      setStatusBarVisible(saved.statusBar);
      setActiveMode(saved.mode);
    });
    restoringLayout = false;
  }

  createEffect(() => {
    const snapshot: PersistedLayout = {
      visible: visible(),
      order: paneOrder(),
      sizes: paneSizes(),
      activeLayout: activeLayout(),
      outline: outlineVisible(),
      statusBar: statusBarVisible(),
      // `present` is a transient overlay state, not a persistable workspace.
      // Persist the underlying mode so a reload doesn't highlight "Present"
      // with no deck open.
      mode: activeMode() === "present" ? prePresentMode : activeMode(),
    };
    if (restoringLayout) return;
    const storage = layoutStorage();
    if (!storage) return;
    try {
      storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures (quota, private mode).
    }
  });
};

// --- scroll sync -----------------------------------------------------------

const [scrollSync, setScrollSync] = createSignal(true);

export const useScrollSync = () => scrollSync;
export const toggleScrollSync = () => setScrollSync((v) => !v);

// --- editor modes ----------------------------------------------------------

const [typewriterMode, setTypewriterMode] = createSignal(false);
const [focusMode, setFocusMode] = createSignal(false);
const [distractionFree, setDistractionFreeRaw] = createSignal(false);

export const useTypewriterMode = () => typewriterMode;
export const useFocusMode = () => focusMode;
export const useDistractionFree = () => distractionFree;
export const toggleTypewriterMode = () => setTypewriterMode((v) => !v);
export const toggleFocusMode = () => setFocusMode((v) => !v);

// Distraction-free: stash prior layout and show only source pane, hide outline + status bar.
let preDFLayout: { visible: Record<PaneId, boolean>; outline: boolean; statusBar: boolean } | null = null;

export const toggleDistractionFree = () => {
  if (distractionFree()) {
    // Restore
    if (preDFLayout) {
      batch(() => {
        setVisible(copyPaneVisibility(preDFLayout!.visible));
        setOutlineVisible(preDFLayout!.outline);
        setStatusBarVisible(preDFLayout!.statusBar);
        setActiveLayout("custom");
      });
      preDFLayout = null;
    }
    setDistractionFreeRaw(false);
  } else {
    preDFLayout = {
      visible: { ...visible() },
      outline: outlineVisible(),
      statusBar: statusBarVisible(),
    };
    batch(() => {
      setVisible({ source: true, ir: false, preview: false });
      setOutlineVisible(false);
      setStatusBarVisible(false);
      setActiveLayout("custom");
    });
    setDistractionFreeRaw(true);
  }
};

// --- find & replace visibility ---------------------------------------------

const [findOpen, setFindOpenRaw] = createSignal(false);
const [findShowReplace, setFindShowReplace] = createSignal(false);

export const useFindOpen = () => findOpen;
export const useFindShowReplace = () => findShowReplace;
export const openFind = () => { setFindOpenRaw(true); setFindShowReplace(false); };
export const openFindReplace = () => { setFindOpenRaw(true); setFindShowReplace(true); };
export const closeFind = () => setFindOpenRaw(false);

const [findSeed, setFindSeedRaw] = createSignal("");
export const useFindSeed = () => findSeed;
export const setFindSeed = (s: string) => setFindSeedRaw(s);
export const searchForSelection = (text: string) => { setFindSeed(text); openFind(); };

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
  { id: "frontmatter", label: "Front matter", icon: "⚙",
    snippet: "---\ntitle: \ndate: \n---\n\n", caret: 14 },
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
  { id: "callout", label: "Callout (note)", icon: "ⓘ",
    snippet: "> [!NOTE]\n> Something worth noticing.\n\n" },
  { id: "callout-warn", label: "Callout (warning)", icon: "⚠",
    snippet: "> [!WARNING]\n> Watch out for this.\n\n" },
  { id: "table", label: "Table", icon: "▦",
    snippet: "| col a | col b |\n| ----- | ----- |\n| 1     | 2     |\n\n" },
  { id: "hr", label: "Divider", icon: "—", snippet: "---\n\n" },
  { id: "math", label: "Math (display)", icon: "∑",
    snippet: "$$\n\\int_0^1 x^2 dx\n$$\n\n" },
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
      captureBaseline();
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
      captureBaseline();
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
  captureBaseline();
};

// --- native project (.ommd) + exports --------------------------------------

const PROJECT_EXTENSION = ".ommd";

const baseName = (value: string) => {
  const file = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return file.replace(/\.(ommd|md|markdown)$/i, "");
};

const downloadFile = (filename: string, data: string, mime: string) => {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
};

const writeViaPicker = async (
  suggestedName: string,
  description: string,
  accept: Record<string, string[]>,
  data: string,
): Promise<boolean> => {
  const savePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (!savePicker) return false;
  try {
    const handle = await savePicker({ suggestedName, types: [{ description, accept }] });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch (error) {
    if (isAbortError(error)) return true;
    throw error;
  }
};

// Serialize the current document as the native `.ommd` project: clean Markdown
// body plus the IR annotation layer and preview settings.
export const serializeProject = (): string => {
  const project: ProjectFileFormat = {
    format: "open-md-project",
    version: 1,
    body: source(),
    annotations: annotations(),
    meta: { preview: previewSettings() },
  };
  return JSON.stringify(project, null, 2);
};

const isAnnotations = (value: unknown): value is Annotations =>
  !!value && typeof value === "object" && Array.isArray((value as Annotations).blocks);

// Parse a `.ommd` JSON string into a normalized project, tolerating partial
// inputs (missing annotations or meta).
export const parseProjectJson = (json: string): ProjectFileFormat => {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Not a valid open-md project file");
  }
  const record = parsed as Partial<ProjectFileFormat>;
  if (typeof record.body !== "string") {
    throw new Error("Project file is missing a Markdown body");
  }
  const project: ProjectFileFormat = {
    format: "open-md-project",
    version: 1,
    body: record.body,
    annotations: isAnnotations(record.annotations) ? record.annotations : EMPTY_ANNOTATIONS,
  };
  if (record.meta) project.meta = record.meta;
  return project;
};

const applyProjectFile = (project: ProjectFileFormat, displayPath: string) => {
  batch(() => {
    setPathRaw(displayPath);
    setSourceRaw(project.body);
    setEditingPointRaw(null);
    setActiveProjectFileRaw(null);
    setAnnotationsRaw(project.annotations);
    if (project.meta?.preview) {
      setPreviewSettingsRaw(normalizePreviewSettings(project.meta.preview));
    }
  });
  resetHistory(project.body, displayPath);
};

// Save the document as a native `.ommd` project (the canonical save format).
export const saveProject = async () => {
  const data = serializeProject();
  const suggested = `${baseName(path())}${PROJECT_EXTENSION}`;
  try {
    const wrote = await writeViaPicker(
      suggested,
      "open-md project",
      { "application/json": [PROJECT_EXTENSION] },
      data,
    );
    if (wrote) return;
  } catch (error) {
    reportFileError("Save project failed", error);
    return;
  }
  downloadFile(suggested, data, "application/json");
};

// Open a native `.ommd` project file.
export const openProjectDocument = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = `${PROJECT_EXTENSION},application/json`;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const project = parseProjectJson(await file.text());
      applyProjectFile(project, file.name);
    } catch (error) {
      reportFileError("Open project failed", error);
    }
  };
  input.click();
};

// Export the clean, standard Markdown body (no IR-only tokens).
export const exportMarkdown = async () => {
  const body = source();
  const suggested = `${baseName(path())}.md`;
  try {
    const wrote = await writeViaPicker(
      suggested,
      "Markdown",
      { "text/markdown": [".md", ".markdown"] },
      body,
    );
    if (wrote) return;
  } catch (error) {
    reportFileError("Export Markdown failed", error);
    return;
  }
  downloadFile(suggested, body, "text/markdown");
};

export const exportHtml = async (htmlContent: string) => {
  const suggested = `${baseName(path())}.html`;
  try {
    const wrote = await writeViaPicker(
      suggested,
      "HTML Document",
      { "text/html": [".html", ".htm"] },
      htmlContent,
    );
    if (wrote) return;
  } catch (error) {
    reportFileError("Export HTML failed", error);
    return;
  }
  downloadFile(suggested, htmlContent, "text/html");
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
  if (isExamplePath(file.path)) {
    loadExampleFile(file.path);
    return;
  }

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

// Reopen an entry from the Welcome screen's recent list. Example entries load
// from bundled content; real files load from disk on the desktop build.
export const openRecent = async (path: string) => {
  if (isExamplePath(path)) {
    if (projectRoot() !== EXAMPLE_ROOT) openExampleProject();
    loadExampleFile(path);
    return;
  }

  if (!isDesktopRuntime()) {
    notifyUnavailable("Reopening recent files is available in the desktop app.");
    return;
  }

  try {
    const loaded = await desktopLoadProjectFile(path);
    if (loaded) loadMarkdownFile(loaded);
  } catch (error) {
    reportFileError("Open recent failed", error);
  }
};
