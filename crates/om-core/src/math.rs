//! Display-math (`$$ ... $$`) helpers used by segmentation and rendering.
//!
//! A paragraph whose trimmed source starts with `$$` and ends with `$$` is
//! promoted to [`crate::BlockKind::Math`]. The inner TeX content (between the
//! dollar fences) is extracted for rendering.
//!
//! ```text
//! $$
//! \int_0^1 x^2 \, dx = \frac{1}{3}
//! $$
//! ```

/// Parse the inner TeX content from a display-math block, or return `None`
/// when the source does not match the `$$ ... $$` pattern.
///
/// The source is trimmed before matching. Both single-line (`$$E=mc^2$$`) and
/// multi-line fences are supported. The returned slice excludes the `$$`
/// delimiters and leading/trailing whitespace.
#[must_use]
pub fn parse_display_math(source: &str) -> Option<&str> {
    let trimmed = source.trim();
    let inner = trimmed.strip_prefix("$$")?.strip_suffix("$$")?;
    // Reject empty: `$$$$` with nothing inside.
    let inner = inner.trim();
    if inner.is_empty() {
        return None;
    }
    Some(inner)
}

/// Whether a paragraph slice is a display-math block.
#[must_use]
pub fn is_display_math(source: &str) -> bool {
    parse_display_math(source).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_line() {
        let src = "$$E = mc^2$$";
        assert_eq!(parse_display_math(src), Some("E = mc^2"));
    }

    #[test]
    fn parses_multi_line() {
        let src = "$$\n\\int_0^1 x^2 dx\n$$";
        assert_eq!(parse_display_math(src), Some("\\int_0^1 x^2 dx"));
    }

    #[test]
    fn trims_surrounding_whitespace() {
        let src = "  $$\n  x + y  \n$$  ";
        assert_eq!(parse_display_math(src), Some("x + y"));
    }

    #[test]
    fn rejects_empty() {
        assert!(parse_display_math("$$$$").is_none());
        assert!(parse_display_math("$$  $$").is_none());
    }

    #[test]
    fn rejects_non_math() {
        assert!(parse_display_math("hello world").is_none());
        assert!(parse_display_math("$single$").is_none());
    }

    #[test]
    fn rejects_unbalanced() {
        assert!(parse_display_math("$$ open only").is_none());
        assert!(parse_display_math("close only $$").is_none());
    }

    #[test]
    fn is_display_math_detects_correctly() {
        assert!(is_display_math("$$x$$"));
        assert!(!is_display_math("just text"));
    }
}
