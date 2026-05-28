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
use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

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
    if let Some(diagram) = mermaid_diagram_source(&block.source) {
        return render_mermaid_diagram(&diagram);
    }

    let parser = Parser::new_ext(&block.source, opts());
    let mut out = String::with_capacity(block.source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

fn mermaid_diagram_source(source: &str) -> Option<String> {
    let mut parser = Parser::new_ext(source, opts());
    match parser.next()? {
        Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(info))) => {
            let language = info.split_whitespace().next()?;
            if !language.eq_ignore_ascii_case("mermaid") {
                return None;
            }
        }
        _ => return None,
    }

    let mut diagram = String::new();
    for event in parser {
        match event {
            Event::Text(text) => diagram.push_str(&text),
            Event::End(TagEnd::CodeBlock) => return Some(diagram),
            _ => {}
        }
    }
    None
}

fn render_mermaid_diagram(source: &str) -> String {
    format!(
        "<pre class=\"mermaid\" data-om-mermaid>{}</pre>\n",
        escape_html(source)
    )
}

fn escape_html(source: &str) -> String {
    source
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
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
    fn renders_mermaid_fence_as_diagram_container() {
        let doc = segment("```mermaid\ngraph TD\n  A --> B\n```\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("class=\"mermaid\""));
        assert!(html.contains("data-om-mermaid"));
        assert!(html.contains("graph TD"));
        assert!(!html.contains("<code>"));
    }

    #[test]
    fn renders_tilde_mermaid_fence_as_diagram_container() {
        let doc = segment("~~~mermaid\ngraph TD\n  A --> B\n~~~\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("class=\"mermaid\""));
        assert!(html.contains("graph TD"));
    }

    #[test]
    fn escapes_mermaid_diagram_source() {
        let doc = segment("```mermaid\ngraph TD\n  A[<script>] --> B\n```\n");
        let html = render_block(&doc.blocks[0]);
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>"));
    }

    #[test]
    fn document_render_is_concatenation_of_blocks() {
        let doc = segment("# H\n\npara\n");
        let combined = render_document(&doc);
        let manual: String = doc.blocks.iter().map(render_block).collect();
        assert_eq!(combined, manual);
    }
}
