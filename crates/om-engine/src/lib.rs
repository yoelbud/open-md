//! Shared Markdown-to-rendered-payload engine.
//!
//! This crate is intentionally free of UI, filesystem, Tauri, and WASM glue so
//! the desktop shell and browser build can call the same parser/renderer.

#![deny(missing_docs)]

use om_core::{segment, BlockKind, MarkRange};
use om_render::{render_block_mode, RenderMode};
use serde::Serialize;

pub use om_core::{Annotations, BlockAnnotation};

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
    /// Per-block rendered HTML in rich mode (callout/code chrome, mermaid
    /// diagrams, and the IR-backed annotation overlay).
    pub html: String,
    /// Per-block rendered HTML in plain mode (standard Markdown only).
    pub plain_html: String,
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
///
/// Renders with an empty annotation layer; use [`render_project_payload`] to
/// overlay the IR-backed rich annotations of an open-md project.
#[must_use]
pub fn render_document_payload(source: &str, path: impl Into<String>) -> DocumentPayload {
    render_project_payload(source, path, &Annotations::default())
}

/// Segment and render a Markdown body plus its annotation layer.
///
/// Each block carries both its rich HTML (`html`, with the annotation overlay
/// applied) and its plain HTML (`plain_html`, standard Markdown) so the
/// frontend can switch preview modes without re-invoking the engine.
#[must_use]
pub fn render_project_payload(
    source: &str,
    path: impl Into<String>,
    annotations: &Annotations,
) -> DocumentPayload {
    let doc = segment(source);
    let blocks = doc
        .blocks
        .iter()
        .enumerate()
        .map(|(index, block)| {
            let ranges: &[MarkRange] = annotations.ranges_for(index);
            RenderedBlock {
                id: block.id.clone(),
                kind: block.kind,
                src_range: block.src_range,
                hash: block.hash,
                source: block.source.clone(),
                html: render_block_mode(block, RenderMode::Rich, ranges),
                plain_html: render_block_mode(block, RenderMode::Plain, &[]),
            }
        })
        .collect();
    DocumentPayload {
        path: path.into(),
        blocks,
    }
}

#[cfg(test)]
mod tests {
    use super::{render_document_payload, render_project_payload};
    use om_core::{Annotations, BlockAnnotation, BlockKind, MarkRange};

    #[test]
    fn renders_document_payload_with_block_html() {
        let payload = render_document_payload("# Heading\n\nbody\n", "notes.md");

        assert_eq!(payload.path, "notes.md");
        assert_eq!(payload.blocks.len(), 2);
        assert_eq!(payload.blocks[0].kind, BlockKind::Heading);
        assert!(payload.blocks[0].html.contains("<h1>Heading</h1>"));
    }

    #[test]
    fn payload_carries_both_rich_and_plain_html() {
        let payload = render_document_payload("> [!NOTE]\n> Be tidy.\n", "notes.md");

        assert_eq!(payload.blocks[0].kind, BlockKind::Callout);
        assert!(payload.blocks[0].html.contains("om-callout-note"));
        assert!(payload.blocks[0].plain_html.contains("<blockquote>"));
        assert!(!payload.blocks[0].plain_html.contains("om-callout"));
    }

    #[test]
    fn preserves_preview_image_behavior_in_shared_payload() {
        let payload = render_document_payload("![cat](https://x/y.png){.center}\n", "notes.md");

        assert_eq!(payload.blocks[0].kind, BlockKind::Image);
        assert!(payload.blocks[0].html.contains("om-img-center"));
        assert!(payload.blocks[0]
            .html
            .contains("data-om-src=\"https://x/y.png\""));
    }

    #[test]
    fn overlays_annotations_in_rich_html_only() {
        let annotations = Annotations {
            blocks: vec![BlockAnnotation {
                index: 0,
                ranges: vec![MarkRange {
                    start: 4,
                    end: 13,
                    marks: vec!["highlight".to_string()],
                }],
            }],
        };
        let payload = render_project_payload("the important bit\n", "notes.md", &annotations);

        assert!(payload.blocks[0]
            .html
            .contains("<mark class=\"om-mark\">important</mark>"));
        assert!(!payload.blocks[0].plain_html.contains("<mark"));
    }

    #[test]
    fn front_matter_yields_first_block_with_metadata_html() {
        let src = "---\ntitle: Hello World\nauthor: Jane\n---\n\n# Heading\n";
        let payload = render_document_payload(src, "doc.md");

        assert_eq!(payload.blocks[0].kind, BlockKind::FrontMatter);
        assert_eq!(payload.blocks[0].src_range, (0, 40));
        assert!(payload.blocks[0].html.contains("om-frontmatter"));
        assert!(payload.blocks[0].html.contains("Hello World"));
        assert!(payload.blocks[0].plain_html.contains("om-frontmatter-raw"));
        assert_eq!(payload.blocks[1].kind, BlockKind::Heading);
    }
}
