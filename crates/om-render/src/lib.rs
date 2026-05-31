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
use std::fmt::Write;

use om_core::{
    callout::{parse_callout, Callout},
    frontmatter::parse_front_matter,
    image::{parse_image_at, parse_image_block, ParsedImage},
    math::parse_display_math,
    Block, BlockKind, Document, MarkRange,
};
use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

/// Curated palette accepted by inline color spans (`[text]{.fg-red}`).
const COLOR_PALETTE: &[&str] = &[
    "red", "orange", "amber", "yellow", "green", "teal", "blue", "purple", "pink", "gray", "white",
    "black",
];

const fn opts() -> Options {
    Options::ENABLE_TABLES
        .union(Options::ENABLE_TASKLISTS)
        .union(Options::ENABLE_STRIKETHROUGH)
        .union(Options::ENABLE_FOOTNOTES)
        .union(Options::ENABLE_SMART_PUNCTUATION)
}

/// How a block should be rendered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    /// Rich rendering: callout and code chrome, mermaid diagrams, and the
    /// IR-backed annotation overlay (highlights and colors).
    Rich,
    /// Plain rendering: standard Markdown only. Callouts degrade to block
    /// quotes, code blocks lose their language chrome, mermaid fences render as
    /// ordinary code, and no annotation overlay is applied.
    Plain,
}

/// Render a single block to rich HTML with no annotation overlay.
///
/// Equivalent to [`render_block_mode`] with [`RenderMode::Rich`] and an empty
/// annotation set. Retained as the simple entry point used by tests and the
/// whole-document helper. Cross-block references (e.g. footnotes defined
/// elsewhere) are intentionally not resolved here.
#[must_use]
pub fn render_block(block: &Block) -> String {
    render_block_mode(block, RenderMode::Rich, &[])
}

/// Render a single block in the requested [`RenderMode`], overlaying the
/// annotation `ranges` (applied in rich mode only).
#[must_use]
pub fn render_block_mode(block: &Block, mode: RenderMode, ranges: &[MarkRange]) -> String {
    match mode {
        RenderMode::Plain => render_block_plain(block),
        RenderMode::Rich => render_block_rich(block, ranges),
    }
}

/// Rich rendering: open-md's IR-backed enrichments plus the annotation overlay.
fn render_block_rich(block: &Block, ranges: &[MarkRange]) -> String {
    if let Some(diagram) = mermaid_diagram_source(&block.source) {
        return render_mermaid_diagram(&diagram);
    }
    if let Some(tex) = parse_display_math(&block.source) {
        return render_display_math(tex);
    }
    match block.kind {
        BlockKind::FrontMatter => {
            return render_front_matter_rich(&block.source);
        }
        BlockKind::Image => {
            if let Some(image) = parse_image_block(&block.source) {
                return render_image_block(&image);
            }
        }
        BlockKind::Callout => {
            if let Some(callout) = parse_callout(&block.source) {
                return render_callout(&callout);
            }
        }
        BlockKind::Code => {
            if let Some(html) = render_fenced_code(&block.source) {
                return html;
            }
        }
        _ => {}
    }

    let skip_inline = matches!(block.kind, BlockKind::Code | BlockKind::Html);
    let source = if skip_inline {
        Cow::Borrowed(block.source.as_str())
    } else {
        overlay_source(block, ranges)
    };
    render_markdown_fragment(&source, skip_inline)
}

