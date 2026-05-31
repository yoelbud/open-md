// Theme system: built-in palettes, persistence, and custom CSS injection.
//
// Each theme preset is a set of values for the existing CSS custom properties.
// Switching themes sets a `data-theme` attribute on `<html>` which activates
// the matching CSS block in style.css. localStorage persistence is guarded
// identically to the autosave module.

import { createSignal } from "solid-js";

// ─── Theme presets ──────────────────────────────────────────────────────────

export type ThemeId = "dark" | "light" | "high-contrast" | "sepia";

export interface ThemePreset {
  id: ThemeId;
  label: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "high-contrast", label: "High Contrast" },
  { id: "sepia", label: "Sepia" },
];

const VALID_THEME_IDS = new Set<string>(THEME_PRESETS.map((p) => p.id));

export const DEFAULT_THEME: ThemeId = "dark";

export const isValidThemeId = (value: unknown): value is ThemeId =>
  typeof value === "string" && VALID_THEME_IDS.has(value);

// ─── localStorage helpers ───────────────────────────────────────────────────

export const THEME_STORAGE_KEY = "open-md:theme";
export const CUSTOM_CSS_STORAGE_KEY = "open-md:custom-css";

export const loadThemeId = (): ThemeId => {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_THEME;
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const saveThemeId = (id: ThemeId): void => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // QuotaExceededError or SecurityError — ignore.
  }
};

export const loadCustomCss = (): string => {
  try {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const saveCustomCss = (css: string): void => {
  try {
    if (typeof localStorage === "undefined") return;
    if (css) {
      localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, css);
    } else {
      localStorage.removeItem(CUSTOM_CSS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
};

// ─── Reactive signals ───────────────────────────────────────────────────────

const [themeId, setThemeIdRaw] = createSignal<ThemeId>(loadThemeId());
const [customCss, setCustomCssRaw] = createSignal<string>(loadCustomCss());

export const useThemeId = () => themeId;
export const useCustomCss = () => customCss;

// ─── DOM side-effects ───────────────────────────────────────────────────────

const CUSTOM_STYLE_ID = "open-md-custom-css";

const applyThemeToDOM = (id: ThemeId) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (id === DEFAULT_THEME) {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", id);
  }
};

const applyCustomCssToDOM = (css: string) => {
  if (typeof document === "undefined") return;
  let el = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = CUSTOM_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
};

// Apply on module load so the stored theme is active before first paint.
applyThemeToDOM(themeId());
applyCustomCssToDOM(customCss());

// ─── Public mutators ────────────────────────────────────────────────────────

export const setTheme = (id: ThemeId) => {
  if (!isValidThemeId(id)) return;
  setThemeIdRaw(id);
  saveThemeId(id);
  applyThemeToDOM(id);
};

export const setCustomCss = (css: string) => {
  const value = typeof css === "string" ? css : "";
  setCustomCssRaw(value);
  saveCustomCss(value);
  applyCustomCssToDOM(value);
};
