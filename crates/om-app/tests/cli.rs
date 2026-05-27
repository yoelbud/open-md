//! End-to-end CLI test: run the `om-app` binary against `fixtures/hello.md`,
//! parse its JSON output, and assert structural invariants. Exercises the
//! whole stack the way the Tauri frontend will consume it.

use std::{path::PathBuf, process::Command};

use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct RenderedBlock {
    id: String,
    kind: String,
    src_range: (usize, usize),
    hash: u64,
    source: String,
    html: String,
}

#[derive(Deserialize, Debug)]
struct Payload {
    path: String,
    blocks: Vec<RenderedBlock>,
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .expect("workspace root")
        .to_path_buf()
}

fn cli_binary() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_om-app"))
}

#[test]
fn cli_emits_well_formed_json_for_fixture() {
    let fixture = workspace_root().join("fixtures").join("hello.md");
    let out = Command::new(cli_binary())
        .arg(&fixture)
        .output()
        .expect("spawn om-app");
    assert!(
        out.status.success(),
        "om-app failed: status={:?} stderr={}",
        out.status,
        String::from_utf8_lossy(&out.stderr)
    );
    let payload: Payload =
        serde_json::from_slice(&out.stdout).expect("om-app output is valid JSON");
    assert!(payload.path.ends_with("hello.md"));
    assert!(!payload.blocks.is_empty(), "fixture has blocks");

    let src = std::fs::read_to_string(&fixture).expect("read fixture");
    for b in &payload.blocks {
        assert!(!b.id.is_empty());
        assert!(!b.kind.is_empty());
        assert!(b.src_range.1 <= src.len());
        assert_eq!(&src[b.src_range.0..b.src_range.1], b.source);
        assert_ne!(b.hash, 0);
        assert!(!b.html.is_empty(), "block {} rendered empty HTML", b.id);
    }
}

#[test]
fn cli_reports_missing_file() {
    let out = Command::new(cli_binary())
        .arg("does-not-exist.md")
        .output()
        .expect("spawn om-app");
    assert!(!out.status.success());
    assert!(out.stdout.is_empty());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("failed to read"), "stderr={stderr}");
}

#[test]
fn cli_reports_missing_argument() {
    let out = Command::new(cli_binary()).output().expect("spawn om-app");
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("usage:"), "stderr={stderr}");
}
