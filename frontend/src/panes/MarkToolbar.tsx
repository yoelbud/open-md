// Floating rich-formatting toolbar shared by the Preview and IR panes. It edits
// the IR annotation layer (highlight + text/background color) for a selected
// character span, never touching the Markdown body.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  clearMarks,
  MARK_COLORS,
  rangesForBlockIndex,
  setBackground,
  setForeground,
  toggleHighlight,
  type MarkColor,
} from "../store/document";

/** A pending formatting request: which block + character span, and where to pop. */
export interface MarkTarget {
  /** 0-based segmented block index the span belongs to. */
  blockIndex: number;
  /** Inclusive start character offset into the block's clean source. */
  start: number;
  /** Exclusive end character offset into the block's clean source. */
  end: number;
  /** Viewport anchor coordinates for the popup. */
  x: number;
  y: number;
}

const [target, setTarget] = createSignal<MarkTarget | null>(null);

export const useMarkTarget = () => target;
export const requestMarkToolbar = (next: MarkTarget) => setTarget(next);
export const closeMarkToolbar = () => setTarget(null);

// Block kinds whose clean source accepts an inline annotation overlay (mirrors
// `overlay_eligible` in `crates/om-render`).
const OVERLAY_KINDS = new Set([
  "paragraph",
  "heading",
  "list",
  "task_list",
  "block_quote",
]);

/** Whether a block kind supports the rich inline formatting overlay. */
export const supportsMarks = (kind: string): boolean => OVERLAY_KINDS.has(kind);

/** Convert a UTF-16 index into a Unicode scalar (char) offset, matching Rust. */
export const charIndex = (source: string, utf16: number): number =>
  Array.from(source.slice(0, utf16)).length;

// Marks currently covering the targeted span (a range fully covering it).
const activeMarks = (t: MarkTarget): Set<string> => {
  const marks = new Set<string>();
  for (const range of rangesForBlockIndex(t.blockIndex)) {
    if (range.start <= t.start && range.end >= t.end) {
      for (const mark of range.marks) marks.add(mark);
    }
  }
  return marks;
};

const Swatch = (props: {
  color: MarkColor;
  active: boolean;
  kind: "fg" | "bg";
  onPick: (color: MarkColor) => void;
}) => (
  <button
    type="button"
    class="om-swatch"
    classList={{ active: props.active, [`om-${props.kind}-${props.color}`]: true }}
    title={props.color}
    aria-label={`${props.kind === "fg" ? "Text" : "Background"} ${props.color}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => props.onPick(props.color)}
  >
    {props.kind === "fg" ? "A" : ""}
  </button>
);

type SubMenu = "fg" | "bg" | null;

export const MarkToolbar = () => {
  let ref: HTMLDivElement | undefined;
  // Which color submenu is expanded. Colors stay hidden until the user opens
  // one, keeping the toolbar compact.
  const [open, setOpen] = createSignal<SubMenu>(null);

  const onPointerDown = (e: PointerEvent) => {
    if (ref && !ref.contains(e.target as Node)) closeMarkToolbar();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (open()) setOpen(null);
      else closeMarkToolbar();
    }
  };

  onMount(() => {
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
  });
  onCleanup(() => {
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown);
  });

  // Collapse any open submenu whenever the popup re-anchors to a new selection.
  createEffect(() => {
    target();
    setOpen(null);
  });

  const toggleMenu = (menu: Exclude<SubMenu, null>) =>
    setOpen((current) => (current === menu ? null : menu));

  return (
    <Show when={target()}>
      {(t) => {
        const marks = () => activeMarks(t());
        const fg = () => [...marks()].find((m) => m.startsWith("fg-"))?.slice(3) ?? null;
        const bg = () => [...marks()].find((m) => m.startsWith("bg-"))?.slice(3) ?? null;
        const left = () => Math.min(Math.max(8, t().x), window.innerWidth - 260);
        const top = () => Math.min(Math.max(8, t().y), window.innerHeight - 200);

        return (
          <div
            ref={ref}
            class="om-mark-toolbar"
            style={{ left: `${left()}px`, top: `${top()}px` }}
            role="toolbar"
            aria-label="Text formatting"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div class="om-mark-row">
              <button
                type="button"
                class="om-mark-btn"
                classList={{ active: marks().has("highlight") }}
                title="Highlight"
                onClick={() => toggleHighlight(t().blockIndex, t().start, t().end)}
              >
                <span class="om-mark-hl">H</span>
              </button>

              <button
                type="button"
                class="om-mark-btn om-mark-menu-btn"
                classList={{ active: open() === "fg" || fg() !== null }}
                title="Text color"
                aria-haspopup="true"
                aria-expanded={open() === "fg"}
                onClick={() => toggleMenu("fg")}
              >
                <span class="om-mark-swatch-preview" classList={{ [`om-fg-${fg()}`]: fg() !== null }}>
                  A
                </span>
                <span class="om-mark-caret">▾</span>
              </button>

              <button
                type="button"
                class="om-mark-btn om-mark-menu-btn"
                classList={{ active: open() === "bg" || bg() !== null }}
                title="Background color"
                aria-haspopup="true"
                aria-expanded={open() === "bg"}
                onClick={() => toggleMenu("bg")}
              >
                <span
                  class="om-mark-fill-preview"
                  classList={{ [`om-bg-${bg()}`]: bg() !== null }}
                />
                <span class="om-mark-caret">▾</span>
              </button>

              <button
                type="button"
                class="om-mark-btn danger"
                title="Clear formatting"
                onClick={() => {
                  clearMarks(t().blockIndex, t().start, t().end);
                  closeMarkToolbar();
                }}
              >
                ✕
              </button>
            </div>

            <Show when={open() === "fg"}>
              <div class="om-mark-swatches" role="group" aria-label="Text color">
                <For each={MARK_COLORS}>
                  {(color) => (
                    <Swatch
                      color={color}
                      kind="fg"
                      active={fg() === color}
                      onPick={(c) => {
                        setForeground(t().blockIndex, t().start, t().end, fg() === c ? null : c);
                        setOpen(null);
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show when={open() === "bg"}>
              <div class="om-mark-swatches" role="group" aria-label="Background color">
                <For each={MARK_COLORS}>
                  {(color) => (
                    <Swatch
                      color={color}
                      kind="bg"
                      active={bg() === color}
                      onPick={(c) => {
                        setBackground(t().blockIndex, t().start, t().end, bg() === c ? null : c);
                        setOpen(null);
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
