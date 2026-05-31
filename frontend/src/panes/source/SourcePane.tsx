import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  clearEditingPoint,
  setEditingPoint,
  useDocument,
  useEditingPoint,
  useScrollSync,
  useSetSource,
  useSource,
  useTypewriterMode,
  useFocusMode,
  insertBlockAfter,
} from "../../store/document";
import { useSpellcheck } from "../../store/spellcheck";
import { FindReplaceBar } from "../../components/FindReplaceBar";
import {
  buildLineOffsets,
  blockIndexAtOffset,
  scrollTopToOffset,
  offsetToScrollTop,
  blockIdToSourceOffset,
} from "../../store/scrollSync";
import { SlashMenu, createSlashMenuController } from "./SlashMenu";
import type { BlockTemplate } from "../../store/document";
import {
  imageFileFromPaste,
  imageFilesFromDrop,
  hintNameFromFile,
  ingestAndBuildSnippet,
} from "../../store/imageDrop";

type PaneProps = {
  layoutControls?: JSX.Element;
};

type SourceMetrics = {
  lineHeight: number;
  paddingTop: number;
};

const DEFAULT_SOURCE_METRICS: SourceMetrics = {
  lineHeight: 19.5,
  paddingTop: 14,
};

export const SourcePane = (props: PaneProps) => {
  const source = useSource();
  const setSource = useSetSource();
  const editingPoint = useEditingPoint();
  const typewriterMode = useTypewriterMode();
  const focusMode = useFocusMode();
  const scrollSyncEnabled = useScrollSync();
  const spellcheck = useSpellcheck();
  const doc = useDocument;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [metrics, setMetrics] = createSignal<SourceMetrics>(DEFAULT_SOURCE_METRICS);
  let ta: HTMLTextAreaElement | undefined;

  // --- Scroll sync: suppress feedback loops --------------------------------
  let syncSuppressed = false;
  const suppressSync = () => {
    syncSuppressed = true;
    setTimeout(() => { syncSuppressed = false; }, 60);
  };

  // Slash menu controller
  const slash = createSlashMenuController();

  const updateMetrics = () => {
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const paddingTop = Number.parseFloat(style.paddingTop);
    setMetrics({
      lineHeight: Number.isFinite(lineHeight)
        ? lineHeight
        : (Number.isFinite(fontSize) ? fontSize : 13) * 1.5,
      paddingTop: Number.isFinite(paddingTop)
        ? paddingTop
        : DEFAULT_SOURCE_METRICS.paddingTop,
    });
  };

  const markEditingPoint = (target = ta) => {
    if (!target) return;
    setEditingPoint({
      pane: "source",
      sourceOffset: target.selectionStart,
    });
  };

  const markerLine = createMemo(() => {
    const point = editingPoint();
    if (!point || point.pane === "source") return null;
    const offset = Math.min(point.sourceOffset, source().length);
    return source().slice(0, offset).split("\n").length - 1;
  });

  const markerStyle = (): JSX.CSSProperties => {
    const line = markerLine();
    if (line === null) return {};
    const currentMetrics = metrics();
    return {
      height: `${currentMetrics.lineHeight}px`,
      transform: `translateY(${
        currentMetrics.paddingTop + line * currentMetrics.lineHeight - scrollTop()
      }px)`,
    };
  };

  // --- Typewriter mode: keep cursor line vertically centered ---------------
  const scrollCursorToCenter = () => {
    if (!ta || !typewriterMode()) return;
    const cursorOffset = ta.selectionStart;
    const textBefore = ta.value.slice(0, cursorOffset);
    const cursorLine = textBefore.split("\n").length - 1;
    const currentMetrics = metrics();
    const cursorY = currentMetrics.paddingTop + cursorLine * currentMetrics.lineHeight;
    const viewportHeight = ta.clientHeight;
    const targetScroll = cursorY - viewportHeight / 2 + currentMetrics.lineHeight / 2;
    ta.scrollTop = Math.max(0, targetScroll);
  };

  // --- Focus mode: compute active line for dimming -------------------------
  const [cursorLine, setCursorLine] = createSignal(0);
  const totalLines = createMemo(() => source().split("\n").length);

  const updateCursorLine = () => {
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    setCursorLine(before.split("\n").length - 1);
  };

  // --- Find & Replace: select text in textarea -----------------------------
  const selectRange = (start: number, end: number) => {
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(start, end);
    // Scroll the selection into view
    const textBefore = ta.value.slice(0, start);
    const line = textBefore.split("\n").length - 1;
    const currentMetrics = metrics();
    const lineY = currentMetrics.paddingTop + line * currentMetrics.lineHeight;
    const viewportHeight = ta.clientHeight;
    if (lineY < ta.scrollTop || lineY > ta.scrollTop + viewportHeight - currentMetrics.lineHeight) {
      ta.scrollTop = Math.max(0, lineY - viewportHeight / 3);
    }
    setScrollTop(ta.scrollTop);
  };

  // --- Scroll sync: Source → Preview ---------------------------------------
  const syncSourceToPreview = () => {
    if (!ta || !scrollSyncEnabled() || syncSuppressed) return;
    const currentMetrics = metrics();
    const lineOffsets = buildLineOffsets(source());
    const offset = scrollTopToOffset(
      ta.scrollTop,
      currentMetrics.lineHeight,
      currentMetrics.paddingTop,
      lineOffsets,
    );
    const blocks = doc().blocks;
    const blockIdx = blockIndexAtOffset(blocks, offset);
    if (blockIdx < 0) return;
    const block = blocks[blockIdx];
    if (!block) return;

    // Find the preview row with matching data-block-id
    const previewBody = document.querySelector(".pane-body.preview");
    if (!previewBody) return;
    const row = previewBody.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement | null;
    if (!row) return;

    suppressSync();
    row.scrollIntoView({ block: "start", behavior: "auto" });
  };

  // --- Scroll sync: Preview → Source (called from the preview pane) --------
  // We expose a global listener on the preview pane's scroll via a MutationObserver approach.
  // Instead, we use a scroll event listener on the preview container.
  const syncPreviewToSource = () => {
    if (!ta || !scrollSyncEnabled() || syncSuppressed) return;
    const previewBody = document.querySelector(".pane-body.preview");
    if (!previewBody) return;

    // Find the topmost visible block row
    const rows = previewBody.querySelectorAll("[data-block-id]");
    const containerRect = previewBody.getBoundingClientRect();
    let topBlockId: string | null = null;

    for (const row of rows) {
      const rect = (row as HTMLElement).getBoundingClientRect();
      if (rect.bottom > containerRect.top) {
        topBlockId = (row as HTMLElement).dataset.blockId ?? null;
        break;
      }
    }

    if (!topBlockId) return;
    const blocks = doc().blocks;
    const offset = blockIdToSourceOffset(blocks, topBlockId);
    const currentMetrics = metrics();
    const lineOffsets = buildLineOffsets(source());
    const targetScroll = offsetToScrollTop(offset, currentMetrics.lineHeight, currentMetrics.paddingTop, lineOffsets);

    suppressSync();
    ta.scrollTop = targetScroll;
    setScrollTop(ta.scrollTop);
  };

  // --- Slash menu: handle item selection -----------------------------------
  const handleSlashSelect = (template: BlockTemplate) => {
    if (!ta) return;
    const result = slash.getReplacementForItem(template, ta);
    if (!result) return;
    setSource(result.newText);
    // Restore caret after source update
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(result.caretPos, result.caretPos);
      markEditingPoint(ta);
      updateCursorLine();
    });
  };

  onMount(() => {
    updateMetrics();
    window.addEventListener("resize", updateMetrics);

    // Preview → Source scroll sync
    const previewBody = document.querySelector(".pane-body.preview");
    const previewScrollHandler = () => syncPreviewToSource();
    if (previewBody) {
      previewBody.addEventListener("scroll", previewScrollHandler);
    }

    onCleanup(() => {
      window.removeEventListener("resize", updateMetrics);
      if (previewBody) {
        previewBody.removeEventListener("scroll", previewScrollHandler);
      }
    });
  });

  // Focus mode CSS class on the textarea wrapper
  const focusModeClass = () => focusMode() ? "focus-mode-active" : "";

  // ── Paste image handler ─────────────────────────────────────────────────
  const handlePaste = (e: ClipboardEvent) => {
    const file = imageFileFromPaste(e);
    if (!file) return; // Let the default text paste proceed
    e.preventDefault();
    void (async () => {
      const snippet = await ingestAndBuildSnippet(file, hintNameFromFile(file));
      if (!snippet || !ta) return;
      // Insert at cursor position in the source
      const pos = ta.selectionStart;
      const current = source();
      const before = current.slice(0, pos);
      const after = current.slice(ta.selectionEnd);
      // Ensure the image gets its own line
      const padBefore = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      const insertion = `${padBefore}${snippet}${padAfter}`;
      setSource(before + insertion + after);
    })();
  };

  // ── Drop image handler ──────────────────────────────────────────────────
  const handleDrop = (e: DragEvent) => {
    const files = imageFilesFromDrop(e);
    if (!files.length) return;
    e.preventDefault();
    void (async () => {
      for (const file of files) {
        const snippet = await ingestAndBuildSnippet(file, hintNameFromFile(file));
        if (snippet) {
          insertBlockAfter(null, snippet + "\n\n");
        }
      }
    })();
  };

  const handleDragOver = (e: DragEvent) => {
    // Allow drop by preventing default for image files
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.types.includes("Files")) {
      e.preventDefault();
      dt.dropEffect = "copy";
    }
  };

  return (
    <div class="pane">
      <div class="pane-header">
        <span>Source</span>
        <span class="header-actions">{props.layoutControls}</span>
      </div>
      <FindReplaceBar select={selectRange} />
      <div
        class={`pane-body source-editor ${focusModeClass()}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Show when={markerLine() !== null}>
          <div class="source-edit-marker" style={markerStyle()} aria-hidden="true" />
        </Show>
        <textarea
          ref={ta}
          class="source-editor-textarea mono"
          spellcheck={spellcheck()}
          value={source()}
          style={focusMode() ? {
            "--focus-cursor-line": String(cursorLine()),
            "--focus-total-lines": String(totalLines()),
          } as JSX.CSSProperties : undefined}
          onFocus={(e) => {
            updateMetrics();
            markEditingPoint(e.currentTarget);
            updateCursorLine();
          }}
          onInput={(e) => {
            setSource(e.currentTarget.value);
            markEditingPoint(e.currentTarget);
            updateCursorLine();
            scrollCursorToCenter();
            slash.update(e.currentTarget);
          }}
          onSelect={(e) => { markEditingPoint(e.currentTarget); updateCursorLine(); }}
          onKeyDown={(e) => {
            if (slash.handleKeyDown(e, e.currentTarget)) return;
          }}
          onKeyUp={(e) => {
            markEditingPoint(e.currentTarget);
            updateCursorLine();
            scrollCursorToCenter();
            slash.update(e.currentTarget);
          }}
          onMouseUp={(e) => { markEditingPoint(e.currentTarget); updateCursorLine(); }}
          onScroll={(e) => {
            setScrollTop(e.currentTarget.scrollTop);
            syncSourceToPreview();
          }}
          onBlur={() => {
            clearEditingPoint("source");
            slash.dismiss();
          }}
          onPaste={handlePaste}
        />
        <SlashMenu
          state={slash.state()}
          onSelect={handleSlashSelect}
          onDismiss={slash.dismiss}
        />
      </div>
    </div>
  );
};

