//! Property-based tests for the segmenter.
//!
//! Generates arbitrary multi-block Markdown documents from a small set of
//! kinds and asserts the invariants we rely on for incremental rendering.

use om_core::{segment, BlockKind};
use proptest::prelude::*;

#[derive(Debug, Clone)]
enum Snippet {
    Heading(u8, String),
    Para(String),
    Code(String),
    Rule,
}

impl Snippet {
    fn render(&self) -> String {
        match self {
            Self::Heading(level, text) => {
                let hashes = "#".repeat(usize::from(*level).clamp(1, 6));
                format!("{hashes} {text}\n\n")
            }
            Self::Para(text) => format!("{text}\n\n"),
            Self::Code(text) => format!("```\n{text}\n```\n\n"),
            Self::Rule => "---\n\n".to_string(),
        }
    }

    const fn kind(&self) -> BlockKind {
        match self {
            Self::Heading(..) => BlockKind::Heading,
            Self::Para(_) => BlockKind::Paragraph,
            Self::Code(_) => BlockKind::Code,
            Self::Rule => BlockKind::ThematicBreak,
        }
    }
}

fn snippet_strategy() -> impl Strategy<Value = Snippet> {
    // Non-empty text that doesn't start or end with whitespace, so CommonMark
    // can't drop the block as blank.
    let text = "[a-zA-Z0-9][a-zA-Z0-9 ]{0,38}[a-zA-Z0-9]";
    prop_oneof![
        (1u8..=6, text).prop_map(|(l, t)| Snippet::Heading(l, t)),
        text.prop_map(Snippet::Para),
        text.prop_map(Snippet::Code),
        Just(Snippet::Rule),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(128))]

    #[test]
    fn src_ranges_match_source_field(snippets in proptest::collection::vec(snippet_strategy(), 1..8)) {
        let src: String = snippets.iter().map(Snippet::render).collect();
        let doc = segment(&src);
        for b in &doc.blocks {
            let (s, e) = b.src_range;
            prop_assert!(e <= src.len());
            prop_assert_eq!(&src[s..e], &b.source);
        }
    }

    #[test]
    fn deterministic(snippets in proptest::collection::vec(snippet_strategy(), 1..8)) {
        let src: String = snippets.iter().map(Snippet::render).collect();
        let a = segment(&src);
        let b = segment(&src);
        prop_assert_eq!(a, b);
    }

    #[test]
    fn block_kinds_match_expected(snippets in proptest::collection::vec(snippet_strategy(), 1..8)) {
        let src: String = snippets.iter().map(Snippet::render).collect();
        let doc = segment(&src);
        let expected: Vec<_> = snippets.iter().map(Snippet::kind).collect();
        let got: Vec<_> = doc.blocks.iter().map(|b| b.kind).collect();
        prop_assert_eq!(got, expected);
    }

    #[test]
    fn unchanged_blocks_keep_hashes(
        prefix in proptest::collection::vec(snippet_strategy(), 1..4),
        suffix in proptest::collection::vec(snippet_strategy(), 1..4),
        old_mid in "[a-zA-Z0-9][a-zA-Z0-9 ]{0,18}[a-zA-Z0-9]",
        new_mid in "[a-zA-Z0-9][a-zA-Z0-9 ]{0,18}[a-zA-Z0-9]",
    ) {
        prop_assume!(old_mid != new_mid);
        let render_all = |mid: &str| {
            let mut s = String::new();
            for p in &prefix { s.push_str(&p.render()); }
            s.push_str(&Snippet::Para(mid.to_string()).render());
            for x in &suffix { s.push_str(&x.render()); }
            s
        };
        let before = segment(&render_all(&old_mid));
        let after = segment(&render_all(&new_mid));
        prop_assert_eq!(before.blocks.len(), after.blocks.len());
        let mid_idx = prefix.len();
        for (i, (a, b)) in before.blocks.iter().zip(after.blocks.iter()).enumerate() {
            if i == mid_idx {
                prop_assert_ne!(a.hash, b.hash);
            } else {
                prop_assert_eq!(a.hash, b.hash, "block {} should be unchanged", i);
            }
        }
    }
}
