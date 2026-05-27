//! Snapshot test for the per-block HTML output against a real fixture.

use std::path::PathBuf;

use om_core::segment;
use om_render::render_block;

#[test]
fn renders_hello_fixture() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .expect("workspace root")
        .to_path_buf();
    let path = root.join("fixtures").join("hello.md");
    let src =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let doc = segment(&src);
    let rendered: Vec<_> = doc
        .blocks
        .iter()
        .map(|b| (format!("{:?}", b.kind), render_block(b)))
        .collect();
    insta::assert_yaml_snapshot!(rendered);
}
