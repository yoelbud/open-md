//! WebAssembly bindings for the shared open-md Markdown engine.

#![deny(missing_docs)]

use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Segment and render Markdown, returning the shared document payload as JSON.
#[wasm_bindgen]
pub fn parse_document_json(source: &str, path: &str) -> Result<String, JsValue> {
    serde_json::to_string(&om_engine::render_document_payload(source, path))
        .map_err(|error| JsValue::from_str(&format!("serialize document payload: {error}")))
}

#[cfg(test)]
mod tests {
    use super::parse_document_json;

    #[test]
    fn serializes_document_payload() {
        let json = parse_document_json("# H\n", "notes.md").expect("json");

        assert!(json.contains("\"path\":\"notes.md\""));
        assert!(json.contains("\"kind\":\"heading\""));
        assert!(json.contains("<h1>H</h1>"));
    }
}
