//! Coarse block segmenter — turns raw Markdown into a flat list of top-level
//! blocks with stable IDs.
//!
//! M0 implementation: uses [`pulldown_cmark`]'s offset iterator to find the
//! byte ranges of top-level blocks. Later milestones will add finer-grained
//! AST per block and incremental re-segmentation.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use xxhash_rust::xxh3::xxh3_64;

use crate::callout::is_callout;
use crate::frontmatter::detect_front_matter;
use crate::image::parse_image_block;
use crate::ir::{Block, BlockKind, Document};

const fn opts() -> Options {
    Options::ENABLE_TABLES
        .union(Options::ENABLE_TASKLISTS)
        .union(Options::ENABLE_STRIKETHROUGH)
        .union(Options::ENABLE_FOOTNOTES)
        .union(Options::ENABLE_SMART_PUNCTUATION)
}

const fn kind_for_tag(tag: &Tag<'_>) -> Option<BlockKind> {
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

/// Segment `source` into top-level Markdown blocks.
///
/// Each top-level block in the source is returned with its byte range,
/// raw source text, and content hash. Lists, tables and block quotes are
/// emitted as a single block (their nested contents are not split out).
///
/// A YAML front matter fence (`---\n...\n---\n`) at byte 0 is emitted as a
/// [`BlockKind::FrontMatter`] block before the remaining Markdown is parsed.
#[must_use]
pub fn segment(source: &str) -> Document {
    let mut blocks = Vec::new();

    // Detect front matter before the pulldown_cmark pass. Front matter is
    // only valid at byte 0 so it cannot be confused with a thematic break.
    let remainder_start = if let Some((start, end)) = detect_front_matter(source) {
        push_block(&mut blocks, source, start, end, BlockKind::FrontMatter);
        end
    } else {
        0
    };

    let remainder = &source[remainder_start..];
    let parser = Parser::new_ext(remainder, opts()).into_offset_iter();
    let mut depth: i32 = 0;
    let mut current_kind: Option<BlockKind> = None;
    let mut current_start: usize = 0;

    for (event, range) in parser {
        match event {
            Event::Start(ref tag) => {
                if depth == 0 {
                    current_kind = kind_for_tag(tag).or(Some(BlockKind::Unknown));
                    current_start = range.start + remainder_start;
                }
                depth += 1;
            }
            Event::End(
                TagEnd::Heading(_)
                | TagEnd::Paragraph
                | TagEnd::List(_)
                | TagEnd::CodeBlock
                | TagEnd::Table
                | TagEnd::BlockQuote(_)
                | TagEnd::HtmlBlock,
            ) => {
                depth -= 1;
                if depth == 0 {
                    let kind = current_kind.take().unwrap_or(BlockKind::Unknown);
                    push_block(
                        &mut blocks,
                        source,
                        current_start,
                        range.end + remainder_start,
                        kind,
                    );
                }
            }
            Event::End(_) => {
                depth -= 1;
            }
            Event::TaskListMarker(_) if current_kind == Some(BlockKind::List) => {
                current_kind = Some(BlockKind::TaskList);
            }
            Event::Rule if depth == 0 => {
                push_block(
                    &mut blocks,
                    source,
                    range.start + remainder_start,
                    range.end + remainder_start,
                    BlockKind::ThematicBreak,
                );
            }
            _ => {}
        }
    }

    Document { blocks }
}

fn push_block(out: &mut Vec<Block>, source: &str, start: usize, end: usize, kind: BlockKind) {
    let slice = &source[start..end];
    let kind = match kind {
        BlockKind::Paragraph if parse_image_block(slice).is_some() => BlockKind::Image,
        BlockKind::BlockQuote if is_callout(slice) => BlockKind::Callout,
        other => other,
    };
    let hash = xxh3_64(slice.as_bytes());
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

    #[test]
    fn src_ranges_cover_block_source() {
        let src = "# H\n\npara\n\n- l1\n- l2\n";
        let doc = segment(src);
        for b in &doc.blocks {
            let (s, e) = b.src_range;
            assert!(e <= src.len());
            assert_eq!(&src[s..e], b.source);
        }
    }

    #[test]
    fn thematic_break_emitted_at_top_level() {
        let src = "before\n\n---\n\nafter\n";
        let kinds: Vec<_> = segment(src).blocks.iter().map(|b| b.kind).collect();
        assert_eq!(
            kinds,
            vec![
                BlockKind::Paragraph,
                BlockKind::ThematicBreak,
                BlockKind::Paragraph,
            ]
        );
    }

    #[test]
    fn unchanged_blocks_keep_their_hashes_after_edit() {
        let before = segment("# Title\n\npara one\n\npara two\n");
        let after = segment("# Title\n\npara ONE\n\npara two\n");
        assert_eq!(before.blocks[0].hash, after.blocks[0].hash);
        assert_ne!(before.blocks[1].hash, after.blocks[1].hash);
        assert_eq!(before.blocks[2].hash, after.blocks[2].hash);
    }

    #[test]
    fn task_list_emits_task_list_kind() {
        let doc = segment("- [x] done\n- [ ] todo\n");

        assert_eq!(doc.blocks[0].kind, BlockKind::TaskList);
    }

    #[test]
    fn image_only_paragraph_emits_image_kind() {
        let doc = segment("![cat](https://x/y.png =300x200){.center}\n");

        assert_eq!(doc.blocks[0].kind, BlockKind::Image);
    }

    #[test]
    fn alert_block_quote_emits_callout_kind() {
        let doc = segment("> [!NOTE]\n> Heads up.\n");

        assert_eq!(doc.blocks[0].kind, BlockKind::Callout);
    }

    #[test]
    fn plain_block_quote_stays_block_quote() {
        let doc = segment("> just a quote\n");

        assert_eq!(doc.blocks[0].kind, BlockKind::BlockQuote);
    }

    #[test]
    fn callout_src_range_slices_back_to_source() {
        let src = "intro\n\n> [!TIP]\n> Be tidy.\n";
        let doc = segment(src);
        let callout = doc
            .blocks
            .iter()
            .find(|b| b.kind == BlockKind::Callout)
            .expect("callout block");
        let (s, e) = callout.src_range;
        assert_eq!(&src[s..e], callout.source);
    }

    #[test]
    fn front_matter_emitted_as_first_block() {
        let src = "---\ntitle: Hello\n---\n\n# Heading\n\npara\n";
        let doc = segment(src);
        assert_eq!(doc.blocks[0].kind, BlockKind::FrontMatter);
        assert_eq!(doc.blocks[0].source, "---\ntitle: Hello\n---\n");
        assert_eq!(doc.blocks[0].src_range, (0, 21));
        assert_eq!(doc.blocks[1].kind, BlockKind::Heading);
        assert_eq!(doc.blocks[2].kind, BlockKind::Paragraph);
    }

    #[test]
    fn front_matter_src_ranges_are_absolute() {
        let src = "---\nkey: val\n---\n\n# H\n\npara\n";
        let doc = segment(src);
        for b in &doc.blocks {
            let (s, e) = b.src_range;
            assert!(e <= src.len(), "end {} exceeds source len {}", e, src.len());
            assert_eq!(&src[s..e], b.source);
        }
    }

    #[test]
    fn thematic_break_not_confused_with_front_matter() {
        let src = "para\n\n---\n\nafter\n";
        let doc = segment(src);
        assert_eq!(doc.blocks[0].kind, BlockKind::Paragraph);
        assert_eq!(doc.blocks[1].kind, BlockKind::ThematicBreak);
        assert_eq!(doc.blocks[2].kind, BlockKind::Paragraph);
    }

    #[test]
    fn front_matter_hash_is_stable() {
        let src = "---\ntitle: X\n---\n\n# H\n";
        let a = segment(src);
        let b = segment(src);
        assert_eq!(a.blocks[0].hash, b.blocks[0].hash);
    }
}
