// Sticky headings (sticky scroll): shared signal + pure helpers for computing
// the heading breadcrumb trail that pins to pane tops during scroll.

import { createMemo, createSignal } from "solid-js";
import type { Block } from "../ipc/types";
import { parseHeadingLevel, parseHeadingText } from "./outline";
import { useDocument } from "./document";

export interface TrailCrumb {
  id: string;
  level: number;
  text: string;
  sourceOffset: number;
}

/**
 * Build the chain of headings enclosing the block at `topIndex`.
 * Walk blocks 0..topIndex, maintaining a heading stack: for each heading block,
 * pop while stack top level >= heading level, then push.
 */
export const headingTrail = (blocks: Block[], topIndex: number): TrailCrumb[] => {
  if (topIndex < 0 || blocks.length === 0) return [];
  const stack: TrailCrumb[] = [];
  const end = Math.min(topIndex, blocks.length - 1);
  for (let i = 0; i <= end; i++) {
    const b = blocks[i]!;
    if (b.kind !== "heading") continue;
    const level = parseHeadingLevel(b.source);
    const text = parseHeadingText(b.source);
    // Pop headings at same or deeper level
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }
    stack.push({ id: b.id, level, text, sourceOffset: b.src_range[0] });
  }
  return stack;
};

/**
 * Find the index of a block by id. Returns -1 if not found or id is null.
 */
export const indexOfBlockId = (blocks: Block[], id: string | null): number => {
  if (id == null) return -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === id) return i;
  }
  return -1;
};

// ── Shared signal: which block is currently at the top of the scrolling pane ──
const [activeTopBlockId, setActiveTopBlockId] = createSignal<string | null>(null);
export const useActiveTopBlock = () => activeTopBlockId;
export const setActiveTopBlock = (id: string | null) => setActiveTopBlockId(id);

// ── Toggle: enable/disable sticky headings ──
const [stickyEnabled, setStickyEnabled] = createSignal(true);
export const useStickyEnabled = () => stickyEnabled;
export const toggleSticky = () => setStickyEnabled((v) => !v);

// ── Derived memo: the computed trail based on current state ──
export const useStickyTrail = createMemo<TrailCrumb[]>(() => {
  if (!stickyEnabled()) return [];
  const blocks = useDocument().blocks;
  return headingTrail(blocks, indexOfBlockId(blocks, activeTopBlockId()));
});
