//! Per-block HTML rendering for open-md.
//!
//! Block-scoped rendering is the precondition for the surgical preview
//! updates described in the project plan: changing one paragraph must only
//! re-render that paragraph's HTML, never the whole document.

use om_core::{Block, Document};
use pulldown_cmark::{html, Options, Parser};

fn opts() -> Options {
    Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_SMART_PUNCTUATION
}

pub fn render_block(block: &Block) -> String {
    let parser = Parser::new_ext(&block.source, opts());
    let mut out = String::with_capacity(block.source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

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
}
