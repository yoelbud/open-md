import { createEffect, createSignal, Index, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  appendImageBlock,
  clearEditingPoint,
  ingestImageFile,
  insertBlockAfter,
  insertBlockAtStart,
  isEditingPointInBlock,
  replaceBlockSource,
  resetPreviewTypography,
  setEditingPoint,
  setPreviewTypography,
  useDocument,
  useEditingPoint,
  usePreviewSettings,
} from "../../store/document";
import { InsertMenu } from "../InsertMenu";
import type { Block, PreviewContentWidth, PreviewFontFamily } from "../../ipc/types";
import { exportPreviewPdf } from "../../ipc/previewPdf";
import { parseMarkdownTable } from "../../markdown/table";
import { ImageBlockView } from "./ImageBlockView";
import { TableBlockView } from "./TableBlockView";

const FONT_OPTIONS: { id: PreviewFontFamily; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const WIDTH_OPTIONS: { id: PreviewContentWidth; label: string }[] = [
  { id: "readable", label: "Readable" },
  { id: "wide", label: "Wide" },
  { id: "fluid", label: "Fluid" },
];

const PREVIEW_FONT_CSS: Record<PreviewFontFamily, string> = {
  sans: "var(--sans)",
  serif: "var(--serif)",
  mono: "var(--mono)",
};

const PREVIEW_WIDTH_CSS: Record<PreviewContentWidth, string> = {
  fluid: "none",
  readable: "760px",
  wide: "1040px",
};

// ── view → markdown round-trip (M0 stub, replaced by Rust in M4) ──────────
const textToMarkdown = (block: Block, text: string): string => {
  const trimmed = text.replace(/\u00a0/g, " ").trimEnd();
  const trailing = block.source.endsWith("\n") ? "\n" : "";
  switch (block.kind) {
    case "heading": {
      const m = /^(#{1,6})\s/.exec(block.source);
      return `${m ? m[1] : "#"} ${trimmed}${trailing}`;
    }
    case "block_quote":
      return trimmed.split(/\n/).map((l) => `> ${l}`).join("\n") + trailing;
    case "list":
    case "task_list":
      return trimmed.split(/\n/).map((l) => l.trim() ? `- ${l}` : l).join("\n") + trailing;
    case "code": {
      const m = /^```(\w*)/.exec(block.source);
      return `\`\`\`${m ? m[1] : ""}\n${trimmed}\n\`\`\`${trailing}`;
    }
    case "thematic_break":
      return block.source;
    default:
      return trimmed + trailing;
  }
};

// ── single block row ────────────────────────────────────────────────────────
const PreviewBlockRow = (props: { block: Block }) => {
  const [editing, setEditing] = createSignal(false);
  const editingPoint = useEditingPoint();
  let viewRef: HTMLDivElement | undefined;
  let taRef: HTMLTextAreaElement | undefined;

  const isEditingPoint = () => {
    const point = editingPoint();
    return !!point && point.pane !== "preview" && isEditingPointInBlock(point, props.block);
  };

  const markEditingPoint = (offset = 0) => {
    setEditingPoint({
      pane: "preview",
      sourceOffset: props.block.src_range[0] + offset,
    });
  };

  const markTextareaEditingPoint = (target = taRef) => {
    if (!target) return;
    markEditingPoint(target.selectionStart);
  };

  const startSourceEdit = () => {
    markEditingPoint();
    setEditing(true);
  };

  // Keep view HTML in sync when source changes externally (not while editing).
  createEffect(() => {
    const html = props.block.html;
    if (!viewRef || editing()) return;
    if (viewRef.innerHTML !== html) viewRef.innerHTML = html;
  });

  // Auto-focus + select textarea when entering edit mode.
  createEffect(() => {
    if (editing() && taRef) {
      taRef.style.height = "auto";
      taRef.style.height = taRef.scrollHeight + "px";
      taRef.focus();
      markTextareaEditingPoint(taRef);
    }
  });

  const commitEdit = (val: string) => {
    const next = textToMarkdown(props.block, val);
    if (next !== props.block.source) replaceBlockSource(props.block, next);
    setEditing(false);
  };

  const handleViewClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // If the user clicked a link, open it instead of entering edit mode.
    const anchor = target.closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (href) window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    // Inline images (inside a paragraph): don't enter edit mode on the image
    // itself — open it in a new tab. To edit, click around the image.
    if (target.tagName === "IMG") {
      e.preventDefault();
      const src = (target as HTMLImageElement).src;
      if (src) window.open(src, "_blank", "noopener,noreferrer");
      return;
    }
    startSourceEdit();
  };

  const handleTaKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      clearEditingPoint("preview");
    }
    // Ctrl+Enter also commits.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitEdit((e.target as HTMLTextAreaElement).value);
      clearEditingPoint("preview");
    }
  };

  const autoResize = (ta: HTMLTextAreaElement) => {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  // ── image block: render the dedicated view (toolbar + drag-resize) ──
  if (props.block.kind === "image" && !editing()) {
    return (
      <div
        class="preview-row"
        classList={{ "editing-point": isEditingPoint() }}
        onFocusIn={() => markEditingPoint()}
        onFocusOut={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            clearEditingPoint("preview");
          }
        }}
      >
        <ImageBlockView block={props.block} onEditSource={startSourceEdit} />
        <div class="preview-row-actions">
          <InsertMenu
            block={props.block}
            label=""
            onPick={(snip) => insertBlockAfter(props.block, snip)}
          />
        </div>
      </div>
    );
  }

  if (
    props.block.kind === "table" &&
    !editing() &&
    (props.block.preview?.table || parseMarkdownTable(props.block.source))
  ) {
    return (
      <div
        class="preview-row"
        classList={{ "editing-point": isEditingPoint() }}
        onFocusIn={() => markEditingPoint()}
        onFocusOut={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            clearEditingPoint("preview");
          }
        }}
      >
        <TableBlockView block={props.block} onEditSource={startSourceEdit} />
        <div class="preview-row-actions">
          <InsertMenu
            block={props.block}
            label=""
            onPick={(snip) => insertBlockAfter(props.block, snip)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      class="preview-row"
      classList={{ "editing-point": isEditingPoint() }}
      onFocusIn={() => markEditingPoint()}
      onFocusOut={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearEditingPoint("preview");
        }
      }}
    >
      <div
        ref={viewRef}
        class="preview-block"
        classList={{ hidden: editing() }}
        title="Click to edit · links open in new tab"
        onClick={handleViewClick}
      />

      {/* ── edit mode ── */}
      {editing() && (
        <textarea
          ref={taRef}
          class="preview-edit-ta"
          spellcheck={false}
          rows={1}
          value={props.block.source.trimEnd()}
          onFocus={(e) => markTextareaEditingPoint(e.currentTarget)}
          onInput={(e) => {
            autoResize(e.currentTarget);
            markTextareaEditingPoint(e.currentTarget);
          }}
          onSelect={(e) => markTextareaEditingPoint(e.currentTarget)}
          onKeyUp={(e) => markTextareaEditingPoint(e.currentTarget)}
          onMouseUp={(e) => markTextareaEditingPoint(e.currentTarget)}
          onBlur={(e) => {
            commitEdit(e.currentTarget.value);
            clearEditingPoint("preview");
          }}
          onKeyDown={handleTaKeyDown}
        />
      )}

      <div class="preview-row-actions">
        <Show when={editing()}>
          <span class="preview-edit-hint">Esc / Ctrl+Enter</span>
        </Show>
        <InsertMenu
          block={props.block}
          label=""
          onPick={(snip) => insertBlockAfter(props.block, snip)}
        />
      </div>
    </div>
  );
};

