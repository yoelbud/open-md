// Lightweight recent-files tracking, persisted in localStorage and surfaced on
// the Welcome screen. Kept intentionally small: dedupe by path, cap the list,
// and remember enough to reopen the entry later.

import { createSignal } from "solid-js";

export type RecentKind = "file" | "project" | "example";

export interface RecentItem {
  path: string;
  label: string;
  kind: RecentKind;
  at: number;
}

const STORAGE_KEY = "open-md:recents";
const MAX_RECENTS = 8;

const hasStorage = () => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

const readStored = (): RecentItem[] => {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentItem => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as Record<string, unknown>;
        return (
          typeof item.path === "string" &&
          typeof item.label === "string" &&
          (item.kind === "file" || item.kind === "project" || item.kind === "example") &&
          typeof item.at === "number"
        );
      })
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
};

const writeStored = (items: RecentItem[]) => {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Best-effort: ignore quota or serialization failures.
  }
};

const [recents, setRecents] = createSignal<RecentItem[]>(readStored());

export const useRecents = () => recents;

export const recordRecent = (item: Omit<RecentItem, "at">) => {
  const entry: RecentItem = { ...item, at: Date.now() };
  const next = [entry, ...recents().filter((r) => r.path !== entry.path)].slice(0, MAX_RECENTS);
  setRecents(next);
  writeStored(next);
};

export const removeRecent = (path: string) => {
  const next = recents().filter((r) => r.path !== path);
  setRecents(next);
  writeStored(next);
};

export const clearRecents = () => {
  setRecents([]);
  writeStored([]);
};
