// Auto-save / crash-recovery logic.
// Pure functions for draft serialization, deserialization, and recovery
// decisions. The wiring (debounced saves, startup check) lives in the
// component layer; this module is fully unit-testable.

/** Shape of a persisted draft in localStorage. */
export interface Draft {
  source: string;
  path: string;
  savedAt: number; // epoch ms
}

export const DRAFT_STORAGE_KEY = "open-md:autosave-draft";

/** Serialize a draft to a JSON string. */
export const serializeDraft = (source: string, path: string): string =>
  JSON.stringify({ source, path, savedAt: Date.now() } satisfies Draft);

/**
 * Deserialize a draft from a JSON string.
 * Returns null for missing, empty, or corrupt data — never throws.
 */
export const deserializeDraft = (raw: string | null | undefined): Draft | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.source !== "string") return null;
    if (typeof obj.path !== "string") return null;
    if (typeof obj.savedAt !== "number" || !Number.isFinite(obj.savedAt)) return null;
    return { source: obj.source, path: obj.path, savedAt: obj.savedAt };
  } catch {
    return null;
  }
};

/**
 * Decide whether to offer recovery of a stored draft.
 * Returns true when the draft exists and differs from the current document.
 */
export const shouldOfferRecovery = (
  draft: Draft | null,
  currentSource: string,
): boolean => {
  if (!draft) return false;
  if (draft.source === currentSource) return false;
  // A non-empty draft that's different → offer recovery.
  return draft.source.length > 0;
};

/**
 * Attempt to read the stored draft from localStorage.
 * Guards against environments where localStorage is unavailable.
 */
export const loadDraft = (): Draft | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    return deserializeDraft(localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
};

/**
 * Persist a draft to localStorage. Fails silently if storage is unavailable.
 */
export const saveDraft = (source: string, path: string): void => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DRAFT_STORAGE_KEY, serializeDraft(source, path));
  } catch {
    // QuotaExceededError or SecurityError — ignore.
  }
};

/** Clear any stored draft. */
export const clearDraft = (): void => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

/**
 * Create a debounced version of a function.
 * Returns the debounced function and a cancel handle.
 */
export const debounce = <T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
): { run: (...args: Parameters<T>) => void; cancel: () => void } => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    run: (...args: Parameters<T>) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...args); }, delayMs);
    },
    cancel: () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
};
