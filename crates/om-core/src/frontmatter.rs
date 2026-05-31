//! YAML front matter detection and parsing.
//!
//! Front matter is a YAML metadata block fenced by `---` lines at the very
//! start (byte 0) of a Markdown document:
//!
//! ```text
//! ---
//! title: My Document
//! date: 2024-01-01
//! ---
//! ```
//!
//! This module provides detection (byte-range extraction) and a lightweight
//! key/value parser that does **not** depend on a full YAML library.

/// A detected front matter block with its byte range and parsed fields.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatter {
    /// Byte range `[start, end)` covering the entire front-matter fence
    /// (including both `---` delimiters and their trailing newlines).
    pub byte_range: (usize, usize),
    /// Ordered key/value pairs extracted from the YAML body.
    pub fields: Vec<(String, String)>,
}

/// Attempt to detect and parse a YAML front matter block at the start of
/// `source`.
///
/// Returns `None` when:
/// - The source does not begin with `---` followed by a newline.
/// - No closing `---` line is found.
///
/// The returned [`FrontMatter::byte_range`] is an absolute `[0, end)` span
/// suitable for direct use as a block's `src_range`.
#[must_use]
pub fn parse_front_matter(source: &str) -> Option<FrontMatter> {
    let range = detect_front_matter(source)?;
    let raw = &source[range.0..range.1];

    // Strip the opening and closing `---` lines to get the YAML body.
    let body = raw
        .strip_prefix("---")
        .unwrap_or(raw)
        .trim_start_matches(['\r', '\n']);
    // Find the closing fence and take everything before it.
    let yaml_body = body.rfind("\n---").map_or("", |pos| &body[..pos]);

    let fields = parse_yaml_fields(yaml_body);
    Some(FrontMatter {
        byte_range: range,
        fields,
    })
}

/// Detect the byte range of a front matter block at the start of `source`.
///
/// Returns `Some((0, end))` where `end` is the byte offset just past the
/// closing `---` line (including its trailing newline if present). Returns
/// `None` if there is no valid front matter at byte 0.
#[must_use]
pub fn detect_front_matter(source: &str) -> Option<(usize, usize)> {
    // Must start exactly at byte 0 with `---` followed by a newline (or EOF
    // for degenerate cases, but we require content).
    if !source.starts_with("---") {
        return None;
    }
    let after_open = &source[3..];
    // The opening fence must be followed by a newline (possibly \r\n).
    let newline_len = if after_open.starts_with("\r\n") {
        2
    } else if after_open.starts_with('\n') {
        1
    } else {
        // `---` not followed by newline → not front matter (could be `---text`).
        return None;
    };

    let body_start = 3 + newline_len;
    // Search for a closing `---` at the start of a line. A blank line inside
    // the fence body terminates the search — real front matter has no blank
    // lines between fences (this prevents `---\n\n---` from being misread as
    // front matter when it is actually a thematic break + blank + thematic break).
    let body = &source[body_start..];
    let bytes = body.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    while pos < len {
        // Find end of current line.
        let line_start = pos;
        while pos < len && bytes[pos] != b'\n' {
            pos += 1;
        }
        let line_end = pos; // exclusive (before the \n)
                            // Advance past the \n.
        if pos < len {
            pos += 1;
        }
        // Check if the line content (stripping trailing \r) is "---".
        let mut content_end = line_end;
        if content_end > line_start && bytes[content_end - 1] == b'\r' {
            content_end -= 1;
        }
        let content_len = content_end - line_start;
        // Blank line → not valid front matter.
        if content_len == 0 {
            return None;
        }
        if content_len == 3
            && bytes[line_start] == b'-'
            && bytes[line_start + 1] == b'-'
            && bytes[line_start + 2] == b'-'
        {
            // `pos` is now right past the `\n` of the closing fence line (or
            // at the end of `body` if no trailing newline). That gives us the
            // exact end of the front matter block.
            let end = body_start + pos;
            return Some((0, end));
        }
    }
    None
}

/// Lightweight YAML field parser — extracts top-level `key: value` pairs.
///
/// This is intentionally minimal: it handles simple scalar values only
/// (no nested objects, arrays, or multi-line strings). Complex YAML should
/// be rendered as-is without field extraction; the fields are best-effort
/// for the preview table.
fn parse_yaml_fields(yaml: &str) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim().to_string();
            let value = trimmed[colon_pos + 1..].trim().to_string();
            if !key.is_empty() {
                fields.push((key, value));
            }
        }
    }
    fields
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_basic_front_matter() {
        let src = "---\ntitle: Hello\ndate: 2024-01-01\n---\n\n# Heading\n";
        let range = detect_front_matter(src).expect("should detect");
        assert_eq!(range, (0, 38));
        assert_eq!(
            &src[range.0..range.1],
            "---\ntitle: Hello\ndate: 2024-01-01\n---\n"
        );
    }

    #[test]
    fn parses_fields() {
        let src = "---\ntitle: Hello\ndate: 2024-01-01\ntags: rust, markdown\n---\n";
        let fm = parse_front_matter(src).expect("should parse");
        assert_eq!(fm.byte_range, (0, src.len()));
        assert_eq!(
            fm.fields,
            vec![
                ("title".to_string(), "Hello".to_string()),
                ("date".to_string(), "2024-01-01".to_string()),
                ("tags".to_string(), "rust, markdown".to_string()),
            ]
        );
    }

    #[test]
    fn rejects_non_start_fence() {
        let src = "some text\n---\ntitle: x\n---\n";
        assert!(detect_front_matter(src).is_none());
    }

    #[test]
    fn rejects_thematic_break_without_newline_after_open() {
        // `---` used as thematic break (no newline content before close)
        // Actually `---\n---\n` is a degenerate but valid empty front matter.
        let src = "---text\n";
        assert!(detect_front_matter(src).is_none());
    }

    #[test]
    fn rejects_unclosed_fence() {
        let src = "---\ntitle: Hello\nno closing fence\n";
        assert!(detect_front_matter(src).is_none());
    }

    #[test]
    fn handles_empty_front_matter() {
        let src = "---\n---\nBody here.\n";
        let fm = parse_front_matter(src).expect("should parse");
        assert_eq!(fm.byte_range, (0, 8));
        assert_eq!(&src[0..8], "---\n---\n");
        assert!(fm.fields.is_empty());
    }

    #[test]
    fn handles_crlf_line_endings() {
        let src = "---\r\ntitle: Hi\r\n---\r\nBody.\r\n";
        let fm = parse_front_matter(src).expect("should parse");
        assert_eq!(
            &src[fm.byte_range.0..fm.byte_range.1],
            "---\r\ntitle: Hi\r\n---\r\n"
        );
        assert_eq!(fm.fields, vec![("title".to_string(), "Hi".to_string())]);
    }

    #[test]
    fn skips_comment_lines() {
        let src = "---\n# comment\ntitle: x\n---\n";
        let fm = parse_front_matter(src).expect("should parse");
        assert_eq!(fm.fields, vec![("title".to_string(), "x".to_string())]);
    }
}
