import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  isValidThemeId,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
  CUSTOM_CSS_STORAGE_KEY,
} from "../src/store/theme";

describe("isValidThemeId", () => {
  it("accepts known theme IDs", () => {
    expect(isValidThemeId("dark")).toBe(true);
    expect(isValidThemeId("light")).toBe(true);
    expect(isValidThemeId("high-contrast")).toBe(true);
    expect(isValidThemeId("sepia")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidThemeId("neon")).toBe(false);
    expect(isValidThemeId("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidThemeId(null)).toBe(false);
    expect(isValidThemeId(undefined)).toBe(false);
    expect(isValidThemeId(42)).toBe(false);
    expect(isValidThemeId({})).toBe(false);
  });
});

describe("DEFAULT_THEME", () => {
  it("is dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("is a valid theme ID", () => {
    expect(isValidThemeId(DEFAULT_THEME)).toBe(true);
  });
});

describe("THEME_PRESETS", () => {
  it("includes at least 4 presets", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it("every preset has a valid id and label", () => {
    for (const preset of THEME_PRESETS) {
      expect(isValidThemeId(preset.id)).toBe(true);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("includes dark and light", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(ids).toContain("dark");
    expect(ids).toContain("light");
  });

  it("has unique IDs", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("storage key constants", () => {
  it("theme key is a non-empty namespaced string", () => {
    expect(THEME_STORAGE_KEY).toBe("open-md:theme");
  });

  it("custom CSS key is a non-empty namespaced string", () => {
    expect(CUSTOM_CSS_STORAGE_KEY).toBe("open-md:custom-css");
  });
});
