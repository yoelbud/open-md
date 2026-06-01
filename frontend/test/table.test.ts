import { describe, expect, it } from "vitest";
import { formatMarkdownTable, parseMarkdownTable, splitMarkdownTableRow, tableToCsv } from "../src/markdown/table";

describe("markdown table helpers", () => {
  it("splits escaped pipes without creating extra cells", () => {
    expect(splitMarkdownTableRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });

  it("parses headers, rows, and column alignment", () => {
    const table = parseMarkdownTable([
      "| name | score | note |",
      "| :--- | ---: | :---: |",
      "| Ada | 99 | ok |",
    ].join("\n"));

    expect(table).toEqual({
      headers: ["name", "score", "note"],
      alignments: ["left", "right", "center"],
      rows: [["Ada", "99", "ok"]],
    });
  });

  it("formats tables back to markdown without preview-only state", () => {
    expect(formatMarkdownTable({
      headers: ["name", "score"],
      alignments: ["default", "right"],
      rows: [["Ada", "99"]],
    })).toBe([
      "| name | score |",
      "| --- | ---: |",
      "| Ada | 99 |",
    ].join("\n"));
  });
});

describe("tableToCsv", () => {
  it("formats a plain table as CSV", () => {
    expect(tableToCsv({
      headers: ["name", "score"],
      alignments: ["default", "default"],
      rows: [["Ada", "99"], ["Bob", "85"]],
    })).toBe("name,score\nAda,99\nBob,85");
  });

  it("wraps fields containing commas in double quotes", () => {
    expect(tableToCsv({
      headers: ["a"],
      alignments: ["default"],
      rows: [["hello, world"]],
    })).toBe('a\n"hello, world"');
  });

  it("doubles internal quotes and wraps the field", () => {
    expect(tableToCsv({
      headers: ["a"],
      alignments: ["default"],
      rows: [['say "hi"']],
    })).toBe('a\n"say ""hi"""');
  });

  it("wraps fields containing newlines", () => {
    expect(tableToCsv({
      headers: ["a"],
      alignments: ["default"],
      rows: [["line1\nline2"]],
    })).toBe('a\n"line1\nline2"');
  });
});
