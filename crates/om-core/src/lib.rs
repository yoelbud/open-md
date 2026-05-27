//! Core parsing, IR, diffing, and block caching for open-md.
//!
//! This crate is intentionally free of Tauri / IO / UI dependencies so that
//! it can later be reused by a headless or SSH backend.

pub mod ir;
pub mod segment;

pub use ir::{Block, BlockKind, Document};
pub use segment::segment;
