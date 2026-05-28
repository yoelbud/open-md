//! Core parsing, IR, diffing, and block caching for open-md.
//!
//! This crate is intentionally free of Tauri / IO / UI dependencies so that
//! it can later be reused by a headless or SSH backend.
//!
//! # Example
//!
//! ```
//! use om_core::{segment, BlockKind};
//!
//! let doc = segment("# Hi\n\nA paragraph.\n");
//! assert_eq!(doc.blocks.len(), 2);
//! assert_eq!(doc.blocks[0].kind, BlockKind::Heading);
//! assert_eq!(doc.blocks[1].kind, BlockKind::Paragraph);
//! ```

pub mod image;
pub mod ir;
pub mod segment;

pub use ir::{Block, BlockKind, Document};
pub use segment::segment;
