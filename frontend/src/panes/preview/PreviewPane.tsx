import { createEffect, createSignal, Index, onCleanup, Show } from "solid-js";
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
  setPreviewMode,
  setPreviewTypography,
  useDocument,
  useEditingPoint,
  usePreviewMode,
  usePreviewSettings,
} from "../../store/document";
import { InsertMenu } from "../InsertMenu";
import { charIndex, requestMarkToolbar, supportsMarks } from "../MarkToolbar";
import type { Block, PreviewContentWidth, PreviewFontFamily, RenderMode } from "../../ipc/types";
import { exportPreviewPdf } from "../../ipc/previewPdf";
import { parseMarkdownTable } from "../../markdown/table";
import { fromEditableText, toEditableText } from "../../markdown/blockEdit";
import { ImageBlockView } from "./ImageBlockView";
import { TableBlockView } from "./TableBlockView";
import { extractHeadings, isTocToken, renderTocHtml } from "../../store/outline";
import {
  extractBibliography,
  isBibliographyToken,
  replaceCitationTokens,
  renderReferencesHtml,
} from "../../store/citations";
import { splitInlineMath } from "../../store/mathInline";
import { setupFootnoteTooltip } from "./footnotes";
import {
  buildAnchorMap,
  parseAnchor,
  replaceRefTokens,
  stripAnchorFromHtml,
} from "./blockRefs";
import {
  useDiffMode,
  useDiffEntries,
  useDiffSummary,
  diffStatusForBlock,
} from "../../store/diff";
import { addComment, useCommentsForBlock } from "../../store/comments";
import { usePagedMode, usePageConfig } from "../../store/pagination";
import { isPageBreakBlock, pageFrameClasses } from "../../export/pagination";
import "katex/dist/katex.min.css";

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

type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | undefined;

const loadMermaid = async (): Promise<MermaidApi> => {
  mermaidPromise ??= import("mermaid").then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
    });
    return module.default;
  });
  return mermaidPromise;
};

// ── KaTeX lazy loader ────────────────────────────────────────────────────────
type KatexApi = typeof import("katex");

let katexPromise: Promise<KatexApi> | undefined;

const loadKatex = async (): Promise<KatexApi> => {
  katexPromise ??= import("katex");
  return katexPromise;
};

const renderMermaidBlocks = async (root: HTMLElement, blockId: string, version: number) => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-om-mermaid]"));
  if (!nodes.length) return;

  try {
    const mermaid = await loadMermaid();
    await Promise.all(nodes.map(async (node, index) => {
      if (!root.isConnected || root.dataset.mermaidVersion !== String(version)) return;
      const source = node.textContent ?? "";
      const renderId = `om-mermaid-${blockId.replace(/[^A-Za-z0-9_-]/g, "-")}-${version}-${index}`;
      const rendered = await mermaid.render(renderId, source);
      if (!root.isConnected || root.dataset.mermaidVersion !== String(version)) return;
      node.innerHTML = rendered.svg;
      node.removeAttribute("data-om-mermaid");
      rendered.bindFunctions?.(node);
    }));
  } catch (err) {
    if (!root.isConnected || root.dataset.mermaidVersion !== String(version)) return;
    const message = err instanceof Error ? err.message : String(err);
    for (const node of nodes) {
      const source = node.textContent ?? "";
      node.replaceChildren();

      const error = document.createElement("div");
      error.className = "om-mermaid-error";
      error.setAttribute("role", "alert");
      error.textContent = `Mermaid render failed: ${message}`;

      const details = document.createElement("pre");
      details.className = "om-mermaid-source";
      details.textContent = source;

      node.classList.add("om-mermaid-failed");
      node.removeAttribute("data-om-mermaid");
      node.append(error, details);
    }
  }
};

// ── KaTeX display-math rendering ────────────────────────────────────────────
const renderMathBlocks = async (root: HTMLElement, version: number) => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-om-math=\"display\"]"));
  if (!nodes.length) return;

  try {
    const katex = await loadKatex();
    for (const node of nodes) {
      if (!root.isConnected || root.dataset.mermaidVersion !== String(version)) return;
      const tex = node.textContent ?? "";
      try {
        node.innerHTML = katex.renderToString(tex, { displayMode: true, throwOnError: false });
      } catch {
        node.innerHTML = `<div class="om-math-error" role="alert">Math render error</div><pre class="om-math-source">${tex}</pre>`;
      }
      node.removeAttribute("data-om-math");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const node of nodes) {
      const tex = node.textContent ?? "";
      node.innerHTML = `<div class="om-math-error" role="alert">KaTeX load failed: ${message}</div><pre class="om-math-source">${tex}</pre>`;
      node.removeAttribute("data-om-math");
    }
  }
};