/// Plain rendering: standard Markdown only, with no chrome, diagrams, or
/// annotation overlay. This is the "regular Markdown preview" and the source
/// for raw PDF export.
fn render_block_plain(block: &Block) -> String {
    if block.kind == BlockKind::FrontMatter {
        return render_front_matter_plain(&block.source);
    }
    if block.kind == BlockKind::Math {
        return format!(
            "<pre class=\"om-math-raw\"><code>{}</code></pre>\n",
            escape_html(block.source.trim())
        );
    }
    if block.kind == BlockKind::Image {
        if let Some(image) = parse_image_block(&block.source) {
            return format!(
                "<p><img src=\"{}\" alt=\"{}\"/></p>\n",
                escape_attr(&image.src),
                escape_attr(&image.alt),
            );
        }
    }
    let parser = Parser::new_ext(&block.source, opts());
    let mut out = String::with_capacity(block.source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

/// Splice annotation markers into a block's source for the rich overlay,
/// returning the block source untouched when there is nothing to overlay.
fn overlay_source<'a>(block: &'a Block, ranges: &[MarkRange]) -> Cow<'a, str> {
    if ranges.is_empty() || !overlay_eligible(block.kind) {
        return Cow::Borrowed(&block.source);
    }
    inject_marks(&block.source, ranges).map_or(Cow::Borrowed(block.source.as_str()), Cow::Owned)
}

/// Block kinds whose source text accepts an inline annotation overlay.
const fn overlay_eligible(kind: BlockKind) -> bool {
    matches!(
        kind,
        BlockKind::Paragraph
            | BlockKind::Heading
            | BlockKind::List
            | BlockKind::TaskList
            | BlockKind::BlockQuote
    )
}

/// Render a Markdown fragment to HTML, optionally applying open-md's inline
/// extensions (images, highlights, color spans). Code and raw-HTML blocks pass
/// `skip_inline = true` so their contents are never rewritten.
fn render_markdown_fragment(source: &str, skip_inline: bool) -> String {
    let transformed = if skip_inline {
        Cow::Borrowed(source)
    } else {
        transform_inline(source)
    };
    let parser = Parser::new_ext(&transformed, opts());
    let mut out = String::with_capacity(source.len() + 32);
    html::push_html(&mut out, parser);
    out
}

/// Apply open-md's inline image extension to a block source.
///
/// Performs a single left-to-right scan that copies inline code spans verbatim
/// and rewrites images (`![…]`) into HTML. Annotation markers (`<mark>` /
/// `<span>`) injected by [`inject_marks`] pass through untouched. Returns the
/// input unchanged when nothing matched.
fn transform_inline(source: &str) -> Cow<'_, str> {
    let mut out = String::new();
    let mut i = 0;
    let mut changed = false;

    while i < source.len() {
        let rest = &source[i..];

        if rest.starts_with('`') {
            let ticks = rest.bytes().take_while(|&b| b == b'`').count();
            if let Some(close) = find_backtick_close(&source[i + ticks..], ticks) {
                let end = i + ticks + close + ticks;
                out.push_str(&source[i..end]);
                i = end;
            } else {
                out.push_str(&source[i..i + ticks]);
                i += ticks;
            }
            continue;
        }

        if rest.starts_with("![") {
            if let Some((image, end)) = parse_image_at(source, i) {
                out.push_str(&render_img_tag(&image));
                i = end;
                changed = true;
                continue;
            }
        }

        let ch = rest.chars().next().unwrap_or('\u{fffd}');
        out.push(ch);
        i += ch.len_utf8();
    }

    if changed {
        Cow::Owned(out)
    } else {
        Cow::Borrowed(source)
    }
}

/// Find the byte offset (within `rest`) of the start of a closing backtick run
/// of exactly `len` ticks, or `None` when the span is left open.
fn find_backtick_close(rest: &str, len: usize) -> Option<usize> {
    let bytes = rest.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            let run = bytes[i..].iter().take_while(|&&b| b == b'`').count();
            if run == len {
                return Some(i);
            }
            i += run;
        } else {
            i += 1;
        }
    }
    None
}

