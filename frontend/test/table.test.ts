import { describe, expect, it } from "vitest";
import { formatMarkdownTable, parseMarkdownTable, splitMarkdownTableRow } from "../src/markdown/table";

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
