import { createMemo, createSignal, Index, Show } from "solid-js";
import type { Block, MarkdownTable, TableColumnAlignment } from "../../ipc/types";
import { formatMarkdownTable, normalizeMarkdownTable, parseMarkdownTable, tableToCsv } from "../../markdown/table";
import { withBlockTrailing } from "../../markdown/blockEdit";
import { replaceBlockSource } from "../../store/document";
import { useSpellcheck } from "../../store/spellcheck";
import { copyText } from "../../store/blockActions";
import { requestContextMenu } from "../ContextMenu";
import type { CtxItem } from "../ContextMenu";
import {
  addColumn as modelAddColumn,
  addRow as modelAddRow,
  cloneTable,
  deleteColumn as modelDeleteColumn,
  deleteRow as modelDeleteRow,
  setAlign as modelSetAlign,
  sortByColumn as modelSortByColumn,
} from "./tableModel";
import type { SortDirection } from "./tableModel";

type Props = {
  block: Block;
  onEditSource: () => void;
};

type CellSection = "header" | "body";
type ActiveCell = {
  section: CellSection;
  row: number;
  col: number;
};

const ALIGNMENT_OPTIONS: { id: TableColumnAlignment; label: string }[] = [
  { id: "default", label: "Auto" },
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
];

const alignStyle = (alignment: TableColumnAlignment | undefined) =>
  alignment && alignment !== "default" ? alignment : undefined;

const FALLBACK_TABLE: MarkdownTable = {
  headers: ["Column 1"],
  alignments: ["default"],
  rows: [],
};