/// Splice annotation open/close markers into `source` at the character offsets
/// described by `ranges`. Overlapping ranges and ranges with no valid marks are
/// skipped. Returns `None` when nothing was injected.
fn inject_marks(source: &str, ranges: &[MarkRange]) -> Option<String> {
    let char_len = source.chars().count();
    let mut spans: Vec<(usize, usize, String, String)> = Vec::new();
    for range in ranges {
        if !range.is_valid() {
            continue;
        }
        let Some((open, close)) = mark_wrappers(&range.marks) else {
            continue;
        };
        let start = range.start.min(char_len);
        let end = range.end.min(char_len);
        if start >= end {
            continue;
        }
        spans.push((start, end, open, close));
    }
    if spans.is_empty() {
        return None;
    }
    spans.sort_by_key(|span| span.0);

    let mut out = String::with_capacity(source.len() + 32);
    let mut next = 0;
    let mut active: Option<usize> = None;
    let mut last_end = 0;
    for (i, ch) in source.chars().enumerate() {
        if let Some(a) = active {
            if spans[a].1 == i {
                out.push_str(&spans[a].3);
                active = None;
            }
        }
        if active.is_none() {
            // Skip spans that overlap one we already opened.
            while next < spans.len() && spans[next].0 < last_end {
                next += 1;
            }
            if next < spans.len() && spans[next].0 == i {
                out.push_str(&spans[next].2);
                last_end = spans[next].1;
                active = Some(next);
                next += 1;
            }
        }
        out.push(ch);
    }
    if let Some(a) = active {
        out.push_str(&spans[a].3);
    }
    Some(out)
}

/// Build the open/close HTML for a set of marks (`highlight`, `fg-<color>`,
/// `bg-<color>`). Returns `None` when the set is empty or contains a mark
/// outside the supported palette.
fn mark_wrappers(marks: &[String]) -> Option<(String, String)> {
    let mut highlight = false;
    let mut classes = Vec::new();
    for mark in marks {
        if mark == "highlight" {
            highlight = true;
            continue;
        }
        let (prefix, color) = mark.split_once('-')?;
        if !matches!(prefix, "fg" | "bg") || !COLOR_PALETTE.contains(&color) {
            return None;
        }
        classes.push(format!("om-{prefix}-{color}"));
    }

    let mut open = String::new();
    let mut close = String::new();
    if highlight {
        open.push_str("<mark class=\"om-mark\">");
        close = format!("</mark>{close}");
    }
    if !classes.is_empty() {
        open.push_str("<span class=\"");
        open.push_str(&classes.join(" "));
        open.push_str("\">");
        close = format!("</span>{close}");
    }
    if open.is_empty() {
        None
    } else {
        Some((open, close))
    }
}

/// Render a callout block to its colored, iconified container.
fn render_callout(callout: &Callout) -> String {
    let kind = callout.kind.as_str();
    let title = callout
        .title
        .clone()
        .unwrap_or_else(|| callout.kind.default_title().to_string());
    let body = render_markdown_fragment(&callout.body, false);
    format!(
        "<div class=\"om-callout om-callout-{kind}\" data-callout=\"{kind}\">\
<div class=\"om-callout-title\"><span class=\"om-callout-icon\" aria-hidden=\"true\"></span>{title}</div>\
<div class=\"om-callout-body\">{body}</div></div>\n",
        title = escape_html(&title),
    )
}

/// Render a fenced code block with a language label, copy button, and line
/// numbers, or `None` when the block is not a fenced block carrying a
/// (non-mermaid) language token.
fn render_fenced_code(source: &str) -> Option<String> {
    let lang = fenced_language(source)?;
    if lang.eq_ignore_ascii_case("mermaid") {
        return None;
    }
    // Extract the raw code text (without fences) for the copy button data attr
    // and line-number rendering.
    let code_text = extract_code_text(source);
    let escaped_code = escape_html(&code_text);
    let line_count = code_text.lines().count().max(1);
    let line_numbers = (1..=line_count).fold(String::new(), |mut acc, n| {
        use std::fmt::Write;
        let _ = write!(acc, "<span>{n}</span>");
        acc
    });

    Some(format!(
        "<figure class=\"om-code\" data-lang=\"{attr}\">\
<figcaption>\
<span class=\"om-code-lang\">{label}</span>\
<button type=\"button\" class=\"om-code-copy\" data-om-copy aria-label=\"Copy code\">Copy</button>\
</figcaption>\
<div class=\"om-code-body\">\
<div class=\"om-code-lines\" aria-hidden=\"true\">{line_numbers}</div>\
<pre><code class=\"language-{attr}\">{escaped_code}</code></pre>\
</div>\
</figure>\n",
        attr = escape_attr(&lang),
        label = escape_html(&lang),
    ))
}

