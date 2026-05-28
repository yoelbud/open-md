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

use std::borrow::Cow;

use om_core::{
    image::{parse_image_at, parse_image_block, ParsedImage},
    Block, BlockKind, Document,
};
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
    if block.kind == BlockKind::Image {
        if let Some(image) = parse_image_block(&block.source) {
            return render_image_block(&image);
        }
    }

    let source = source_with_rendered_inline_images(block);
    let parser = Parser::new_ext(&source, opts());
    let mut out = String::with_capacity(block.source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

fn source_with_rendered_inline_images(block: &Block) -> Cow<'_, str> {
    if matches!(block.kind, BlockKind::Code | BlockKind::Html) {
        return Cow::Borrowed(&block.source);
    }

    let mut out = String::new();
    let mut cursor = 0;
    while let Some(relative_start) = block.source[cursor..].find("![") {
        let start = cursor + relative_start;
        let Some((image, end)) = parse_image_at(&block.source, start) else {
            out.push_str(&block.source[cursor..=start]);
            cursor = start + 1;
            continue;
        };

        out.push_str(&block.source[cursor..start]);
        out.push_str(&render_img_tag(&image));
        cursor = end;
    }

    if cursor == 0 {
        Cow::Borrowed(&block.source)
    } else {
        out.push_str(&block.source[cursor..]);
        Cow::Owned(out)
    }
}

fn render_image_block(image: &ParsedImage) -> String {
    let align_class = image
        .align
        .map_or_else(String::new, |align| format!(" om-img-{}", align.as_str()));
    format!(
        "<div class=\"om-img-wrap{align_class}\">{}</div>",
        render_img_tag(image)
    )
}

fn render_img_tag(image: &ParsedImage) -> String {
    let mut styles = Vec::new();
    if let Some(width) = &image.width {
        styles.push(format!("width:{width}"));
    }
    if let Some(height) = &image.height {
        styles.push(format!("height:{height}"));
    }
    if image.width.is_none() && image.height.is_none() {
        styles.push("max-width:100%".to_string());
    }

    let mut attrs = vec![
        format!("src=\"{}\"", escape_attr(&image.src)),
        format!("data-om-src=\"{}\"", escape_attr(&image.src)),
        format!("alt=\"{}\"", escape_attr(&image.alt)),
    ];
    if let Some(title) = &image.title {
        attrs.push(format!("title=\"{}\"", escape_attr(title)));
    }
    attrs.push(format!("style=\"{}\"", styles.join(";")));
    attrs.push("loading=\"lazy\"".to_string());
    attrs.push("draggable=\"false\"".to_string());

    format!("<img {}/>", attrs.join(" "))
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

fn escape_attr(source: &str) -> String {
    escape_html(source).replace('"', "&quot;")
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

    #[test]
    fn renders_inline_images_with_preview_attrs() {
        let doc = segment("a ![cat](https://x/y.png \"hello\" =300x200) b\n");
        let html = render_block(&doc.blocks[0]);

        assert!(html.contains("<img "));
        assert!(html.contains("src=\"https://x/y.png\""));
        assert!(html.contains("data-om-src=\"https://x/y.png\""));
        assert!(html.contains("alt=\"cat\""));
        assert!(html.contains("title=\"hello\""));
        assert!(html.contains("width:300px"));
        assert!(html.contains("height:200px"));
    }

    #[test]
    fn renders_image_block_with_alignment_wrapper() {
        let doc = segment("![cat](https://x/y.png){.center}\n");
        let html = render_block(&doc.blocks[0]);

        assert_eq!(doc.blocks[0].kind, BlockKind::Image);
        assert!(html.contains("om-img-wrap om-img-center"));
        assert!(html.contains("alt=\"cat\""));
    }

    #[test]
    fn does_not_render_images_inside_code_blocks() {
        let doc = segment("```\n![cat](https://x/y.png)\n```\n");
        let html = render_block(&doc.blocks[0]);

        assert!(!html.contains("<img "));
        assert!(html.contains("![cat](https://x/y.png)"));
    }
}
