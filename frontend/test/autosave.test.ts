import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deserializeDraft,
  serializeDraft,
  shouldOfferRecovery,
  debounce,
} from "../src/store/autosave";

describe("serializeDraft", () => {
  it("produces valid JSON with source, path, and savedAt", () => {
    const json = serializeDraft("hello", "test.md");
    const parsed = JSON.parse(json);
    expect(parsed.source).toBe("hello");
    expect(parsed.path).toBe("test.md");
    expect(typeof parsed.savedAt).toBe("number");
    expect(parsed.savedAt).toBeGreaterThan(0);
  });
});

describe("deserializeDraft", () => {
  it("returns null for null/undefined/empty", () => {
    expect(deserializeDraft(null)).toBeNull();
    expect(deserializeDraft(undefined)).toBeNull();
    expect(deserializeDraft("")).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    expect(deserializeDraft("{not json")).toBeNull();
    expect(deserializeDraft("42")).toBeNull();
    expect(deserializeDraft("[]")).toBeNull();
  });

  it("returns null for missing fields", () => {
    expect(deserializeDraft(JSON.stringify({ source: "x" }))).toBeNull();
    expect(deserializeDraft(JSON.stringify({ source: "x", path: 5, savedAt: 1 }))).toBeNull();
  });

  it("parses valid draft", () => {
    const draft = { source: "# hi", path: "a.md", savedAt: 12345 };
    const result = deserializeDraft(JSON.stringify(draft));
    expect(result).toEqual(draft);
  });

  it("rejects non-finite savedAt", () => {
    expect(deserializeDraft(JSON.stringify({ source: "x", path: "y", savedAt: NaN }))).toBeNull();
    expect(deserializeDraft(JSON.stringify({ source: "x", path: "y", savedAt: Infinity }))).toBeNull();
  });
});

describe("shouldOfferRecovery", () => {
  it("returns false for null draft", () => {
    expect(shouldOfferRecovery(null, "hello")).toBe(false);
  });

  it("returns false when draft matches current source", () => {
    const draft = { source: "hello", path: "a.md", savedAt: 1 };
    expect(shouldOfferRecovery(draft, "hello")).toBe(false);
  });

  it("returns true when draft differs from current source", () => {
    const draft = { source: "hello world", path: "a.md", savedAt: 1 };
    expect(shouldOfferRecovery(draft, "hello")).toBe(true);
  });

  it("returns false for empty draft source", () => {
    const draft = { source: "", path: "a.md", savedAt: 1 };
    expect(shouldOfferRecovery(draft, "something")).toBe(false);
  });
});

describe("debounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("delays execution", () => {
    const fn = vi.fn();
    const { run } = debounce(fn, 100);
    run();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets timer on subsequent calls", () => {
    const fn = vi.fn();
    const { run } = debounce(fn, 100);
    run();
    vi.advanceTimersByTime(80);
    run();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled", () => {
    const fn = vi.fn();
    const { run, cancel } = debounce(fn, 100);
    run();
    cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
