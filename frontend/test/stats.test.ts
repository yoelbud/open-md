import { describe, expect, it } from "vitest";
import {
  computeStats,
  countChars,
  countWords,
  formatReadingTime,
  readingTime,
} from "../src/store/stats";

describe("countWords", () => {
  it("returns 0 for empty or whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts whitespace-separated tokens", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("  leading and   trailing  ")).toBe(3);
  });

  it("counts markdown markers as part of tokens", () => {
    expect(countWords("# Heading here")).toBe(3);
  });

  it("handles multibyte / CJK separated by spaces", () => {
    expect(countWords("日本語 テスト")).toBe(2);
  });
});

describe("countChars", () => {
  it("returns 0 for empty input", () => {
    expect(countChars("")).toBe(0);
  });

  it("counts unicode code points, not UTF-16 units", () => {
    expect(countChars("abc")).toBe(3);
    // Emoji is a single code point but two UTF-16 units.
    expect(countChars("😀")).toBe(1);
  });
});

describe("readingTime", () => {
  it("returns 0 for non-positive word counts", () => {
    expect(readingTime(0)).toBe(0);
    expect(readingTime(-5)).toBe(0);
  });

  it("scales with words per minute", () => {
    expect(readingTime(200)).toBeCloseTo(1);
    expect(readingTime(100, 200)).toBeCloseTo(0.5);
  });
});

describe("formatReadingTime", () => {
  it("shows < 1 min for short reads", () => {
    expect(formatReadingTime(0)).toBe("< 1 min read");
    expect(formatReadingTime(0.4)).toBe("< 1 min read");
  });

  it("rounds up to whole minutes", () => {
    expect(formatReadingTime(1)).toBe("1 min read");
    expect(formatReadingTime(1.2)).toBe("2 min read");
  });
});

describe("computeStats", () => {
  it("aggregates words, chars, and reading time", () => {
    const stats = computeStats("hello world");
    expect(stats.words).toBe(2);
    expect(stats.chars).toBe(11);
    expect(stats.readingTimeMinutes).toBeCloseTo(2 / 200);
  });

  it("handles empty input", () => {
    expect(computeStats("")).toEqual({
      words: 0,
      chars: 0,
      readingTimeMinutes: 0,
    });
  });
});
