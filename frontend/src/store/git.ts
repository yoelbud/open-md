// Git integration store — signals + async actions.
// Degrades gracefully when not running in a Tauri desktop shell.

import { createSignal } from "solid-js";
import { gitFileStatus, gitHeadContent } from "../ipc/desktop";
import { parseDocument } from "../ipc/runtime";
import { usePath } from "./document";
import { setDiffBaselineBlocks, setDiffModeOn } from "./diff";

const UNTITLED_PATH = "(untitled).md";

// ── Pure helper ──────────────────────────────────────────────────────────────

/**
 * Map a porcelain XY status code to a human-friendly label.
 */
export const describeGitStatus = (code: string | null): string => {
  if (!code || code.trim() === "") return "Clean";
  if (code === "??") return "Untracked";
  if (code.startsWith("A")) return "Added";
  if (code.includes("D")) return "Deleted";
  if (code.includes("R")) return "Renamed";
  if (code.includes("M")) return "Modified";
  return "Changed";
};

// ── Signals ──────────────────────────────────────────────────────────────────

const [gitAvailable, setGitAvailable] = createSignal(false);
const [gitBranch, setGitBranch] = createSignal<string | null>(null);
const [gitStatusLabel, setGitStatusLabel] = createSignal<string | null>(null);

export const useGitAvailable = () => gitAvailable;
export const useGitBranch = () => gitBranch;
export const useGitStatusLabel = () => gitStatusLabel;

// ── Actions ──────────────────────────────────────────────────────────────────

export async function refreshGitStatus(): Promise<void> {
  const currentPath = usePath()();
  if (!currentPath || currentPath === UNTITLED_PATH) {
    setGitAvailable(false);
    return;
  }

  const result = await gitFileStatus(currentPath);
  if (!result || !result.isRepo) {
    setGitAvailable(false);
    setGitBranch(null);
    setGitStatusLabel(null);
    return;
  }

  setGitAvailable(true);
  setGitBranch(result.branch);
  setGitStatusLabel(describeGitStatus(result.statusCode));
}

export async function diffAgainstHead(): Promise<void> {
  const currentPath = usePath()();
  if (!currentPath || currentPath === UNTITLED_PATH) return;

  const content = await gitHeadContent(currentPath);
  if (content == null) {
    console.info("[open-md] No HEAD content for diff (file may be untracked).");
    return;
  }

  const payload = parseDocument(content, currentPath);
  setDiffBaselineBlocks(payload.blocks);
  setDiffModeOn();
}
