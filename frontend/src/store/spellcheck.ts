// Spellcheck toggle: persisted boolean that controls whether the native
// browser/webview spellchecker is enabled on editable text surfaces.

import { createSignal } from "solid-js";

// ─── localStorage helpers ───────────────────────────────────────────────────

export const SPELLCHECK_STORAGE_KEY = "open-md:spellcheck";

/** Default OFF — matches the existing `spellcheck={false}` on the source textarea. */
export const DEFAULT_SPELLCHECK = false;

export const loadSpellcheck = (): boolean => {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_SPELLCHECK;
    const raw = localStorage.getItem(SPELLCHECK_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_SPELLCHECK;
  } catch {
    return DEFAULT_SPELLCHECK;
  }
};

export const saveSpellcheck = (value: boolean): void => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SPELLCHECK_STORAGE_KEY, String(value));
  } catch {
    // QuotaExceededError or SecurityError — ignore.
  }
};

// ─── Reactive signal ────────────────────────────────────────────────────────

const [spellcheck, setSpellcheckRaw] = createSignal<boolean>(loadSpellcheck());

export const useSpellcheck = () => spellcheck;

export const setSpellcheck = (value: boolean): void => {
  setSpellcheckRaw(value);
  saveSpellcheck(value);
};

export const toggleSpellcheck = (): void => {
  const next = !spellcheck();
  setSpellcheckRaw(next);
  saveSpellcheck(next);
};
