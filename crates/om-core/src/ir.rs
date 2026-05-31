//! Block-level intermediate representation.
//!
//! The IR is the seam used for caching and incremental rendering: each
//! top-level CommonMark/GFM block gets a stable ID and a content hash so we
//! can re-parse and re-render only the blocks that actually changed.

use serde::{Deserialize, Serialize};

/// Classification of a top-level Markdown block.
///
/// The values mirror the kinds emitted by [`pulldown_cmark`]'s offset
/// iterator and are surfaced verbatim to the frontend (`snake_case`) so the
/// IR pane can label blocks without re-parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    /// ATX or Setext heading (`#`, `##`, …).
    Heading,
    /// Plain paragraph.
    Paragraph,
    /// Bulleted or ordered list (whole list is one block).
    List,
    /// Fenced or indented code block.
    Code,
    /// GFM pipe table.
    Table,
    /// Block quote.
    BlockQuote,
    /// Callout / admonition (GitHub `[!NOTE]` style alert block quote).
    Callout,
    /// YAML front matter (`---` fenced metadata at byte 0).
    FrontMatter,
    /// Horizontal rule (`---`, `***`, `___`).
    ThematicBreak,
    /// Raw HTML block.
    Html,
    /// GFM task list (`- [ ]` / `- [x]`).
    TaskList,
    /// Image-only paragraph with optional preview sizing/alignment metadata.
    Image,
    /// Anything the segmenter did not recognise. Should never be emitted in
    /// normal operation; treated as opaque source text.
    Unknown,
}

/// A single top-level Markdown block.
///
/// Carries everything the renderer + UI need to display the block and
/// detect changes without re-parsing the surrounding document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Block {
    /// Stable identity within a document snapshot.
    ///
    /// The M0 implementation uses `b{hash:016x}-{index}`. Identity that
    /// survives edits (M2) will replace the index suffix with a content-
    /// addressable token.
    pub id: String,
    /// What kind of block this is.
    pub kind: BlockKind,
    /// Byte range `[start, end)` into the source string.
    pub src_range: (usize, usize),
    /// `xxh3_64` hash of the block's source slice. Used as the cache key
    /// for incremental rendering.
    pub hash: u64,
    /// Raw Markdown source for the block (for IR pane display in M0).
    pub source: String,
}

/// A segmented Markdown document.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Document {
    /// Top-level blocks in source order.
    pub blocks: Vec<Block>,
}
