import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_SPELLCHECK,
  SPELLCHECK_STORAGE_KEY,
  loadSpellcheck,
  saveSpellcheck,
} from "../src/store/spellcheck";

// Provide a minimal localStorage shim for the test environment when jsdom
// does not expose one (e.g. when the happy-dom/jsdom build lacks it).
const storage = (() => {
  if (typeof globalThis.localStorage !== "undefined" && typeof globalThis.localStorage.getItem === "function") {
    return globalThis.localStorage;
  }
  const map = new Map<string, string>();
  const shim = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (_i: number) => null as string | null,
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, writable: true });
  return shim;
})();

describe("spellcheck persistence", () => {
  beforeEach(() => {
    storage.removeItem(SPELLCHECK_STORAGE_KEY);
  });

  describe("DEFAULT_SPELLCHECK", () => {
    it("is false (matches existing textarea behavior)", () => {
      expect(DEFAULT_SPELLCHECK).toBe(false);
    });
  });

  describe("SPELLCHECK_STORAGE_KEY", () => {
    it("is a namespaced string", () => {
      expect(SPELLCHECK_STORAGE_KEY).toBe("open-md:spellcheck");
    });
  });

  describe("loadSpellcheck", () => {
    it("returns default when nothing stored", () => {
      expect(loadSpellcheck()).toBe(false);
    });

    it("returns true when stored as 'true'", () => {
      storage.setItem(SPELLCHECK_STORAGE_KEY, "true");
      expect(loadSpellcheck()).toBe(true);
    });

    it("returns false when stored as 'false'", () => {
      storage.setItem(SPELLCHECK_STORAGE_KEY, "false");
      expect(loadSpellcheck()).toBe(false);
    });

    it("returns default for invalid stored values", () => {
      storage.setItem(SPELLCHECK_STORAGE_KEY, "maybe");
      expect(loadSpellcheck()).toBe(DEFAULT_SPELLCHECK);
    });
  });

  describe("saveSpellcheck", () => {
    it("persists true", () => {
      saveSpellcheck(true);
      expect(storage.getItem(SPELLCHECK_STORAGE_KEY)).toBe("true");
    });

    it("persists false", () => {
      saveSpellcheck(false);
      expect(storage.getItem(SPELLCHECK_STORAGE_KEY)).toBe("false");
    });
  });

  describe("toggle round-trip", () => {
    it("save then load preserves value", () => {
      saveSpellcheck(true);
      expect(loadSpellcheck()).toBe(true);
      saveSpellcheck(false);
      expect(loadSpellcheck()).toBe(false);
    });
  });
});
