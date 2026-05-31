// Diff baseline capture and diff-mode state.
// The baseline is the block snapshot at last open/save — purely session state.

import { createSignal, createMemo } from "solid-js";
import type { Block } from "../ipc/types";
import { diffBlocks, summarizeDiff } from "../diff/blockDiff";
import type { BlockDiffEntry, DiffSummary } from "../diff/blockDiff";
import { useDocument, registerBaselineCapture } from "./document";

// ── Diff mode toggle ─────────────────────────────────────────────────────────

const [diffMode, setDiffMode] = createSignal(false);

export const useDiffMode = () => diffMode;
export const toggleDiffMode = () => setDiffMode((v) => !v);
export const setDiffModeOn = () => setDiffMode(true);
export const setDiffModeOff = () => setDiffMode(false);

// ── Baseline snapshot ────────────────────────────────────────────────────────

const [baseline, setBaseline] = createSignal<Block[]>([]);

/** Capture the current document blocks as the diff baseline. */
export const captureDiffBaseline = () => {
  const doc = useDocument();
  setBaseline([...doc.blocks]);
};

// Snapshot a fresh baseline whenever the document is opened, replaced, or saved.
registerBaselineCapture(captureDiffBaseline);

/** Read the current baseline blocks. */
export const useDiffBaseline = () => baseline;

// ── Computed diff ────────────────────────────────────────────────────────────

/** Reactive diff between the baseline and the current document blocks. */
export const useDiffEntries = createMemo<BlockDiffEntry[]>(() => {
  if (!diffMode()) return [];
  const doc = useDocument();
  return diffBlocks(baseline(), doc.blocks);
});

/** Reactive summary counts of the current diff. */
export const useDiffSummary = createMemo<DiffSummary>(() => {
  const entries = useDiffEntries();
  return summarizeDiff(entries);
});

/**
 * Look up the diff status for a given block id in the current document.
 * Returns undefined if diff mode is off or block not found in diff.
 */
export const diffStatusForBlock = (blockId: string): BlockDiffEntry | undefined => {
  if (!diffMode()) return undefined;
  const entries = useDiffEntries();
  return entries.find((e) => e.newBlock?.id === blockId);
};
