//! Markdown image helpers used by segmentation and rendering.

/// Alignment marker accepted after an image-only block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ImageAlignment {
    /// Left-aligned image block (`{.left}`).
    Left,
    /// Center-aligned image block (`{.center}`).
    Center,
    /// Right-aligned image block (`{.right}`).
    Right,
}

impl ImageAlignment {
    /// CSS class suffix used by the preview renderer.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Center => "center",
            Self::Right => "right",
        }
    }
}

/// Parsed Markdown image syntax.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedImage {
    /// Image alternative text.
    pub alt: String,
    /// Original Markdown image destination.
    pub src: String,
    /// Optional title text.
    pub title: Option<String>,
    /// Optional CSS width dimension.
    pub width: Option<String>,
    /// Optional CSS height dimension.
    pub height: Option<String>,
    /// Optional block alignment.
    pub align: Option<ImageAlignment>,
}

/// Parse a complete image-only Markdown block.
///
/// Supports the image syntax used by the preview editor:
/// `![alt](src)`, optional quoted title, optional Maruku-style `=WxH` size,
/// and an optional trailing `{.left}` / `{.center}` / `{.right}` marker.
#[must_use]
pub fn parse_image_block(raw: &str) -> Option<ParsedImage> {
    let (source, align) = strip_alignment(raw.trim());
    let (mut image, end) = parse_image_at(source, 0)?;
    if end != source.len() {
        return None;
    }
    image.align = align;
    Some(image)
}

/// Parse an inline image beginning at `start`, returning the image and the
/// byte offset just after the closing `)`.
#[must_use]
pub fn parse_image_at(source: &str, start: usize) -> Option<(ParsedImage, usize)> {
    let rest = source.get(start..)?;
    if !rest.starts_with("![") {
        return None;
    }

    let alt_start = start + 2;
    let alt_end = source.get(alt_start..)?.find(']')? + alt_start;
    let after_alt = source.get(alt_end..)?;
    if !after_alt.starts_with("](") {
        return None;
    }

    let inner_start = alt_end + 2;
    let inner_end = source.get(inner_start..)?.find(')')? + inner_start;
    let inner = source.get(inner_start..inner_end)?.trim();
    let (src, title, width, height) = parse_image_destination(inner)?;

    Some((
        ParsedImage {
            alt: source.get(alt_start..alt_end)?.to_string(),
            src,
            title,
            width,
            height,
            align: None,
        },
        inner_end + 1,
    ))
}

fn strip_alignment(source: &str) -> (&str, Option<ImageAlignment>) {
    let Some(before_close) = source.strip_suffix('}') else {
        return (source, None);
    };
    let Some(open_index) = before_close.rfind('{') else {
        return (source, None);
    };
    let marker = before_close[open_index + 1..].trim();
    let align = match marker.strip_prefix('.') {
        Some("left") => ImageAlignment::Left,
        Some("center") => ImageAlignment::Center,
        Some("right") => ImageAlignment::Right,
        _ => return (source, None),
    };
    (before_close[..open_index].trim_end(), Some(align))
}

type ImageDestination = (String, Option<String>, Option<String>, Option<String>);

fn parse_image_destination(inner: &str) -> Option<ImageDestination> {
    let mut parts = inner.splitn(2, char::is_whitespace);
    let src = parts.next()?.trim();
    if src.is_empty() || src.chars().any(|ch| matches!(ch, '(' | ')' | '"' | '\'')) {
        return None;
    }

    let mut rest = parts.next().unwrap_or("").trim_start();
    let title = if let Some(after_quote) = rest.strip_prefix('"') {
        let end_quote = after_quote.find('"')?;
        let title = after_quote[..end_quote].to_string();
        rest = after_quote[end_quote + 1..].trim_start();
        Some(title)
    } else {
        None
    };

    let (width, height) = if rest.is_empty() {
        (None, None)
    } else if let Some(size) = rest.strip_prefix('=') {
        let size = size.trim();
        if size.chars().any(char::is_whitespace) {
            return None;
        }
        parse_size_token(size)?
    } else {
        return None;
    };

    Some((src.to_string(), title, width, height))
}

fn parse_size_token(size: &str) -> Option<(Option<String>, Option<String>)> {
    let (width, height) = size.split_once('x')?;
    Some((parse_dimension(width)?, parse_dimension(height)?))
}

#[allow(clippy::option_option)] // inner None = omitted dim, outer None = parse error; enum would add complexity for no gain
fn parse_dimension(value: &str) -> Option<Option<String>> {
    if value.is_empty() {
        return Some(None);
    }
    if value.chars().all(|ch| ch.is_ascii_digit()) {
        return Some(Some(format!("{value}px")));
    }
    let number = value.strip_suffix('%')?;
    if number.is_empty() || !number.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    Some(Some(value.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{parse_image_at, parse_image_block, ImageAlignment};

    #[test]
    fn parses_basic_image_block() {
        let image = parse_image_block("![cat](https://x/y.png)\n").expect("image");

        assert_eq!(image.alt, "cat");
        assert_eq!(image.src, "https://x/y.png");
        assert_eq!(image.title, None);
        assert_eq!(image.width, None);
        assert_eq!(image.height, None);
        assert_eq!(image.align, None);
    }

    #[test]
    fn parses_image_title_size_and_alignment() {
        let image = parse_image_block("![a](u \"hello\" =50%x120){ .center }").expect("image");

        assert_eq!(image.title.as_deref(), Some("hello"));
        assert_eq!(image.width.as_deref(), Some("50%"));
        assert_eq!(image.height.as_deref(), Some("120px"));
        assert_eq!(image.align, Some(ImageAlignment::Center));
    }

    #[test]
    fn parses_inline_image_at_offset() {
        let source = "before ![alt](u =300x200) after";
        let (image, end) = parse_image_at(source, 7).expect("image");

        assert_eq!(image.alt, "alt");
        assert_eq!(image.width.as_deref(), Some("300px"));
        assert_eq!(image.height.as_deref(), Some("200px"));
        assert_eq!(&source[end..], " after");
    }

    #[test]
    fn rejects_non_image_blocks() {
        assert!(parse_image_block("![a](u) trailing").is_none());
        assert!(parse_image_block("text ![a](u)").is_none());
        assert!(parse_image_block("![a](u =wide)").is_none());
    }
}