/// Extract the text content from a fenced code block (strip fences + info string).
fn extract_code_text(source: &str) -> String {
    let mut parser = Parser::new_ext(source, opts());
    let mut text = String::new();
    let mut in_code = false;
    for event in &mut parser {
        match event {
            Event::Start(Tag::CodeBlock(_)) => {
                in_code = true;
            }
            Event::Text(t) if in_code => text.push_str(&t),
            Event::End(TagEnd::CodeBlock) => break,
            _ => {}
        }
    }
    text
}

/// Extract the language token from a fenced code block's info string.
fn fenced_language(source: &str) -> Option<String> {
    let mut parser = Parser::new_ext(source, opts());
    match parser.next()? {
        Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(info))) => {
            let token = info.split_whitespace().next()?;
            if token.is_empty() {
                None
            } else {
                Some(token.to_string())
            }
        }
        _ => None,
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

/// Render a display-math block as a KaTeX-ready placeholder.
fn render_display_math(tex: &str) -> String {
    format!(
        "<div class=\"om-math-display\" data-om-math=\"display\">{}</div>\n",
        escape_html(tex)
    )
}

/// Rich rendering of front matter: a styled metadata panel with key/value rows.
fn render_front_matter_rich(source: &str) -> String {
    if let Some(fm) = parse_front_matter(source) {
        if fm.fields.is_empty() {
            return "<div class=\"om-frontmatter\"><em>(empty metadata)</em></div>\n".to_string();
        }
        let mut html = String::from("<div class=\"om-frontmatter\"><table>\n");
        for (key, value) in &fm.fields {
            let _ = writeln!(
                html,
                "<tr><th>{}</th><td>{}</td></tr>",
                escape_html(key),
                escape_html(value),
            );
        }
        html.push_str("</table></div>\n");
        html
    } else {
        // Fallback: render raw source as preformatted.
        render_front_matter_plain(source)
    }
}

