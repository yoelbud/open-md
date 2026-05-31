//! Callout / admonition helpers used by segmentation and rendering.
//!
//! Callouts reuse GitHub's alert syntax: a block quote whose first content
//! line is a `[!KIND]` marker, optionally followed by a custom title.
//!
//! ```text
//! > [!NOTE]
//! > Useful information the reader should notice.
//! ```
//!
//! The marker round-trips as ordinary Markdown (it is still a block quote on
//! renderers that do not understand callouts), while open-md promotes it to a
//! dedicated [`crate::BlockKind::Callout`] so the preview can give it colored,
//! iconified chrome.

/// The severity / intent of a callout block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CalloutKind {
    /// Neutral, informational aside (`[!NOTE]`).
    Note,
    /// Helpful suggestion (`[!TIP]`).
    Tip,
    /// Crucial information the reader must not miss (`[!IMPORTANT]`).
    Important,
    /// Potential pitfall (`[!WARNING]`).
    Warning,
    /// Negative consequence of an action (`[!CAUTION]`).
    Caution,
}

impl CalloutKind {
    /// CSS class suffix used by the preview renderer.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Tip => "tip",
            Self::Important => "important",
            Self::Warning => "warning",
            Self::Caution => "caution",
        }
    }

    /// Default human-readable title when the author does not supply one.
    #[must_use]
    pub const fn default_title(self) -> &'static str {
        match self {
            Self::Note => "Note",
            Self::Tip => "Tip",
            Self::Important => "Important",
            Self::Warning => "Warning",
            Self::Caution => "Caution",
        }
    }

    fn from_token(token: &str) -> Option<Self> {
        match token.to_ascii_lowercase().as_str() {
            "note" => Some(Self::Note),
            "tip" => Some(Self::Tip),
            "important" => Some(Self::Important),
            "warning" => Some(Self::Warning),
            "caution" => Some(Self::Caution),
            _ => None,
        }
    }
}

/// A parsed callout block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Callout {
    /// Callout severity / intent.
    pub kind: CalloutKind,
    /// Optional author-supplied title (overrides [`CalloutKind::default_title`]).
    pub title: Option<String>,
    /// Markdown body of the callout (block-quote markers already stripped).
    pub body: String,
}

/// Strip a single block-quote marker (`>` plus an optional single space) from a
/// line. Returns the line unchanged when it carries no marker.
fn strip_quote_marker(line: &str) -> &str {
    let trimmed = line.trim_start();
    trimmed
        .strip_prefix('>')
        .map_or(line, |rest| rest.strip_prefix(' ').unwrap_or(rest))
}

/// Parse a block-quote slice as a callout, or return `None` when its first
/// content line is not a `[!KIND]` marker.
#[must_use]
pub fn parse_callout(raw: &str) -> Option<Callout> {
    let mut lines = raw.lines().map(strip_quote_marker);

    let marker = loop {
        let line = lines.next()?;
        if !line.trim().is_empty() {
            break line.trim();
        }
    };

    let inner = marker.strip_prefix("[!")?;
    let close = inner.find(']')?;
    let kind = CalloutKind::from_token(inner[..close].trim())?;
    let title = {
        let rest = inner[close + 1..].trim();
        if rest.is_empty() {
            None
        } else {
            Some(rest.to_string())
        }
    };

    let body = lines.collect::<Vec<_>>().join("\n");
    Some(Callout {
        kind,
        title,
        body: body.trim_matches('\n').to_string(),
    })
}

/// Whether a block-quote slice is a callout.
#[must_use]
pub fn is_callout(raw: &str) -> bool {
    parse_callout(raw).is_some()
}

#[cfg(test)]
mod tests {
    use super::{parse_callout, CalloutKind};

    #[test]
    fn parses_basic_callout() {
        let callout = parse_callout("> [!NOTE]\n> Body line.\n").expect("callout");

        assert_eq!(callout.kind, CalloutKind::Note);
        assert_eq!(callout.title, None);
        assert_eq!(callout.body, "Body line.");
    }

    #[test]
    fn parses_custom_title_and_multiline_body() {
        let callout =
            parse_callout("> [!warning] Heads up\n> line one\n> line two\n").expect("callout");

        assert_eq!(callout.kind, CalloutKind::Warning);
        assert_eq!(callout.title.as_deref(), Some("Heads up"));
        assert_eq!(callout.body, "line one\nline two");
    }

    #[test]
    fn rejects_plain_block_quote() {
        assert!(parse_callout("> just a quote\n").is_none());
        assert!(parse_callout("> [!BOGUS]\n> body\n").is_none());
    }

    #[test]
    fn recognizes_every_kind() {
        for (marker, kind) in [
            ("note", CalloutKind::Note),
            ("tip", CalloutKind::Tip),
            ("important", CalloutKind::Important),
            ("warning", CalloutKind::Warning),
            ("caution", CalloutKind::Caution),
        ] {
            let raw = format!("> [!{marker}]\n> x\n");
            assert_eq!(parse_callout(&raw).expect("callout").kind, kind);
        }
    }
}
