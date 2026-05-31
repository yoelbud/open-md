import { describe, expect, it } from "vitest";
import { splitInlineMath } from "../src/store/mathInline";

describe("splitInlineMath", () => {
  it("returns whole string as text when no dollars", () => {
    expect(splitInlineMath("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("splits a single inline math span", () => {
    expect(splitInlineMath("before $x^2$ after")).toEqual([
      { type: "text", value: "before " },
      { type: "math", value: "x^2" },
      { type: "text", value: " after" },
    ]);
  });

  it("splits multiple inline math spans", () => {
    expect(splitInlineMath("$a$ and $b$")).toEqual([
      { type: "math", value: "a" },
      { type: "text", value: " and " },
      { type: "math", value: "b" },
    ]);
  });

  it("treats escaped \\$ as literal dollar", () => {
    expect(splitInlineMath("price is \\$5")).toEqual([
      { type: "text", value: "price is \\$5" },
    ]);
  });

  it("does not match currency like $5", () => {
    // Opening $ followed by digit — no closing $ with proper guards
    expect(splitInlineMath("costs $5 and $7")).toEqual([
      { type: "text", value: "costs $5 and $7" },
    ]);
  });

  it("does not match $$ (block-level)", () => {
    expect(splitInlineMath("$$x^2$$")).toEqual([
      { type: "text", value: "$$x^2$$" },
    ]);
  });

  it("does not match when space immediately inside dollars", () => {
    expect(splitInlineMath("$ not math $")).toEqual([
      { type: "text", value: "$ not math $" },
    ]);
  });

  it("does not match when space before closing dollar", () => {
    expect(splitInlineMath("$x $")).toEqual([
      { type: "text", value: "$x $" },
    ]);
  });

  it("handles adjacent math spans", () => {
    // $a$$b$ — the scanner opens at the first $, skips the $$ (block marker),
    // and closes at the final $ → matches inner "a$$b" as math.
    expect(splitInlineMath("$a$$b$")).toEqual([
      { type: "math", value: "a$$b" },
    ]);
  });

  it("handles unmatched single $", () => {
    expect(splitInlineMath("just a $ sign")).toEqual([
      { type: "text", value: "just a $ sign" },
    ]);
  });

  it("does not match across newlines", () => {
    expect(splitInlineMath("$a\nb$")).toEqual([
      { type: "text", value: "$a\nb$" },
    ]);
  });

  it("handles escaped dollar inside math", () => {
    expect(splitInlineMath("$a\\$b$")).toEqual([
      { type: "math", value: "a\\$b" },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(splitInlineMath("")).toEqual([]);
  });
});