/// Plain rendering of front matter: a preformatted code block.
fn render_front_matter_plain(source: &str) -> String {
    format!(
        "<pre class=\"om-frontmatter-raw\"><code>{}</code></pre>\n",
        escape_html(source.trim())
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

    #[test]
    fn renders_note_callout_with_chrome() {
        let doc = segment("> [!NOTE]\n> Body **text**.\n");
        let html = render_block(&doc.blocks[0]);

        assert_eq!(doc.blocks[0].kind, BlockKind::Callout);
        assert!(html.contains("om-callout om-callout-note"));
        assert!(html.contains("data-callout=\"note\""));
        assert!(html.contains(">Note<"));
        assert!(html.contains("<strong>text</strong>"));
    }

    #[test]
    fn renders_callout_custom_title_escaped() {
        let doc = segment("> [!warning] <Heads> up\n> careful\n");
        let html = render_block(&doc.blocks[0]);

        assert!(html.contains("om-callout-warning"));
        assert!(html.contains("&lt;Heads&gt; up"));
    }

    #[test]
    fn overlays_highlight_annotation_in_rich_mode() {
        let doc = segment("the important bit\n");
        let ranges = [MarkRange {
            start: 4,
            end: 13,
            marks: vec!["highlight".to_string()],
        }];
        let html = render_block_mode(&doc.blocks[0], RenderMode::Rich, &ranges);

        assert!(html.contains("<mark class=\"om-mark\">important</mark>"));
    }

    #[test]
    fn overlays_color_annotation_with_palette_classes() {
        let doc = segment("a danger b\n");
        let ranges = [MarkRange {
            start: 2,
            end: 8,
            marks: vec!["fg-red".to_string(), "bg-yellow".to_string()],
        }];
        let html = render_block_mode(&doc.blocks[0], RenderMode::Rich, &ranges);

        assert!(html.contains("<span class=\"om-fg-red om-bg-yellow\">danger</span>"));
    }

    #[test]
    fn ignores_annotations_with_unknown_marks() {
        let doc = segment("keep me\n");
        let ranges = [MarkRange {
            start: 0,
            end: 4,
            marks: vec!["bogus".to_string()],
        }];
        let html = render_block_mode(&doc.blocks[0], RenderMode::Rich, &ranges);

        assert!(!html.contains("<span"));
        assert!(!html.contains("<mark"));
        assert!(html.contains("keep me"));
    }

    #[test]
    fn does_not_overlay_in_plain_mode() {
        let doc = segment("the important bit\n");
        let ranges = [MarkRange {
            start: 4,
            end: 13,
            marks: vec!["highlight".to_string()],
        }];
        let html = render_block_mode(&doc.blocks[0], RenderMode::Plain, &ranges);

        assert!(!html.contains("<mark"));
        assert!(html.contains("important"));
    }

    #[test]
    fn plain_mode_degrades_callout_to_blockquote() {
        let doc = segment("> [!NOTE]\n> Body **text**.\n");
        let html = render_block_mode(&doc.blocks[0], RenderMode::Plain, &[]);

        assert!(html.contains("<blockquote>"));
        assert!(!html.contains("om-callout"));
        assert!(html.contains("<strong>text</strong>"));
    }

    #[test]
    fn plain_mode_strips_code_language_chrome() {
        let doc = segment("```rust\nfn main() {}\n```\n");
        let html = render_block_mode(&doc.blocks[0], RenderMode::Plain, &[]);

        assert!(!html.contains("om-code"));
        assert!(!html.contains("<figcaption>"));
        assert!(html.contains("<pre>"));
    }

    #[test]
    fn plain_mode_renders_mermaid_as_code_not_diagram() {
        let doc = segment("```mermaid\ngraph TD\n  A --> B\n```\n");
        let html = render_block_mode(&doc.blocks[0], RenderMode::Plain, &[]);

        assert!(!html.contains("class=\"mermaid\""));
        assert!(!html.contains("data-om-mermaid"));
        assert!(html.contains("<pre>"));
    }

    #[test]
    fn renders_code_block_with_language_label() {
        let doc = segment("```rust\nfn main() {}\n```\n");
        let html = render_block(&doc.blocks[0]);

        assert!(html.contains("class=\"om-code\""));
        assert!(html.contains("data-lang=\"rust\""));
        assert!(html.contains("om-code-lang\">rust</span>"));
        assert!(html.contains("data-om-copy"));
        assert!(html.contains("om-code-lines"));
        assert!(html.contains("<pre>"));
    }

    #[test]
    fn plain_code_block_has_no_language_chrome() {
        let doc = segment("```\nplain\n```\n");
        let html = render_block(&doc.blocks[0]);

        assert!(!html.contains("om-code"));
        assert!(html.contains("<pre><code>"));
    }

    #[test]
    fn renders_display_math_as_placeholder() {
        let doc = segment("$$\n\\int_0^1 x^2 dx\n$$\n");
        let html = render_block(&doc.blocks[0]);

        assert_eq!(doc.blocks[0].kind, BlockKind::Math);
        assert!(html.contains("om-math-display"));
        assert!(html.contains("data-om-math=\"display\""));
        assert!(html.contains("\\int_0^1 x^2 dx"));
        assert!(!html.contains("$$"));
    }

    #[test]
    fn escapes_display_math_html() {
        let doc = segment("$$\na < b > c\n$$\n");
        let html = render_block(&doc.blocks[0]);

        assert_eq!(doc.blocks[0].kind, BlockKind::Math);
        assert!(html.contains("a &lt; b &gt; c"));
        assert!(!html.contains("a < b > c"));
    }

    #[test]
    fn plain_mode_renders_math_as_preformatted() {
        let doc = segment("$$\nx^2\n$$\n");
        let html = render_block_mode(&doc.blocks[0], RenderMode::Plain, &[]);

        assert!(html.contains("<pre"));
        assert!(html.contains("om-math-raw"));
        assert!(!html.contains("data-om-math"));
    }
}
