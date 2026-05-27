// Shared types mirroring the Rust IR in `crates/om-core`.
// Kept hand-written for M0; M1 will codegen these from the Rust side.

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "code"
  | "table"
  | "block_quote"
  | "thematic_break"
  | "html"
  | "task_list"
  | "image"
  | "unknown";

export type PreviewFontFamily = "sans" | "serif" | "mono";
export type PreviewContentWidth = "fluid" | "readable" | "wide";

export interface PreviewDocumentMeta {
  fontFamily: PreviewFontFamily;
  fontSizePx: number;
  lineHeight: number;
  contentWidth: PreviewContentWidth;
}

export type TableColumnAlignment = "default" | "left" | "center" | "right";

export interface MarkdownTable {
  headers: string[];
  alignments: TableColumnAlignment[];
  rows: string[][];
}

export interface BlockPreviewMeta {
  table?: MarkdownTable;
}

export interface Block {
  id: string;
  kind: BlockKind;
  src_range: [number, number];
  hash: number;
  source: string;
  html: string;
  preview?: BlockPreviewMeta;
}

export interface DocumentPayload {
  path: string;
  blocks: Block[];
  preview?: PreviewDocumentMeta;
}
