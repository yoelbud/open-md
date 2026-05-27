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
  | "unknown";

export interface Block {
  id: string;
  kind: BlockKind;
  src_range: [number, number];
  hash: number;
  source: string;
  html: string;
}

export interface DocumentPayload {
  path: string;
  blocks: Block[];
}
