// Pure table model operations for GFM table editing.
// All functions are side-effect-free and return new model instances.

import type { MarkdownTable, TableColumnAlignment } from "../../ipc/types";

export type SortDirection = "asc" | "desc";

/** Deep-clone a table model. */
export const cloneTable = (table: MarkdownTable): MarkdownTable => ({
  headers: [...table.headers],
  alignments: [...table.alignments],
  rows: table.rows.map((row) => [...row]),
});

/** Insert an empty row at `index` (clamped to valid range). */
export const addRow = (table: MarkdownTable, index: number): MarkdownTable => {
  const next = cloneTable(table);
  const clamped = Math.max(0, Math.min(next.rows.length, index));
  next.rows.splice(clamped, 0, Array.from({ length: next.headers.length }, () => ""));
  return next;
};

/** Delete the row at `index`. No-op if out of range. */
export const deleteRow = (table: MarkdownTable, index: number): MarkdownTable => {
  if (index < 0 || index >= table.rows.length) return table;
  const next = cloneTable(table);
  next.rows.splice(index, 1);
  return next;
};

/** Insert an empty column at `index` (clamped to valid range). */
export const addColumn = (table: MarkdownTable, index: number): MarkdownTable => {
  const next = cloneTable(table);
  const clamped = Math.max(0, Math.min(next.headers.length, index));
  next.headers.splice(clamped, 0, "");
  next.alignments.splice(clamped, 0, "default");
  for (const row of next.rows) row.splice(clamped, 0, "");
  return next;
};

/** Delete the column at `index`. No-op if out of range or last column. */
export const deleteColumn = (table: MarkdownTable, index: number): MarkdownTable => {
  if (index < 0 || index >= table.headers.length || table.headers.length <= 1) return table;
  const next = cloneTable(table);
  next.headers.splice(index, 1);
  next.alignments.splice(index, 1);
  for (const row of next.rows) row.splice(index, 1);
  return next;
};

/** Set the alignment of column `col`. No-op if col is out of range. */
export const setAlign = (
  table: MarkdownTable,
  col: number,
  alignment: TableColumnAlignment,
): MarkdownTable => {
  if (col < 0 || col >= table.headers.length) return table;
  const next = cloneTable(table);
  next.alignments[col] = alignment;
  return next;
};

/** Sort body rows by the values in column `col`. Header row is never moved. */
export const sortByColumn = (
  table: MarkdownTable,
  col: number,
  direction: SortDirection,
): MarkdownTable => {
  if (col < 0 || col >= table.headers.length) return table;
  const next = cloneTable(table);
  const multiplier = direction === "asc" ? 1 : -1;
  next.rows.sort((a, b) => {
    const va = a[col] ?? "";
    const vb = b[col] ?? "";
    // Try numeric comparison first
    const na = Number(va);
    const nb = Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "") {
      return (na - nb) * multiplier;
    }
    return va.localeCompare(vb) * multiplier;
  });
  return next;
};

/** Move a row from `fromIndex` to `toIndex`. */
export const moveRow = (
  table: MarkdownTable,
  fromIndex: number,
  toIndex: number,
): MarkdownTable => {
  if (
    fromIndex < 0 || fromIndex >= table.rows.length ||
    toIndex < 0 || toIndex >= table.rows.length ||
    fromIndex === toIndex
  ) return table;
  const next = cloneTable(table);
  const [row] = next.rows.splice(fromIndex, 1);
  next.rows.splice(toIndex, 0, row!);
  return next;
};

/** Move a column from `fromIndex` to `toIndex`. */
export const moveColumn = (
  table: MarkdownTable,
  fromIndex: number,
  toIndex: number,
): MarkdownTable => {
  if (
    fromIndex < 0 || fromIndex >= table.headers.length ||
    toIndex < 0 || toIndex >= table.headers.length ||
    fromIndex === toIndex
  ) return table;
  const next = cloneTable(table);
  const [header] = next.headers.splice(fromIndex, 1);
  next.headers.splice(toIndex, 0, header!);
  const [align] = next.alignments.splice(fromIndex, 1);
  next.alignments.splice(toIndex, 0, align!);
  for (const row of next.rows) {
    const [cell] = row.splice(fromIndex, 1);
    row.splice(toIndex, 0, cell!);
  }
  return next;
};
