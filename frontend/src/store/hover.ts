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
