//! WebAssembly bindings for the shared open-md Markdown engine.

#![deny(missing_docs)]

use om_engine::Annotations;
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Segment and render Markdown, returning the shared document payload as JSON.
///
/// Renders with an empty annotation layer. Use [`render_project_json`] to
/// overlay a project's IR-backed rich annotations.
#[wasm_bindgen]
pub fn parse_document_json(source: &str, path: &str) -> Result<String, JsValue> {
    serde_json::to_string(&om_engine::render_document_payload(source, path))
        .map_err(|error| JsValue::from_str(&format!("serialize document payload: {error}")))
}

/// Segment and render a Markdown body plus its annotation layer (JSON), as
/// produced from an open-md `.ommd` project file.
///
/// `annotations_json` must deserialize to the annotation layer (`{"blocks":
/// [...]}`); an empty string is treated as no annotations. Each rendered block
/// carries both rich (`html`) and plain (`plain_html`) HTML.
#[wasm_bindgen]
pub fn render_project_json(
    source: &str,
    path: &str,
    annotations_json: &str,
) -> Result<String, JsValue> {
    let annotations: Annotations = if annotations_json.trim().is_empty() {
        Annotations::default()
    } else {
        serde_json::from_str(annotations_json)
            .map_err(|error| JsValue::from_str(&format!("parse annotations: {error}")))?
    };
    serde_json::to_string(&om_engine::render_project_payload(
        source,
        path,
        &annotations,
    ))
    .map_err(|error| JsValue::from_str(&format!("serialize document payload: {error}")))
}

#[cfg(test)]
mod tests {
    use super::{parse_document_json, render_project_json};

    #[test]
    fn serializes_document_payload() {
        let json = parse_document_json("# H\n", "notes.md").expect("json");

        assert!(json.contains("\"path\":\"notes.md\""));
        assert!(json.contains("\"kind\":\"heading\""));
        assert!(json.contains("<h1>H</h1>"));
        assert!(json.contains("\"plain_html\""));
    }

    #[test]
    fn render_project_overlays_annotations() {
        let annotations =
            r#"{"blocks":[{"index":0,"ranges":[{"start":4,"end":13,"marks":["highlight"]}]}]}"#;
        let json =
            render_project_json("the important bit\n", "notes.md", annotations).expect("json");

        assert!(json.contains("om-mark"));
    }

    #[test]
    fn render_project_accepts_empty_annotations() {
        let json = render_project_json("# H\n", "notes.md", "").expect("json");

        assert!(json.contains("<h1>H</h1>"));
    }
}