// ── pane root ────────────────────────────────────────────────────────────────
type PaneProps = {
  layoutControls?: JSX.Element;
};

const PreviewToolbar = () => {
  const settings = usePreviewSettings();

  return (
    <div class="preview-toolbar" aria-label="Preview typography controls">
      <label class="preview-tool">
        <span>Font</span>
        <select
          value={settings().fontFamily}
          onChange={(e) =>
            setPreviewTypography({ fontFamily: e.currentTarget.value as PreviewFontFamily })
          }
        >
          {FONT_OPTIONS.map((option) => (
            <option value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label class="preview-tool preview-tool-range">
        <span>Size</span>
        <input
          type="range"
          min="12"
          max="28"
          step="1"
          value={settings().fontSizePx}
          onInput={(e) => setPreviewTypography({ fontSizePx: e.currentTarget.valueAsNumber })}
        />
        <output>{settings().fontSizePx}px</output>
      </label>
      <label class="preview-tool preview-tool-range">
        <span>Line</span>
        <input
          type="range"
          min="1.2"
          max="2.2"
          step="0.05"
          value={settings().lineHeight}
          onInput={(e) => setPreviewTypography({ lineHeight: e.currentTarget.valueAsNumber })}
        />
        <output>{settings().lineHeight.toFixed(2)}</output>
      </label>
      <div class="preview-width-tools" role="group" aria-label="Preview width">
        {WIDTH_OPTIONS.map((option) => (
          <button
            type="button"
            classList={{ active: settings().contentWidth === option.id }}
            onClick={() => setPreviewTypography({ contentWidth: option.id })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button type="button" class="preview-reset-btn" onClick={resetPreviewTypography}>
        Reset
      </button>
    </div>
  );
};

export const PreviewPane = (props: PaneProps) => {
  const doc = useDocument;
  const settings = usePreviewSettings();
  const [dragOver, setDragOver] = createSignal(false);

  const previewStyle = () => ({
    "--preview-font-family": PREVIEW_FONT_CSS[settings().fontFamily],
    "--preview-font-size": `${settings().fontSizePx}px`,
    "--preview-line-height": `${settings().lineHeight}`,
    "--preview-content-width": PREVIEW_WIDTH_CSS[settings().contentWidth],
  }) as JSX.CSSProperties;

  // Walk a DataTransfer/clipboard list and append each image as a block.
  const ingestFiles = async (files: FileList | File[] | null | undefined) => {
    if (!files) return 0;
    let count = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const path = await ingestImageFile(f);
        const alt = (f.name || "image").replace(/\.[^.]+$/, "");
        appendImageBlock(path, alt);
        count++;
      } catch { /* skip */ }
    }
    return count;
  };

  const onDrop = async (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
    if (!hasFiles) return;
    e.preventDefault();
    setDragOver(false);
    await ingestFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      await ingestFiles(files);
    }
  };

  return (
    <div class="pane">
      <div class="pane-header">
        <span>Preview</span>
        <span class="header-actions">
          {props.layoutControls}
          <button
            type="button"
            class="pane-action-btn"
            title="Export preview as PDF (Ctrl+P)"
            aria-label="Export preview as PDF"
            onClick={exportPreviewPdf}
          >
            PDF
          </button>
          <InsertMenu
            block={null}
            label="at top"
            onPick={(snip) => insertBlockAtStart(snip)}
          />
        </span>
      </div>
      <PreviewToolbar />
      <div
        class="pane-body preview"
        classList={{ "drop-target": dragOver() }}
        style={previewStyle()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onPaste={onPaste}
        tabIndex={0}
      >
        <div class="preview-document">
          <Index each={doc().blocks}>
            {(block) => <PreviewBlockRow block={block()} />}
          </Index>
        </div>
        <Show when={dragOver()}>
          <div class="preview-drop-overlay">Drop image to insert</div>
        </Show>
      </div>
    </div>
  );
};
