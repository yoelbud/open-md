//! Shared Markdown-to-rendered-payload engine.
//!
//! This crate is intentionally free of UI, filesystem, Tauri, and WASM glue so
//! the desktop shell and browser build can call the same parser/renderer.

#![deny(missing_docs)]

use om_core::{segment, BlockKind};
use om_render::render_block;
use serde::Serialize;

/// A top-level Markdown block with its rendered HTML.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RenderedBlock {
    /// Stable block identity within this document snapshot.
    pub id: String,
    /// Markdown block classification.
    pub kind: BlockKind,
    /// Byte range `[start, end)` into the original source.
    pub src_range: (usize, usize),
    /// `xxh3_64` hash of the block's exact source slice.
    pub hash: u64,
    /// Exact Markdown source slice for this block.
    pub source: String,
    /// Per-block rendered HTML.
    pub html: String,
}

/// Rendered document payload consumed by the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocumentPayload {
    /// Display path for the document.
    pub path: String,
    /// Rendered blocks in source order.
    pub blocks: Vec<RenderedBlock>,
}

/// Segment and render a Markdown document into the shared frontend payload.
#[must_use]
pub fn render_document_payload(source: &str, path: impl Into<String>) -> DocumentPayload {
    let doc = segment(source);
    let blocks = doc
        .blocks
        .iter()
        .map(|block| RenderedBlock {
            id: block.id.clone(),
            kind: block.kind,
            src_range: block.src_range,
            hash: block.hash,
            source: block.source.clone(),
            html: render_block(block),
        })
        .collect();
    DocumentPayload {
        path: path.into(),
        blocks,
    }
}

#[cfg(test)]
mod tests {
    use super::render_document_payload;
    use om_core::BlockKind;

    #[test]
    fn renders_document_payload_with_block_html() {
        let payload = render_document_payload("# Heading\n\nbody\n", "notes.md");

        assert_eq!(payload.path, "notes.md");
        assert_eq!(payload.blocks.len(), 2);
        assert_eq!(payload.blocks[0].kind, BlockKind::Heading);
        assert!(payload.blocks[0].html.contains("<h1>Heading</h1>"));
    }

    #[test]
    fn preserves_preview_image_behavior_in_shared_payload() {
        let payload = render_document_payload("![cat](https://x/y.png){.center}\n", "notes.md");

        assert_eq!(payload.blocks[0].kind, BlockKind::Image);
        assert!(payload.blocks[0].html.contains("om-img-center"));
        assert!(payload.blocks[0].html.contains("data-om-src=\"https://x/y.png\""));
    }
}