// ── KaTeX inline-math rendering ─────────────────────────────────────────────
const renderInlineMath = async (root: HTMLElement, version: number) => {
  // Walk text nodes, skip <code>, <pre>, and already-rendered math
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("code, pre, [data-om-math], .katex")) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !node.textContent.includes("$")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  if (!textNodes.length) return;

  let katex: KatexApi | undefined;
  try {
    katex = await loadKatex();
  } catch {
    return;
  }

  for (const textNode of textNodes) {
    if (!root.isConnected || root.dataset.mermaidVersion !== String(version)) return;
    const text = textNode.textContent ?? "";
    const segments = splitInlineMath(text);
    if (segments.length <= 1 && segments[0]?.type === "text") continue;
    if (!segments.some((s) => s.type === "math")) continue;

    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      if (seg.type === "text") {
        frag.appendChild(document.createTextNode(seg.value));
      } else {
        const span = document.createElement("span");
        span.setAttribute("data-om-math", "inline");
        try {
          span.innerHTML = katex.renderToString(seg.value, { displayMode: false, throwOnError: false });
        } catch {
          span.textContent = `$${seg.value}$`;
          span.className = "om-math-error-inline";
        }
        frag.appendChild(span);
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
};

// ── single block row ────────────────────────────────────────────────────────
const PreviewBlockRow = (props: { block: Block; index: number }) => {
  const [editing, setEditing] = createSignal(false);
  const editingPoint = useEditingPoint();
  const previewMode = usePreviewMode();
  let viewRef: HTMLDivElement | undefined;
  let taRef: HTMLTextAreaElement | undefined;
  let renderVersion = 0;

  const isEditingPoint = () => {
    const point = editingPoint();
    return !!point && point.pane !== "preview" && isEditingPointInBlock(point, props.block);
  };

  // Diff-mode status classes (added / modified / moved) for this block.
  const diffClasses = (): Record<string, boolean> => {
    const entry = diffStatusForBlock(props.block.id);
    return {
      "om-diff-added": entry?.status === "added",
      "om-diff-modified": entry?.status === "modified",
      "om-diff-moved": entry?.status === "moved",
    };
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
  // Markdown mode renders the plain, standard-Markdown HTML; rich mode renders
  // the IR-enriched HTML with the annotation overlay.
  // Special case: [TOC] paragraph blocks render an auto table-of-contents.
  const doc = useDocument;
  createEffect(() => {
    let html = previewMode() === "markdown" ? props.block.plain_html : props.block.html;
    if (isTocToken(props.block)) {
      const headings = extractHeadings(doc().blocks);
      html = renderTocHtml(headings);
    }
    // ── Citations: bibliography token renders the references list ──
    const blocks = doc().blocks;
    if (isBibliographyToken(props.block)) {
      const registry = extractBibliography(blocks);
      // Collect all cited keys by scanning all non-bib block HTML
      const citedKeys = new Set<string>();
      for (const b of blocks) {
        if (b.id === props.block.id) continue;
        const bHtml = previewMode() === "markdown" ? b.plain_html : b.html;
        replaceCitationTokens(bHtml, registry, (k) => citedKeys.add(k));
      }
      html = renderReferencesHtml(registry, citedKeys);
    }
    if (!viewRef || editing()) return;

    // ── Block references: strip anchor markers & resolve transclusions ──
    const anchor = parseAnchor(props.block.source);
    if (anchor) {
      html = stripAnchorFromHtml(html);
    }

    // Resolve embed/link tokens using the document-wide anchor map.
    const anchorMap = buildAnchorMap(blocks);
    const resolver = (blockId: string): string | null => {
      const target = blocks.find((b) => b.id === blockId);
      if (!target) return null;
      const targetHtml = previewMode() === "markdown" ? target.plain_html : target.html;
      return stripAnchorFromHtml(targetHtml);
    };
    html = replaceRefTokens(html, anchorMap, resolver);

    // ── Inline citations: resolve [@key] tokens ──
    if (!isBibliographyToken(props.block)) {
      const bibRegistry = extractBibliography(blocks);
      if (bibRegistry.size > 0) {
        html = replaceCitationTokens(html, bibRegistry, () => {});
      }
    }

    renderVersion += 1;
    viewRef.dataset.mermaidVersion = String(renderVersion);
    viewRef.innerHTML = html;
    void renderMermaidBlocks(viewRef, props.block.id, renderVersion);
    if (previewMode() === "rich") {
      void renderMathBlocks(viewRef, renderVersion);
      void renderInlineMath(viewRef, renderVersion);
    }
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
    const next = fromEditableText(props.block, val);
    if (next !== props.block.source) replaceBlockSource(props.block, next);
    setEditing(false);
  };

  // When the user selects text inside the rendered (rich) view, offer the
  // formatting popup instead of entering edit mode. The selected text is located
  // in the block's clean source to derive character offsets for the IR layer.
  const offerFormatting = (e: MouseEvent): boolean => {
    if (previewMode() !== "rich" || !supportsMarks(props.block.kind) || !viewRef) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!viewRef.contains(range.commonAncestorContainer)) return false;
    const text = selection.toString();
    if (!text.trim()) return false;
    const idx = props.block.source.indexOf(text);
    if (idx < 0) return false;
    requestMarkToolbar({
      blockIndex: props.index,
      start: charIndex(props.block.source, idx),
      end: charIndex(props.block.source, idx + text.length),
      x: e.clientX,
      y: e.clientY + 12,
    });
    return true;
  };

  // A drag-selection ends with `mouseup` but does NOT emit a `click`, so the
  // formatting popup must be offered here. When it opens, suppress the click
  // that may follow a same-spot release so we don't also drop into edit mode.
  let suppressNextClick = false;
  const handleViewMouseUp = (e: MouseEvent) => {
    if (offerFormatting(e)) suppressNextClick = true;
  };

  const handleViewClick = (e: MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
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
  if (props.block.kind === "image" && !editing() && previewMode() === "rich") {
    return (
      <div
        class="preview-row"
        data-block-id={props.block.id}
        classList={{ "editing-point": isEditingPoint(), ...diffClasses() }}
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
    previewMode() === "rich" &&
    (props.block.preview?.table || parseMarkdownTable(props.block.source))
  ) {
    return (
      <div
        class="preview-row"
        data-block-id={props.block.id}
        classList={{ "editing-point": isEditingPoint(), ...diffClasses() }}
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

  // Derive anchor name for this block (used for container attributes).
  const anchorName = () => parseAnchor(props.block.source);

  // ── comment indicator ──
  const blockComments = useCommentsForBlock(() => props.block.id);
  const hasComments = () => blockComments().length > 0;

  const handleAddComment = () => {
    // Capture any text selection as the quote
    let quote: string | undefined;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && viewRef?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      if (text) quote = text;
    }
    const body = prompt("Add a comment:");
    if (body?.trim()) {
      const payload: Parameters<typeof addComment>[0] = { blockId: props.block.id, body: body.trim() };
      if (quote) payload.quote = quote;
      addComment(payload);
    }
  };

  return (
    <div
      class="preview-row"
      data-block-id={props.block.id}
      data-om-anchor={anchorName() ?? undefined}
      id={anchorName() ? `ref-${anchorName()}` : undefined}
      classList={{ "editing-point": isEditingPoint(), "om-has-comment": hasComments(), ...diffClasses() }}
      onFocusIn={() => markEditingPoint()}
      onFocusOut={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearEditingPoint("preview");
        }
      }}
    >
      <Show when={hasComments()}>
        <span class="om-comment-badge" title={`${blockComments().length} comment(s)`}>
          {blockComments().length}
        </span>
      </Show>
      <div
        ref={viewRef}
        class="preview-block"
        classList={{ hidden: editing() }}
        title="Click to edit · select text to format · links open in new tab"
        onMouseUp={handleViewMouseUp}
        onClick={handleViewClick}
      />

      {/* ── edit mode ── */}
      {editing() && (
        <textarea
          ref={taRef}
          class="preview-edit-ta"
          spellcheck={false}
          rows={1}
          value={toEditableText(props.block)}
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
        <button
          type="button"
          class="preview-row-comment-btn"
          title="Add comment"
          onClick={(e) => { e.stopPropagation(); handleAddComment(); }}
        >
          💬
        </button>
        <InsertMenu
          block={props.block}
          label=""
          onPick={(snip) => insertBlockAfter(props.block, snip)}
        />
      </div>
    </div>
  );
};

// ── diff ghost row (a block that was removed since the baseline) ──────────────
const PreviewGhostRow = (props: { block: Block }) => {
  let ref: HTMLDivElement | undefined;
  createEffect(() => {
    if (ref) ref.innerHTML = props.block.html;
  });
  return (
    <div class="preview-row om-diff-removed" aria-label="Removed block">
      <div ref={ref} class="preview-block om-diff-ghost" />
    </div>
  );
};

// ── diff summary banner ──────────────────────────────────────────────────────
const DiffSummaryBanner = () => {
  const summary = useDiffSummary;
  return (
    <div class="om-diff-summary" role="status">
      <span class="om-diff-summary-title">Changes vs. last saved</span>
      <span class="om-diff-summary-added">+{summary().added}</span>
      <span class="om-diff-summary-removed">−{summary().removed}</span>
      <span class="om-diff-summary-modified">~{summary().modified}</span>
      <Show when={summary().moved > 0}>
        <span class="om-diff-summary-moved">⇄{summary().moved}</span>
      </Show>
    </div>
  );
};

// ── paged layout: group blocks into page frames at explicit page breaks ──────
const PagedDocument = (props: { blocks: Block[] }) => {
  const pages = () => {
    const result: { block: Block; index: number }[][] = [];
    let current: { block: Block; index: number }[] = [];
    props.blocks.forEach((block, index) => {
      if (isPageBreakBlock(block.source)) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push({ block, index });
    });
    if (current.length) result.push(current);
    return result.length ? result : [[]];
  };

  return (
    <div class="preview-document">
      <Index each={pages()}>
        {(page, pageIndex) => (
          <div class={pageFrameClasses(usePageConfig()())}>
            <Index each={page()}>
              {(item) => <PreviewBlockRow block={item().block} index={item().index} />}
            </Index>
            <div class="om-page-footer">
              Page {pageIndex + 1} of {pages().length}
            </div>
          </div>
        )}
      </Index>
    </div>
  );
};

// ── pane root ────────────────────────────────────────────────────────────────
type PaneProps = {
  layoutControls?: JSX.Element;
};

const MODE_OPTIONS: { id: RenderMode; label: string }[] = [
  { id: "rich", label: "Rich" },
  { id: "markdown", label: "Markdown" },
];

const PreviewToolbar = () => {
  const settings = usePreviewSettings();
  const previewMode = usePreviewMode();

  return (
    <div class="preview-toolbar" aria-label="Preview controls">
      <div class="preview-mode-tools" role="group" aria-label="Preview render mode">
        {MODE_OPTIONS.map((option) => (
          <button
            type="button"
            classList={{ active: previewMode() === option.id }}
            onClick={() => setPreviewMode(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
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
  let previewBodyRef: HTMLDivElement | undefined;

  // Set up footnote hover-preview tooltip on the preview container.
  createEffect(() => {
    if (!previewBodyRef) return;
    const cleanup = setupFootnoteTooltip(previewBodyRef);
    onCleanup(cleanup);
  });

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

  // Handle click on [data-om-copy] buttons (code block copy)
  const handlePreviewClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest("[data-om-copy]") as HTMLButtonElement | null;
    if (!copyBtn) return;
    e.stopPropagation();
    const figure = copyBtn.closest("figure.om-code");
    const code = figure?.querySelector("pre code");
    const text = code?.textContent ?? "";
    if (text && typeof navigator?.clipboard?.writeText === "function") {
      void navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      });
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
        ref={previewBodyRef}
        class="pane-body preview"
        classList={{ "drop-target": dragOver(), "om-paged-preview": usePagedMode()() }}
        style={previewStyle()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onPaste={onPaste}
        onClick={handlePreviewClick}
        tabIndex={0}
      >
        <Show when={useDiffMode()() && !usePagedMode()()}>
          <DiffSummaryBanner />
        </Show>
        <Show
          when={usePagedMode()()}
          fallback={
            <div class="preview-document">
              <Show
                when={useDiffMode()()}
                fallback={
                  <Index each={doc().blocks}>
                    {(block, index) => <PreviewBlockRow block={block()} index={index} />}
                  </Index>
                }
              >
                <Index each={useDiffEntries()}>
                  {(entry) => {
                    const e = entry();
                    if (e.status === "removed" && e.oldBlock) {
                      return <PreviewGhostRow block={e.oldBlock} />;
                    }
                    const id = e.newBlock?.id;
                    const live = doc().blocks.findIndex((b) => b.id === id);
                    return (
                      <Show when={live >= 0}>
                        <PreviewBlockRow block={doc().blocks[live]!} index={live} />
                      </Show>
                    );
                  }}
                </Index>
              </Show>
            </div>
          }
        >
          <PagedDocument blocks={doc().blocks} />
        </Show>
        <Show when={dragOver()}>
          <div class="preview-drop-overlay">Drop image to insert</div>
        </Show>
      </div>
    </div>
  );
};
