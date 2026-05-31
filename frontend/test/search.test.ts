import { describe, it, expect } from "vitest";
import { findMatches, nextMatchIndex, prevMatchIndex } from "../src/store/search";

describe("findMatches", () => {
  it("returns empty for empty query", () => {
    expect(findMatches("hello world", "", { regex: false, caseSensitive: false })).toEqual([]);
  });

  it("finds plain text matches (case-insensitive)", () => {
    const result = findMatches("Hello hello HELLO", "hello", { regex: false, caseSensitive: false });
    expect(result).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("finds plain text matches (case-sensitive)", () => {
    const result = findMatches("Hello hello HELLO", "hello", { regex: false, caseSensitive: true });
    expect(result).toEqual([{ start: 6, end: 11 }]);
  });

  it("finds regex matches", () => {
    const result = findMatches("foo123bar456", "\\d+", { regex: true, caseSensitive: false });
    expect(result).toEqual([
      { start: 3, end: 6 },
      { start: 9, end: 12 },
    ]);
  });

  it("returns empty for invalid regex", () => {
    const result = findMatches("test", "[invalid", { regex: true, caseSensitive: false });
    expect(result).toEqual([]);
  });

  it("handles zero-width regex matches safely", () => {
    // A lookahead that matches everywhere — should not infinite loop
    const result = findMatches("abc", "(?=.)", { regex: true, caseSensitive: false });
    // Zero-width matches are skipped
    expect(result).toEqual([]);
  });

  it("handles non-overlapping matches", () => {
    const result = findMatches("aaaa", "aa", { regex: false, caseSensitive: true });
    expect(result).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("works with multiline text", () => {
    const text = "line one\nline two\nline three";
    const result = findMatches(text, "line", { regex: false, caseSensitive: true });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ start: 0, end: 4 });
  });

  it("regex case sensitivity", () => {
    const text = "Foo foo FOO";
    const sensitive = findMatches(text, "foo", { regex: true, caseSensitive: true });
    expect(sensitive).toEqual([{ start: 4, end: 7 }]);
    const insensitive = findMatches(text, "foo", { regex: true, caseSensitive: false });
    expect(insensitive).toHaveLength(3);
  });
});

describe("nextMatchIndex", () => {
  const matches = [
    { start: 5, end: 8 },
    { start: 15, end: 18 },
    { start: 30, end: 33 },
  ];

  it("returns -1 for empty matches", () => {
    expect(nextMatchIndex([], 0)).toBe(-1);
  });

  it("finds next match at or after cursor", () => {
    expect(nextMatchIndex(matches, 0)).toBe(0);
    expect(nextMatchIndex(matches, 5)).toBe(0);
    expect(nextMatchIndex(matches, 6)).toBe(1);
    expect(nextMatchIndex(matches, 16)).toBe(2);
  });

  it("wraps around", () => {
    expect(nextMatchIndex(matches, 31)).toBe(0);
    expect(nextMatchIndex(matches, 100)).toBe(0);
  });
});

describe("prevMatchIndex", () => {
  const matches = [
    { start: 5, end: 8 },
    { start: 15, end: 18 },
    { start: 30, end: 33 },
  ];

  it("returns -1 for empty matches", () => {
    expect(prevMatchIndex([], 10)).toBe(-1);
  });

  it("finds previous match before cursor", () => {
    expect(prevMatchIndex(matches, 20)).toBe(1);
    expect(prevMatchIndex(matches, 15)).toBe(0);
    expect(prevMatchIndex(matches, 100)).toBe(2);
  });

  it("wraps around", () => {
    expect(prevMatchIndex(matches, 5)).toBe(2);
    expect(prevMatchIndex(matches, 0)).toBe(2);
  });
});
