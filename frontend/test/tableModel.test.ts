import { describe, expect, it } from "vitest";
import {
  addColumn,
  addRow,
  cloneTable,
  deleteColumn,
  deleteRow,
  moveColumn,
  moveRow,
  setAlign,
  sortByColumn,
} from "../src/panes/preview/tableModel";
import { formatMarkdownTable, parseMarkdownTable } from "../src/markdown/table";
import type { MarkdownTable } from "../src/ipc/types";

const SAMPLE: MarkdownTable = {
  headers: ["name", "score", "note"],
  alignments: ["left", "right", "center"],
  rows: [
    ["Ada", "99", "ok"],
    ["Bob", "72", "good"],
    ["Eve", "85", "nice"],
  ],
};

describe("tableModel pure operations", () => {
  describe("cloneTable", () => {
    it("produces a deep copy", () => {
      const copy = cloneTable(SAMPLE);
      expect(copy).toEqual(SAMPLE);
      copy.headers[0] = "changed";
      copy.rows[0]![0] = "changed";
      expect(SAMPLE.headers[0]).toBe("name");
      expect(SAMPLE.rows[0]![0]).toBe("Ada");
    });
  });

  describe("addRow", () => {
    it("inserts an empty row at the beginning", () => {
      const result = addRow(SAMPLE, 0);
      expect(result.rows.length).toBe(4);
      expect(result.rows[0]).toEqual(["", "", ""]);
      expect(result.rows[1]).toEqual(["Ada", "99", "ok"]);
    });

    it("inserts an empty row at the end", () => {
      const result = addRow(SAMPLE, 3);
      expect(result.rows.length).toBe(4);
      expect(result.rows[3]).toEqual(["", "", ""]);
    });

    it("clamps negative index to 0", () => {
      const result = addRow(SAMPLE, -5);
      expect(result.rows[0]).toEqual(["", "", ""]);
    });

    it("clamps index beyond length", () => {
      const result = addRow(SAMPLE, 100);
      expect(result.rows[3]).toEqual(["", "", ""]);
    });

    it("does not mutate original", () => {
      addRow(SAMPLE, 1);
      expect(SAMPLE.rows.length).toBe(3);
    });
  });

  describe("deleteRow", () => {
    it("removes the row at index", () => {
      const result = deleteRow(SAMPLE, 1);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0]).toEqual(["Ada", "99", "ok"]);
      expect(result.rows[1]).toEqual(["Eve", "85", "nice"]);
    });

    it("returns same reference for out-of-range index", () => {
      expect(deleteRow(SAMPLE, -1)).toBe(SAMPLE);
      expect(deleteRow(SAMPLE, 10)).toBe(SAMPLE);
    });

    it("does not mutate original", () => {
      deleteRow(SAMPLE, 0);
      expect(SAMPLE.rows.length).toBe(3);
    });
  });

  describe("addColumn", () => {
    it("inserts an empty column at index", () => {
      const result = addColumn(SAMPLE, 1);
      expect(result.headers.length).toBe(4);
      expect(result.headers[1]).toBe("");
      expect(result.alignments[1]).toBe("default");
      expect(result.rows[0]).toEqual(["Ada", "", "99", "ok"]);
    });

    it("inserts at the end", () => {
      const result = addColumn(SAMPLE, 3);
      expect(result.headers[3]).toBe("");
      expect(result.rows[0]![3]).toBe("");
    });

    it("keeps all arrays in sync", () => {
      const result = addColumn(SAMPLE, 0);
      expect(result.headers.length).toBe(4);
      expect(result.alignments.length).toBe(4);
      expect(result.rows.every((r) => r.length === 4)).toBe(true);
    });
  });

  describe("deleteColumn", () => {
    it("removes the column at index", () => {
      const result = deleteColumn(SAMPLE, 1);
      expect(result.headers).toEqual(["name", "note"]);
      expect(result.alignments).toEqual(["left", "center"]);
      expect(result.rows[0]).toEqual(["Ada", "ok"]);
    });

    it("refuses to delete the last column", () => {
      const single: MarkdownTable = {
        headers: ["only"],
        alignments: ["default"],
        rows: [["x"]],
      };
      expect(deleteColumn(single, 0)).toBe(single);
    });

    it("returns same reference for out-of-range index", () => {
      expect(deleteColumn(SAMPLE, -1)).toBe(SAMPLE);
      expect(deleteColumn(SAMPLE, 10)).toBe(SAMPLE);
    });
  });

  describe("setAlign", () => {
    it("sets alignment for a column", () => {
      const result = setAlign(SAMPLE, 0, "center");
      expect(result.alignments[0]).toBe("center");
      expect(result.alignments[1]).toBe("right"); // unchanged
    });

    it("returns same reference for out-of-range col", () => {
      expect(setAlign(SAMPLE, -1, "left")).toBe(SAMPLE);
      expect(setAlign(SAMPLE, 99, "left")).toBe(SAMPLE);
    });
  });

  describe("sortByColumn", () => {
    it("sorts alphabetically ascending", () => {
      const result = sortByColumn(SAMPLE, 0, "asc");
      expect(result.rows.map((r) => r[0])).toEqual(["Ada", "Bob", "Eve"]);
    });

    it("sorts alphabetically descending", () => {
      const result = sortByColumn(SAMPLE, 0, "desc");
      expect(result.rows.map((r) => r[0])).toEqual(["Eve", "Bob", "Ada"]);
    });

    it("sorts numerically when values are numbers", () => {
      const result = sortByColumn(SAMPLE, 1, "asc");
      expect(result.rows.map((r) => r[1])).toEqual(["72", "85", "99"]);
    });

    it("sorts numerically descending", () => {
      const result = sortByColumn(SAMPLE, 1, "desc");
      expect(result.rows.map((r) => r[1])).toEqual(["99", "85", "72"]);
    });

    it("handles mixed numeric/non-numeric with locale compare fallback", () => {
      const table: MarkdownTable = {
        headers: ["val"],
        alignments: ["default"],
        rows: [["10"], ["abc"], ["2"]],
      };
      const result = sortByColumn(table, 0, "asc");
      // Numeric values sort numerically between each other; non-numeric ("abc")
      // falls back to localeCompare which puts it after digits.
      expect(result.rows.map((r) => r[0])).toEqual(["2", "10", "abc"]);
    });

    it("does not move header row", () => {
      const result = sortByColumn(SAMPLE, 0, "desc");
      expect(result.headers).toEqual(["name", "score", "note"]);
    });

    it("returns same reference for out-of-range col", () => {
      expect(sortByColumn(SAMPLE, -1, "asc")).toBe(SAMPLE);
      expect(sortByColumn(SAMPLE, 99, "asc")).toBe(SAMPLE);
    });

    it("does not mutate original", () => {
      sortByColumn(SAMPLE, 0, "desc");
      expect(SAMPLE.rows[0]![0]).toBe("Ada");
    });
  });

  describe("moveRow", () => {
    it("moves a row from one position to another", () => {
      const result = moveRow(SAMPLE, 0, 2);
      expect(result.rows[0]).toEqual(["Bob", "72", "good"]);
      expect(result.rows[2]).toEqual(["Ada", "99", "ok"]);
    });

    it("returns same reference for invalid indices", () => {
      expect(moveRow(SAMPLE, -1, 0)).toBe(SAMPLE);
      expect(moveRow(SAMPLE, 0, 10)).toBe(SAMPLE);
      expect(moveRow(SAMPLE, 1, 1)).toBe(SAMPLE);
    });
  });

  describe("moveColumn", () => {
    it("moves a column from one position to another", () => {
      const result = moveColumn(SAMPLE, 0, 2);
      expect(result.headers).toEqual(["score", "note", "name"]);
      expect(result.alignments).toEqual(["right", "center", "left"]);
      expect(result.rows[0]).toEqual(["99", "ok", "Ada"]);
    });

    it("returns same reference for invalid indices", () => {
      expect(moveColumn(SAMPLE, -1, 0)).toBe(SAMPLE);
      expect(moveColumn(SAMPLE, 0, 10)).toBe(SAMPLE);
      expect(moveColumn(SAMPLE, 1, 1)).toBe(SAMPLE);
    });
  });
});

