//! Block-level intermediate representation.
//!
//! The IR is the seam used for caching and incremental rendering: each
//! top-level CommonMark/GFM block gets a stable ID and a content hash so we
//! can re-parse and re-render only the blocks that actually changed.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Heading,
    Paragraph,
    List,
    Code,
    Table,
    BlockQuote,
    ThematicBreak,
    Html,
    TaskList,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    pub kind: BlockKind,
    /// Byte range `[start, end)` into the source string.
    pub src_range: (usize, usize),
    /// xxh3 hash of the block's source slice.
    pub hash: u64,
    /// Raw markdown source for the block (for IR pane display in M0).
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Document {
    pub blocks: Vec<Block>,
}
