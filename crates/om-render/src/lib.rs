//! Per-block HTML rendering for open-md.
//!
//! Block-scoped rendering is the precondition for the surgical preview
//! updates described in the project plan: changing one paragraph must only
//! re-render that paragraph's HTML, never the whole document.
//!
//! # Example
//!
//! ```
//! use om_core::segment;
//! use om_render::render_block;
//!
//! let doc = segment("# Hello\n");
//! let html = render_block(&doc.blocks[0]);
//! assert!(html.contains("<h1>"));
//! ```

#![deny(missing_docs)]

use om_core::{Block, Document};
use pulldown_cmark::{html, Options, Parser};

const fn opts() -> Options {
    Options::ENABLE_TABLES
        .union(Options::ENABLE_TASKLISTS)
        .union(Options::ENABLE_STRIKETHROUGH)
        .union(Options::ENABLE_FOOTNOTES)
        .union(Options::ENABLE_SMART_PUNCTUATION)
}

/// Render a single block to HTML.
///
/// The output is the same HTML pulldown-cmark would produce for the block's
/// source taken in isolation. Cross-block references (e.g. footnotes
/// defined elsewhere) are intentionally not resolved here.
#[must_use]
pub fn render_block(block: &Block) -> String {
    let parser = Parser::new_ext(&block.source, opts());
    let mut out = String::with_capacity(block.source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

/// Render every block in `doc` and concatenate the resulting HTML in order.
#[must_use]
pub fn render_document(doc: &Document) -> String {
    let mut out = String::new();
    for b in &doc.blocks {
        out.push_str(&render_block(b));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use om_core::segment;

    #[test]
    fn renders_heading() {
        let doc = segment("# Hi\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("<h1>"));
        assert!(html.contains("Hi"));
    }

    #[test]
    fn renders_paragraph_with_emphasis() {
        let doc = segment("a *b* c\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("<em>b</em>"));
    }

    #[test]
    fn renders_code_block_escaped() {
        let doc = segment("```\n<script>\n```\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn document_render_is_concatenation_of_blocks() {
        let doc = segment("# H\n\npara\n");
        let combined = render_document(&doc);
        let manual: String = doc.blocks.iter().map(render_block).collect();
        assert_eq!(combined, manual);
    }
}