describe("tableModel round-trip with parse/serialize", () => {
  it("serialize(parse(x)) produces valid GFM", () => {
    const md = [
      "| name | score |",
      "| :--- | ---: |",
      "| Ada | 99 |",
      "| Bob | 72 |",
    ].join("\n");
    const parsed = parseMarkdownTable(md)!;
    const serialized = formatMarkdownTable(parsed);
    const reparsed = parseMarkdownTable(serialized)!;
    expect(reparsed).toEqual(parsed);
  });

  it("round-trips with escaped pipes", () => {
    const md = [
      "| cmd | desc |",
      "| --- | --- |",
      "| a \\| b | pipe |",
    ].join("\n");
    const parsed = parseMarkdownTable(md)!;
    expect(parsed.rows[0]![0]).toBe("a | b");
    const serialized = formatMarkdownTable(parsed);
    expect(serialized).toContain("a \\| b");
    const reparsed = parseMarkdownTable(serialized)!;
    expect(reparsed.rows[0]![0]).toBe("a | b");
  });

  it("normalizes ragged rows to max column count", () => {
    const md = [
      "| a | b | c |",
      "| --- | --- | --- |",
      "| 1 |",
      "| 1 | 2 | 3 | 4 |",
    ].join("\n");
    const parsed = parseMarkdownTable(md)!;
    // normalizeMarkdownTable uses max(headers, alignments, ...rows) = 4
    expect(parsed.rows[0]!.length).toBe(4);
    expect(parsed.rows[1]!.length).toBe(4);
    expect(parsed.headers.length).toBe(4);
  });

  it("alignment delimiter generation", () => {
    const table: MarkdownTable = {
      headers: ["a", "b", "c", "d"],
      alignments: ["default", "left", "center", "right"],
      rows: [],
    };
    const serialized = formatMarkdownTable(table);
    const lines = serialized.split("\n");
    expect(lines[1]).toBe("| --- | :--- | :---: | ---: |");
  });

  it("operations followed by serialize produce valid GFM", () => {
    let table = parseMarkdownTable(
      "| x | y |\n| --- | --- |\n| 1 | 2 |",
    )!;
    table = addRow(table, 1);
    table = addColumn(table, 1);
    table = setAlign(table, 1, "center");
    const md = formatMarkdownTable(table);
    const reparsed = parseMarkdownTable(md)!;
    expect(reparsed.headers.length).toBe(3);
    expect(reparsed.rows.length).toBe(2);
    expect(reparsed.alignments[1]).toBe("center");
  });
});
