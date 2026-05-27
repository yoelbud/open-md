//! open-md M0 CLI smoke test.
//!
//! Reads a markdown file, segments it into blocks, and prints the IR + HTML
//! as JSON. This is the same data shape the Tauri IPC layer will return in
//! M1, so the frontend can already consume it via piped input during early
//! development.

use std::{fs, path::PathBuf, process::ExitCode};

use om_core::segment;
use om_render::render_block;
use serde::Serialize;

#[derive(Serialize)]
struct RenderedBlock<'a> {
    id: &'a str,
    kind: om_core::BlockKind,
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

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let path = match args.get(1) {
        Some(p) => PathBuf::from(p),
        None => {
            eprintln!("usage: om-app <file.md>");
            return ExitCode::from(2);
        }
    };

    let src = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {}: {e}", path.display());
            return ExitCode::from(1);
        }
    };

    let doc = segment(&src);
    let blocks: Vec<RenderedBlock> = doc
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

    match serde_json::to_string_pretty(&payload) {
        Ok(s) => {
            println!("{s}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("serialization failed: {e}");
            ExitCode::from(1)
        }
    }
}
