// Cross-pane hover highlight: shared signal so hovering a block in one pane
// highlights the same block in other panes.

import { createSignal } from "solid-js";

const [hoveredBlockId, setHoveredBlockId] = createSignal<string | null>(null);

export const useHoveredBlock = () => hoveredBlockId;
export const setHoveredBlock = (id: string | null) => setHoveredBlockId(id);
export const clearHoveredBlock = () => setHoveredBlockId(null);

/**
 * Given a source string and a byte offset, return the 0-based line number.
 * Mirrors the existing markerLine math in SourcePane.
 */
export const lineOfOffset = (source: string, offset: number): number =>
  source.slice(0, Math.min(offset, source.length)).split("\n").length - 1;

/**
 * Compute start line and line count for a byte range within source.
 * Returns null only if start exceeds source length.
 */
export const rangeLines = (
  source: string,
  start: number,
  end: number,
): { startLine: number; lineCount: number } | null => {
  if (source.length === 0 && start === 0 && end === 0) {
    return { startLine: 0, lineCount: 1 };
  }
  if (start > source.length) return null;
  const clampedEnd = Math.max(start, Math.min(end, source.length));
  const startLine = lineOfOffset(source, start);
  const endLine = lineOfOffset(source, clampedEnd);
  const lineCount = Math.max(1, endLine - startLine + 1);
  return { startLine, lineCount };
};
