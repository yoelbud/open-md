//! IR-backed rich-text annotations.
//!
//! open-md stores rich inline formatting (highlights and text/background
//! colors) **outside** the Markdown body so the exported `.md` stays clean,
//! standard Markdown. The annotation layer lives in the native `.ommd` project
//! file and is overlaid onto the rendered blocks only in *rich* render mode.
//!
//! An [`Annotations`] value keys ranges by block index (0-based, in segmented
//! source order); each [`MarkRange`] carries character offsets into that
//! block's clean `source` string plus the set of marks to apply.

use serde::{Deserialize, Serialize};

/// The full rich-text annotation layer for a document.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Annotations {
    /// Per-block annotation entries, keyed by block index.
    #[serde(default)]
    pub blocks: Vec<BlockAnnotation>,
}

impl Annotations {
    /// Return the mark ranges for the block at `index`, or an empty slice when
    /// the block carries no annotations.
    #[must_use]
    pub fn ranges_for(&self, index: usize) -> &[MarkRange] {
        self.blocks
            .iter()
            .find(|entry| entry.index == index)
            .map_or(&[], |entry| entry.ranges.as_slice())
    }
}

/// Annotation ranges attached to a single block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockAnnotation {
    /// 0-based index of the block in segmented source order.
    pub index: usize,
    /// Mark ranges within the block's clean source text.
    #[serde(default)]
    pub ranges: Vec<MarkRange>,
}

/// A single annotated character range within a block's source text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkRange {
    /// Inclusive start character offset into the block's `source`.
    pub start: usize,
    /// Exclusive end character offset into the block's `source`.
    pub end: usize,
    /// Marks to apply across the range (`highlight`, `fg-<color>`,
    /// `bg-<color>`).
    #[serde(default)]
    pub marks: Vec<String>,
}

impl MarkRange {
    /// Whether the range is well-formed (non-empty and ordered).
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.start < self.end && !self.marks.is_empty()
    }
}
