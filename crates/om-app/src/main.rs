//! open-md M0 CLI smoke test.
//!
//! Reads a Markdown file, segments it into blocks, and prints the IR + HTML
//! as JSON. This is the same data shape the Tauri IPC layer will return in
//! M1, so the frontend can already consume it via piped input during early
//! development.

use std::{fs, path::PathBuf, process::ExitCode};

use om_core::{segment, BlockKind};
use om_render::render_block;
use serde::Serialize;

#[derive(Serialize)]
struct RenderedBlock<'a> {
    id: &'a str,
    kind: BlockKind,
    src_range: (usize, usize),
    hash: u64,
    source: &'a str,
    html: String,
}

#[derive(Serialize)]
struct Payload<'a> {
    path: String,
    blocks: Vec<RenderedBlock<'a>>,
}

fn run() -> Result<(), (u8, String)> {
    let args: Vec<String> = std::env::args().collect();
    let path = args
        .get(1)
        .map(PathBuf::from)
        .ok_or_else(|| (2u8, "usage: om-app <file.md>".to_string()))?;

    let src = fs::read_to_string(&path)
        .map_err(|e| (1, format!("failed to read {}: {e}", path.display())))?;

    let doc = segment(&src);
    let blocks: Vec<RenderedBlock<'_>> = doc
        .blocks
        .iter()
        .map(|b| RenderedBlock {
            id: &b.id,
            kind: b.kind,
            src_range: b.src_range,
            hash: b.hash,
            source: &b.source,
            html: render_block(b),
        })
        .collect();

    let payload = Payload {
        path: path.display().to_string(),
        blocks,
    };

    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| (1, format!("serialization failed: {e}")))?;
    println!("{json}");
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err((code, msg)) => {
            eprintln!("{msg}");
            ExitCode::from(code)
        }
    }
}
