import { createEffect, createSignal, Index, Show } from "solid-js";
import {
  appendImageBlock,
  fileToDataUrl,
  insertBlockAfter,
  insertBlockAtStart,
  replaceBlockSource,
  useDocument,
} from "../../store/document";
import { InsertMenu } from "../InsertMenu";
import type { Block } from "../../ipc/types";
import { ImageBlockView } from "./ImageBlockView";

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
  let viewRef: HTMLDivElement | undefined;
  let taRef: HTMLTextAreaElement | undefined;

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
    setEditing(true);
  };

  const handleTaKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
    // Ctrl+Enter also commits.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitEdit((e.target as HTMLTextAreaElement).value);
    }
  };

  const autoResize = (ta: HTMLTextAreaElement) => {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  // ── image block: render the dedicated view (toolbar + drag-resize) ──
  if (props.block.kind === "image" && !editing()) {
    return (
      <div class="preview-row">
        <ImageBlockView block={props.block} onEditSource={() => setEditing(true)} />
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
    <div class="preview-row">
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
          onInput={(e) => autoResize(e.currentTarget)}
          onBlur={(e) => commitEdit(e.currentTarget.value)}
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
export const PreviewPane = () => {
  const doc = useDocument;
  const [dragOver, setDragOver] = createSignal(false);

  // Walk a DataTransfer/clipboard list and append each image as a block.
  const ingestFiles = async (files: FileList | File[] | null | undefined) => {
    if (!files) return 0;
    let count = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const url = await fileToDataUrl(f);
        const alt = (f.name || "image").replace(/\.[^.]+$/, "");
        appendImageBlock(url, alt);
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
          <InsertMenu
            block={null}
            label="at top"
            onPick={(snip) => insertBlockAtStart(snip)}
          />
        </span>
      </div>
      <div
        class="pane-body preview"
        classList={{ "drop-target": dragOver() }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onPaste={onPaste}
        tabIndex={0}
      >
        <Index each={doc().blocks}>
          {(block) => <PreviewBlockRow block={block()} />}
        </Index>
        <Show when={dragOver()}>
          <div class="preview-drop-overlay">Drop image to insert</div>
        </Show>
      </div>
    </div>
  );
};
