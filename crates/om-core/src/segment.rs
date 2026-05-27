//! Coarse block segmenter — turns raw Markdown into a flat list of top-level
//! blocks with stable IDs.
//!
//! M0 implementation: uses pulldown-cmark's offset iterator to find the byte
//! ranges of top-level blocks. Later milestones will add finer-grained AST
//! per block and incremental re-segmentation.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use xxhash_rust::xxh3::xxh3_64;

use crate::ir::{Block, BlockKind, Document};

fn opts() -> Options {
    Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_SMART_PUNCTUATION
}

fn kind_for_tag(tag: &Tag<'_>) -> Option<BlockKind> {
    Some(match tag {
        Tag::Heading { .. } => BlockKind::Heading,
        Tag::Paragraph => BlockKind::Paragraph,
        Tag::List(_) => BlockKind::List,
        Tag::CodeBlock(_) => BlockKind::Code,
        Tag::Table(_) => BlockKind::Table,
        Tag::BlockQuote(_) => BlockKind::BlockQuote,
        Tag::HtmlBlock => BlockKind::Html,
        _ => return None,
    })
}

/// Segment `source` into top-level blocks.
pub fn segment(source: &str) -> Document {
    let parser = Parser::new_ext(source, opts()).into_offset_iter();
    let mut blocks = Vec::new();
    let mut depth = 0i32;
    let mut current_kind: Option<BlockKind> = None;
    let mut current_start: usize = 0;

    for (event, range) in parser {
        match event {
            Event::Start(ref tag) => {
                if depth == 0 {
                    current_kind = kind_for_tag(tag).or(Some(BlockKind::Unknown));
                    current_start = range.start;
                }
                depth += 1;
            }
            Event::End(TagEnd::Heading(_))
            | Event::End(TagEnd::Paragraph)
            | Event::End(TagEnd::List(_))
            | Event::End(TagEnd::CodeBlock)
            | Event::End(TagEnd::Table)
            | Event::End(TagEnd::BlockQuote(_))
            | Event::End(TagEnd::HtmlBlock) => {
                depth -= 1;
                if depth == 0 {
                    let kind = current_kind.take().unwrap_or(BlockKind::Unknown);
                    push_block(&mut blocks, source, current_start, range.end, kind);
                }
            }
            Event::End(_) => {
                depth -= 1;
            }
            Event::Rule => {
                if depth == 0 {
                    push_block(
                        &mut blocks,
                        source,
                        range.start,
                        range.end,
                        BlockKind::ThematicBreak,
                    );
                }
            }
            _ => {}
        }
    }

    Document { blocks }
}

fn push_block(out: &mut Vec<Block>, source: &str, start: usize, end: usize, kind: BlockKind) {
    let slice = &source[start..end];
    let hash = xxh3_64(slice.as_bytes());
    // M0 placeholder ID: hash + index. Stable-across-edits IDs come in M2.
    let id = format!("b{:016x}-{}", hash, out.len());
    out.push(Block {
        id,
        kind,
        src_range: (start, end),
        hash,
        source: slice.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_basic_doc() {
        let src = "# Title\n\nA paragraph.\n\n- a\n- b\n\n```rs\nfn x(){}\n```\n";
        let doc = segment(src);
        let kinds: Vec<_> = doc.blocks.iter().map(|b| b.kind).collect();
        assert_eq!(
            kinds,
            vec![
                BlockKind::Heading,
                BlockKind::Paragraph,
                BlockKind::List,
                BlockKind::Code,
            ]
        );
    }

    #[test]
    fn hashes_are_stable() {
        let src = "Hello world.\n";
        let a = segment(src);
        let b = segment(src);
        assert_eq!(a.blocks[0].hash, b.blocks[0].hash);
    }
}
