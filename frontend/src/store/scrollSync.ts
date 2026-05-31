// Pure helpers for scroll synchronization between Source and Preview panes.
// All functions are stateless and unit-testable; DOM glue lives in the panes.

import type { Block } from "../ipc/types";

/**
 * Build a cumulative line-offset table from the source text.
 * lineOffsets[i] = byte offset of the start of line i.
 * lineOffsets[0] is always 0.
 */
export const buildLineOffsets = (text: string): number[] => {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
};

/**
 * Convert a line number (0-based) to a character offset (start of that line).
 */
export const lineToOffset = (lineOffsets: number[], line: number): number => {
  if (lineOffsets.length === 0) return 0;
  const clamped = Math.max(0, Math.min(line, lineOffsets.length - 1));
  return lineOffsets[clamped]!;
};

/**
 * Convert a character offset to a line number (0-based).
 * Uses binary search for efficiency.
 */
export const offsetToLine = (lineOffsets: number[], offset: number): number => {
  if (lineOffsets.length === 0) return 0;
  const clamped = Math.max(0, offset);
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid]! <= clamped) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/**
 * Given a source character offset and the list of blocks, find the index of
 * the block whose src_range contains the offset. Returns 0 if offset precedes
 * all blocks; returns last block index if offset exceeds all blocks.
 */
export const blockIndexAtOffset = (blocks: Block[], offset: number): number => {
  if (blocks.length === 0) return -1;
  for (let i = 0; i < blocks.length; i++) {
    const [start, end] = blocks[i]!.src_range;
    if (offset >= start && offset < end) return i;
  }
  // If offset is past last block, return last block.
  if (offset >= blocks[blocks.length - 1]!.src_range[1]) return blocks.length - 1;
  // If offset is before first block, return first block.
  return 0;
};

/**
 * Given a scrollTop of a textarea, compute the approximate top visible
 * character offset in the source.
 */
export const scrollTopToOffset = (
  scrollTop: number,
  lineHeight: number,
  paddingTop: number,
  lineOffsets: number[],
): number => {
  if (lineHeight <= 0 || lineOffsets.length === 0) return 0;
  const adjustedScroll = Math.max(0, scrollTop - paddingTop);
  const topLine = Math.floor(adjustedScroll / lineHeight);
  return lineToOffset(lineOffsets, topLine);
};

/**
 * Given a target source offset, compute the scrollTop that would place
 * that offset's line at the top of the textarea viewport.
 */
export const offsetToScrollTop = (
  offset: number,
  lineHeight: number,
  paddingTop: number,
  lineOffsets: number[],
): number => {
  const line = offsetToLine(lineOffsets, offset);
  return paddingTop + line * lineHeight;
};

/**
 * Given a block id and the list of blocks, return the source offset of
 * the start of that block's src_range. Returns 0 if not found.
 */
export const blockIdToSourceOffset = (blocks: Block[], blockId: string): number => {
  const block = blocks.find((b) => b.id === blockId);
  return block ? block.src_range[0] : 0;
};
