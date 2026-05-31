// Shared types mirroring the Rust IR in `crates/om-core`.
// Kept hand-written for M0; M1 will codegen these from the Rust side.

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "code"
  | "table"
  | "block_quote"
  | "callout"
  | "front_matter"
  | "thematic_break"
  | "html"
  | "task_list"
  | "math"
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
  /** Rich HTML: callout/code chrome, mermaid diagrams, and the annotation overlay. */
  html: string;
  /** Plain HTML: standard Markdown only (no chrome, diagrams, or annotation overlay). */
  plain_html: string;
  preview?: BlockPreviewMeta;
}

export interface DocumentPayload {
  path: string;
  blocks: Block[];
  preview?: PreviewDocumentMeta;
}

/** How the preview pane renders the document. */
export type RenderMode = "rich" | "markdown";

/**
 * A single annotated character range within a block's clean source text.
 * Mirrors `MarkRange` in `crates/om-core`.
 */
export interface MarkRange {
  /** Inclusive start character offset into the block's `source`. */
  start: number;
  /** Exclusive end character offset into the block's `source`. */
  end: number;
  /** Marks to apply (`highlight`, `fg-<color>`, `bg-<color>`). */
  marks: string[];
}

/** Annotation ranges attached to a single block, keyed by segmented index. */
export interface BlockAnnotation {
  /** 0-based index of the block in segmented source order. */
  index: number;
  ranges: MarkRange[];
}

/**
 * The IR-backed rich-text annotation layer. Stored in the native `.ommd`
 * project file and overlaid onto rendered blocks only in rich mode. Mirrors
 * `Annotations` in `crates/om-core`.
 */
export interface Annotations {
  blocks: BlockAnnotation[];
}

/** The native open-md project file (`.ommd`), serialized as JSON. */
export interface ProjectFileFormat {
  format: "open-md-project";
  version: 1;
  /** Clean, standard Markdown body. */
  body: string;
  annotations: Annotations;
  meta?: { preview?: PreviewDocumentMeta };
}
