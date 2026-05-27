import type { MarkdownTable, TableColumnAlignment } from "../ipc/types";

const ALIGNMENTS: TableColumnAlignment[] = ["default", "left", "center", "right"];

const trimOuterPipes = (line: string) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s;
};

export const splitMarkdownTableRow = (line: string): string[] => {
  const cells: string[] = [];
  let buf = "";
  let escaping = false;

  for (const ch of trimOuterPipes(line)) {
    if (escaping) {
      buf += ch === "|" ? "|" : `\\${ch}`;
      escaping = false;
      continue;
    }

    if (ch === "\\") {
      escaping = true;
      continue;
    }

    if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
      continue;
    }

    buf += ch;
  }

  if (escaping) buf += "\\";
  cells.push(buf.trim());
  return cells;
};

const separatorAlignment = (cell: string): TableColumnAlignment | null => {
  const normalized = cell.replace(/\s/g, "");
  if (!/^:?-{3,}:?$/.test(normalized)) return null;
  const left = normalized.startsWith(":");
  const right = normalized.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "default";
};

const padCells = (cells: string[], count: number) => {
  const next = cells.slice(0, count);
  while (next.length < count) next.push("");
  return next;
};

const normalizeAlignment = (alignment: TableColumnAlignment | undefined) =>
  alignment && ALIGNMENTS.includes(alignment) ? alignment : "default";

export const normalizeMarkdownTable = (table: MarkdownTable): MarkdownTable => {
  const colCount = Math.max(
    1,
    table.headers.length,
    table.alignments.length,
    ...table.rows.map((row) => row.length),
  );

  const headers = padCells(table.headers, colCount);
  const alignments = Array.from({ length: colCount }, (_, index) =>
    normalizeAlignment(table.alignments[index]),
  );
  const rows = table.rows.map((row) => padCells(row, colCount));
  return { headers, alignments, rows };
};

export const parseMarkdownTable = (source: string): MarkdownTable | null => {
  const lines = source
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const headers = splitMarkdownTableRow(lines[0]!);
  const separator = splitMarkdownTableRow(lines[1]!);
  const alignments = separator.map(separatorAlignment);

  if (headers.length === 0 || alignments.some((alignment) => alignment === null)) {
    return null;
  }

  return normalizeMarkdownTable({
    headers,
    alignments: alignments.map((alignment) => alignment ?? "default"),
    rows: lines.slice(2).map(splitMarkdownTableRow),
  });
};

const alignmentSeparator = (alignment: TableColumnAlignment) => {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    default:
      return "---";
  }
};

const escapeCell = (cell: string) =>
  cell.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

const formatRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;

export const formatMarkdownTable = (table: MarkdownTable): string => {
  const normalized = normalizeMarkdownTable(table);
  return [
    formatRow(normalized.headers),
    formatRow(normalized.alignments.map(alignmentSeparator)),
    ...normalized.rows.map(formatRow),
  ].join("\n");
};
