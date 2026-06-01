import { createEffect, createSignal, For, Index, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  clearEditingPoint,
  deleteBlocks,
  insertBlockAfter,
  insertBlockAtStart,
  isEditingPointInBlock,
  moveBlocksDown,
  moveBlocksUp,
  rangesForBlockIndex,
  removeBlockRange,
  replaceBlockSource,
  setEditingPoint,
  useAnnotations,
  useDocument,
  useEditingPoint,
} from "../../store/document";
import { InsertMenu } from "../InsertMenu";
import { charIndex, requestMarkToolbar, supportsMarks } from "../MarkToolbar";
import { fromEditableText, toEditableText } from "../../markdown/blockEdit";
import type { Block } from "../../ipc/types";
import { StickyHeader } from "../StickyHeader";
import { setActiveTopBlock, useStickyEnabled } from "../../store/stickyScroll";
import { useHoveredBlock, setHoveredBlock, clearHoveredBlock } from "../../store/hover";

// ── selection state (module-level so toolbar and rows share it) ─────────────
const [selected, setSelected] = createSignal<Set<string>>(new Set());

const toggleSelect = (id: string, multi: boolean) => {
  const cur = selected();
  if (!multi) {
    // Single-click without modifier: select only this block.
    setSelected(new Set(cur.has(id) && cur.size === 1 ? [] : [id]));
    return;
  }
  const next = new Set(cur);
  if (next.has(id)) next.delete(id); else next.add(id);
  setSelected(next);
};

const selectRange = (anchorId: string, targetId: string, blocks: Block[]) => {
  const ids = blocks.map((b) => b.id);
  const a = ids.indexOf(anchorId);
  const t = ids.indexOf(targetId);
  if (a < 0 || t < 0) return;
  const [lo, hi] = a <= t ? [a, t] : [t, a];
  setSelected(new Set(ids.slice(lo, hi + 1)));
};

// Track last-clicked for shift-range selection.
let lastClickedId: string | null = null;