export const TableBlockView = (props: Props) => {
  const table = createMemo(() =>
    normalizeMarkdownTable(
      props.block.preview?.table ?? parseMarkdownTable(props.block.source) ?? FALLBACK_TABLE,
    ),
  );
  const [activeCell, setActiveCell] = createSignal<ActiveCell | null>(null);
  const spellcheck = useSpellcheck();

  const commit = (next: MarkdownTable) => {
    replaceBlockSource(props.block, withBlockTrailing(props.block, formatMarkdownTable(next)));
  };

  const updateCell = (section: CellSection, row: number, col: number, value: string) => {
    const next = cloneTable(table());
    if (section === "header") {
      next.headers[col] = value;
    } else {
      next.rows[row]![col] = value;
    }
    commit(next);
  };

  const addRow = () => {
    const selected = activeCell();
    const index = selected?.section === "body" ? selected.row + 1 : table().rows.length;
    const next = modelAddRow(table(), index);
    setActiveCell({ section: "body", row: index, col: selected?.col ?? 0 });
    commit(next);
  };

  const deleteRow = () => {
    const selected = activeCell();
    if (!selected || selected.section !== "body") return;
    const next = modelDeleteRow(table(), selected.row);
    setActiveCell(null);
    commit(next);
  };

  const addColumn = () => {
    const selected = activeCell();
    const index = selected ? selected.col + 1 : table().headers.length;
    const next = modelAddColumn(table(), index);
    // Give the new column a default header name
    next.headers[index] = `Column ${index + 1}`;
    setActiveCell({ section: "header", row: 0, col: index });
    commit(next);
  };

  const deleteColumn = () => {
    const selected = activeCell();
    const current = table();
    if (!selected || current.headers.length <= 1) return;
    const next = modelDeleteColumn(current, selected.col);
    setActiveCell(null);
    commit(next);
  };

  const setAlignment = (alignment: TableColumnAlignment) => {
    const col = activeCell()?.col ?? 0;
    commit(modelSetAlign(table(), col, alignment));
  };

  const sortColumn = (direction: SortDirection) => {
    const col = activeCell()?.col ?? 0;
    commit(modelSortByColumn(table(), col, direction));
  };

  const isActive = (section: CellSection, row: number, col: number) => {
    const active = activeCell();
    return active?.section === section && active.row === row && active.col === col;
  };

  const selectedAlignment = () => table().alignments[activeCell()?.col ?? 0] ?? "default";

  const addColWithHeader = (index: number): MarkdownTable => {
    const next = modelAddColumn(table(), index);
    next.headers[index] = `Column ${index + 1}`;
    return next;
  };

  const tableCellItems = (section: CellSection, row: number, col: number): CtxItem[] => {
    const alignSub: CtxItem[] = ALIGNMENT_OPTIONS.map((opt) => ({
      label: opt.label,
      action: () => commit(modelSetAlign(table(), col, opt.id)),
    }));
    const sortSub: CtxItem[] = [
      { label: "A→Z", action: () => commit(modelSortByColumn(table(), col, "asc")) },
      { label: "Z→A", action: () => commit(modelSortByColumn(table(), col, "desc")) },
    ];
    return [
      { label: "Insert row above", action: () => commit(modelAddRow(table(), section === "body" ? row : 0)) },
      { label: "Insert row below", action: () => commit(modelAddRow(table(), section === "body" ? row + 1 : table().rows.length)) },
      { label: "Delete row", danger: true, disabled: section !== "body", action: () => commit(modelDeleteRow(table(), row)) },
      { label: "Insert column left", separatorBefore: true, action: () => commit(addColWithHeader(col)) },
      { label: "Insert column right", action: () => commit(addColWithHeader(col + 1)) },
      { label: "Delete column", danger: true, disabled: table().headers.length <= 1, action: () => commit(modelDeleteColumn(table(), col)) },
      { label: "Align", separatorBefore: true, submenu: alignSub },
      { label: "Sort by column", submenu: sortSub },
      { label: "Copy as CSV", separatorBefore: true, action: () => void copyText(tableToCsv(table())) },
      { label: "Copy as Markdown", action: () => void copyText(formatMarkdownTable(table())) },
    ];
  };

  const handleCellContextMenu = (e: MouseEvent, section: CellSection, row: number, col: number) => {
    e.preventDefault();
    setActiveCell({ section, row, col });
    requestContextMenu({ x: e.clientX, y: e.clientY, items: tableCellItems(section, row, col) });
  };

  return (
    <div class="om-table-block">
      <div class="om-table-toolbar">
        <span class="om-table-meta">
          {table().rows.length + 1} rows x {table().headers.length} cols
        </span>
        <button type="button" class="om-table-btn" onClick={addRow}>+ Row</button>
        <button type="button" class="om-table-btn" onClick={addColumn}>+ Col</button>
        <button
          type="button"
          class="om-table-btn"
          disabled={activeCell()?.section !== "body"}
          onClick={deleteRow}
        >
          Delete row
        </button>
        <button
          type="button"
          class="om-table-btn"
          disabled={!activeCell() || table().headers.length <= 1}
          onClick={deleteColumn}
        >
          Delete col
        </button>
        <span class="om-table-divider" />
        <span class="om-table-label">Align</span>
        <Index each={ALIGNMENT_OPTIONS}>
          {(option) => (
            <button
              type="button"
              class="om-table-btn"
              classList={{ active: selectedAlignment() === option().id }}
              onClick={() => setAlignment(option().id)}
            >
              {option().label}
            </button>
          )}
        </Index>
        <span class="om-table-divider" />
        <span class="om-table-label">Sort</span>
        <button type="button" class="om-table-btn" onClick={() => sortColumn("asc")}>A→Z</button>
        <button type="button" class="om-table-btn" onClick={() => sortColumn("desc")}>Z→A</button>
        <button type="button" class="om-table-btn" onClick={props.onEditSource}>MD</button>
      </div>

      <div class="om-table-scroll">
        <table class="om-table-editor">
          <thead>
            <tr>
              <Index each={table().headers}>
                {(cell, col) => (
                  <th
                    classList={{ selected: isActive("header", 0, col) }}
                    style={{ "text-align": alignStyle(table().alignments[col]) }}
                    onContextMenu={(e) => handleCellContextMenu(e, "header", 0, col)}
                  >
                    <input
                      value={cell()}
                      spellcheck={spellcheck()}
                      aria-label={`Header ${col + 1}`}
                      onFocus={() => setActiveCell({ section: "header", row: 0, col })}
                      onInput={(e) => updateCell("header", 0, col, e.currentTarget.value)}
                    />
                  </th>
                )}
              </Index>
            </tr>
          </thead>
          <tbody>
            <Show
              when={table().rows.length > 0}
              fallback={
                <tr>
                  <td class="om-table-empty" colSpan={table().headers.length}>
                    No body rows yet. Add a row to keep editing in the preview.
                  </td>
                </tr>
              }
            >
              <Index each={table().rows}>
                {(row, rowIndex) => (
                  <tr>
                    <Index each={row()}>
                      {(cell, col) => (
                        <td
                          classList={{ selected: isActive("body", rowIndex, col) }}
                          style={{ "text-align": alignStyle(table().alignments[col]) }}
                          onContextMenu={(e) => handleCellContextMenu(e, "body", rowIndex, col)}
                        >
                          <input
                            value={cell()}
                            spellcheck={spellcheck()}
                            aria-label={`Row ${rowIndex + 1}, column ${col + 1}`}
                            onFocus={() => setActiveCell({ section: "body", row: rowIndex, col })}
                            onInput={(e) => updateCell("body", rowIndex, col, e.currentTarget.value)}
                          />
                        </td>
                      )}
                    </Index>
                  </tr>
                )}
              </Index>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  );
};
