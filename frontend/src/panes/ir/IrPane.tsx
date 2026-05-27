import { createEffect, createSignal, Index, Show } from "solid-js";
import {
  deleteBlocks,
  insertBlockAfter,
  insertBlockAtStart,
  moveBlocksDown,
  moveBlocksUp,
  replaceBlockSource,
  useDocument,
} from "../../store/document";
import { InsertMenu } from "../InsertMenu";
import type { Block } from "../../ipc/types";

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
const IrBlockRow = (props: { block: Block }) => {
  let ta: HTMLTextAreaElement | undefined;

  const isSelected = () => selected().has(props.block.id);

  const resize = () => {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  createEffect(() => {
    const next = props.block.source.replace(/\n$/, "");
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
      classList={{ selected: isSelected() }}
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
        onInput={(e) => {
          const hadTrailing = props.block.source.endsWith("\n");
          replaceBlockSource(props.block, e.currentTarget.value + (hadTrailing ? "\n" : ""));
          resize();
        }}
      />
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
export const IrPane = () => {
  const doc = useDocument;

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
          <InsertMenu
            block={null}
            label="at top"
            onPick={(snip) => insertBlockAtStart(snip)}
          />
        </span>
      </div>
      <SelectionToolbar />
      <div class="pane-body">
        <Index each={doc().blocks}>
          {(block) => <IrBlockRow block={block()} />}
        </Index>
      </div>
    </div>
  );
};