// ── single block row ────────────────────────────────────────────────────────
const IrBlockRow = (props: { block: Block; index: number }) => {
  const editingPoint = useEditingPoint();
  const allAnnotations = useAnnotations();
  let ta: HTMLTextAreaElement | undefined;

  const isSelected = () => selected().has(props.block.id);
  const isEditingPoint = () => {
    const point = editingPoint();
    return !!point && point.pane !== "ir" && isEditingPointInBlock(point, props.block);
  };

  // Annotation ranges stored for this block, resolved against its current
  // source so the chips show the actual highlighted/colored text.
  const ranges = () => (allAnnotations(), rangesForBlockIndex(props.index));
  const rangeText = (start: number, end: number) =>
    Array.from(props.block.source).slice(start, end).join("");

  // Open the formatting popup for the current textarea selection.
  const offerFormatting = (e: MouseEvent, target = ta) => {
    if (!target || !supportsMarks(props.block.kind)) return;
    const { selectionStart, selectionEnd, value } = target;
    if (selectionStart === selectionEnd) return;
    requestMarkToolbar({
      blockIndex: props.index,
      start: charIndex(value, selectionStart),
      end: charIndex(value, selectionEnd),
      x: e.clientX,
      y: e.clientY + 12,
    });
  };

  const resize = () => {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  const markEditingPoint = (target = ta) => {
    if (!target) return;
    setEditingPoint({
      pane: "ir",
      sourceOffset: props.block.src_range[0] + target.selectionStart,
    });
  };

  createEffect(() => {
    const next = toEditableText(props.block);
    if (!ta) return;
    if (ta.value === next) return;
    const ss = ta.selectionStart;
    const se = ta.selectionEnd;
    ta.value = next;
    try { ta.setSelectionRange(ss, se); } catch { /* ignore */ }
    resize();
  });

  const handleRowClick = (e: MouseEvent) => {
    // Don't steal focus from the textarea itself.
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    const blocks = useDocument().blocks;
    if (e.shiftKey && lastClickedId) {
      selectRange(lastClickedId, props.block.id, blocks);
    } else {
      toggleSelect(props.block.id, e.ctrlKey || e.metaKey);
      lastClickedId = props.block.id;
    }
  };

  return (
    <div
      class="ir-block"
      data-block-id={props.block.id}
      classList={{ selected: isSelected(), "editing-point": isEditingPoint(), "om-hover-peer": useHoveredBlock()() === props.block.id }}
      onMouseEnter={() => setHoveredBlock(props.block.id)}
      onMouseLeave={() => clearHoveredBlock()}
      onClick={handleRowClick}
    >
      <div class="ir-block-head">
        {/* drag handle / selection indicator */}
        <span
          class="ir-drag-handle"
          title="Click to select · Shift+click range · Ctrl+click multi"
        >
          ⠿
        </span>
        <span class="ir-block-kind">{props.block.kind}</span>
        <span class="ir-block-id">#{props.block.id.slice(0, 10)}…</span>
        <span>
          [{props.block.src_range[0]}..{props.block.src_range[1]})
        </span>
        <span class="ir-block-spacer" />
        <InsertMenu
          block={props.block}
          label="below"
          onPick={(snip) => insertBlockAfter(props.block, snip)}
        />
      </div>
      <textarea
        ref={ta}
        class="ir-block-body"
        spellcheck={false}
        rows={1}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => markEditingPoint(e.currentTarget)}
        onSelect={(e) => markEditingPoint(e.currentTarget)}
        onKeyUp={(e) => markEditingPoint(e.currentTarget)}
        onMouseUp={(e) => {
          markEditingPoint(e.currentTarget);
          offerFormatting(e, e.currentTarget);
        }}
        onBlur={() => clearEditingPoint("ir")}
        onInput={(e) => {
          replaceBlockSource(props.block, fromEditableText(props.block, e.currentTarget.value));
          resize();
          markEditingPoint(e.currentTarget);
        }}
      />
      <Show when={ranges().length > 0}>
        <div class="ir-annotations" aria-label="IR annotations">
          <For each={ranges()}>
            {(range, i) => (
              <span class="ir-annotation-chip">
                <span class="ir-annotation-text">“{rangeText(range.start, range.end)}”</span>
                <For each={range.marks}>
                  {(mark) => <span class="ir-annotation-mark">{mark}</span>}
                </For>
                <button
                  type="button"
                  class="ir-annotation-remove"
                  title="Remove annotation"
                  aria-label="Remove annotation"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBlockRange(props.index, i());
                  }}
                >
                  ✕
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// ── selection toolbar ───────────────────────────────────────────────────────
const SelectionToolbar = () => {
  const sel = selected;
  const count = () => sel().size;

  return (
    <Show when={count() > 0}>
      <div class="ir-sel-toolbar">
        <span class="ir-sel-count">{count()} block{count() > 1 ? "s" : ""} selected</span>
        <button
          class="ir-sel-btn"
          title="Move up (Alt+↑)"
          onClick={() => moveBlocksUp(sel())}
        >
          ↑ Up
        </button>
        <button
          class="ir-sel-btn"
          title="Move down (Alt+↓)"
          onClick={() => moveBlocksDown(sel())}
        >
          ↓ Down
        </button>
        <button
          class="ir-sel-btn danger"
          title="Delete selected blocks"
          onClick={() => {
            deleteBlocks(sel());
            setSelected(new Set<string>());
          }}
        >
          🗑 Delete
        </button>
        <button
          class="ir-sel-btn"
          title="Clear selection (Esc)"
          onClick={() => setSelected(new Set<string>())}
        >
          ✕
        </button>
      </div>
    </Show>
  );
};

// ── pane root ───────────────────────────────────────────────────────────────
type PaneProps = {
  layoutControls?: JSX.Element;
};

export const IrPane = (props: PaneProps) => {
  const doc = useDocument;
  const stickyOn = useStickyEnabled();

  const handleIrScroll = (e: Event) => {
    if (!stickyOn()) return;
    const container = e.currentTarget as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const rows = container.querySelectorAll("[data-block-id]");
    for (const row of rows) {
      const rect = (row as HTMLElement).getBoundingClientRect();
      if (rect.bottom > containerRect.top) {
        setActiveTopBlock((row as HTMLElement).dataset.blockId ?? null);
        return;
      }
    }
  };

  // Keyboard shortcuts when focus is inside the IR pane.
  const handleKeyDown = (e: KeyboardEvent) => {
    const sel = selected();
    if (sel.size === 0) return;
    if (e.key === "Escape") { e.preventDefault(); setSelected(new Set<string>()); return; }
    if (e.altKey && e.key === "ArrowUp")   { e.preventDefault(); moveBlocksUp(sel); }
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); moveBlocksDown(sel); }
    if ((e.key === "Delete" || e.key === "Backspace") && e.ctrlKey) {
      e.preventDefault();
      deleteBlocks(sel);
      setSelected(new Set<string>());
    }
  };

  return (
    <div class="pane" onKeyDown={handleKeyDown}>
      <div class="pane-header">
        <span>IR</span>
        <span class="header-actions">
          {props.layoutControls}
          <InsertMenu
            block={null}
            label="at top"
            onPick={(snip) => insertBlockAtStart(snip)}
          />
        </span>
      </div>
      <SelectionToolbar />
      <div class="pane-body" onScroll={handleIrScroll}>
        <StickyHeader />
        <Index each={doc().blocks}>
          {(block, index) => <IrBlockRow block={block()} index={index} />}
        </Index>
      </div>
    </div>
  );
};
