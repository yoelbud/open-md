import { describe, expect, it } from "vitest";
import { detectSlashTrigger, filterTemplates } from "../src/store/slash";
import type { BlockTemplate } from "../src/store/document";

describe("detectSlashTrigger", () => {
  it("returns null for empty text", () => {
    expect(detectSlashTrigger("", 0)).toBeNull();
  });

  it("detects slash at start of line", () => {
    const result = detectSlashTrigger("/", 1);
    expect(result).toEqual({ queryStart: 0, query: "" });
  });

  it("detects slash with query", () => {
    const result = detectSlashTrigger("/h1", 3);
    expect(result).toEqual({ queryStart: 0, query: "h1" });
  });

  it("detects slash after whitespace", () => {
    const result = detectSlashTrigger("  /code", 7);
    expect(result).toEqual({ queryStart: 2, query: "code" });
  });

  it("detects slash on second line", () => {
    const text = "first line\n/tab";
    const result = detectSlashTrigger(text, text.length);
    expect(result).toEqual({ queryStart: 11, query: "tab" });
  });

  it("returns null for slash mid-word", () => {
    expect(detectSlashTrigger("hello/world", 11)).toBeNull();
  });

  it("returns null for slash after non-whitespace on line", () => {
    expect(detectSlashTrigger("text /cmd", 9)).toBeNull();
  });

  it("returns null when caret is before slash", () => {
    expect(detectSlashTrigger("/cmd", 0)).toBeNull();
  });

  it("handles caret at slash (no query yet)", () => {
    const text = "line1\n/";
    const result = detectSlashTrigger(text, text.length);
    expect(result).toEqual({ queryStart: 6, query: "" });
  });

  it("returns null when query has spaces", () => {
    expect(detectSlashTrigger("/ cmd", 5)).toBeNull();
  });

  it("returns null for out-of-range caret", () => {
    expect(detectSlashTrigger("hello", -1)).toBeNull();
    expect(detectSlashTrigger("hello", 100)).toBeNull();
  });
});

describe("filterTemplates", () => {
  const templates: BlockTemplate[] = [
    { id: "h1", label: "Heading 1", icon: "H1", snippet: "# H\n\n" },
    { id: "h2", label: "Heading 2", icon: "H2", snippet: "## H\n\n" },
    { id: "code", label: "Code block", icon: "</>", snippet: "```\n```\n\n" },
    { id: "table", label: "Table", icon: "▦", snippet: "| |\n\n" },
  ];

  it("returns all templates for empty query", () => {
    expect(filterTemplates(templates, "")).toEqual(templates);
  });

  it("filters by id substring", () => {
    const result = filterTemplates(templates, "h1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("h1");
  });

  it("filters by label substring (case-insensitive)", () => {
    const result = filterTemplates(templates, "heading");
    expect(result).toHaveLength(2);
  });

  it("returns empty array for no match", () => {
    expect(filterTemplates(templates, "zzz")).toEqual([]);
  });

  it("matches partial id", () => {
    const result = filterTemplates(templates, "tab");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("table");
  });

  it("is case-insensitive on id", () => {
    const result = filterTemplates(templates, "CODE");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("code");
  });
});
