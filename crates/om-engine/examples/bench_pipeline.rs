//! Dependency-free benchmark harness for the open-md pipeline.
//!
//! Measures segmentation, full payload render, and re-segmentation after a
//! small edit on synthetic Markdown documents of increasing size.
//!
//! Run with:
//!   `cargo run --release --example bench_pipeline`

use std::fmt::Write;
use std::time::{Duration, Instant};

use om_core::segment;
use om_engine::render_document_payload;

// ---------------------------------------------------------------------------
// Synthetic document generation
// ---------------------------------------------------------------------------

/// Generate a synthetic Markdown document with approximately `num_blocks`
/// blocks, mixing headings, paragraphs, lists, code fences, and tables.
fn generate_markdown(num_blocks: usize) -> String {
    let mut buf = String::with_capacity(num_blocks * 120);
    for i in 0..num_blocks {
        match i % 5 {
            0 => {
                // Heading
                let level = (i % 6) + 1;
                let hashes = "#".repeat(level);
                let _ = write!(buf, "{hashes} Section {i}\n\n");
            }
            1 => {
                // Paragraph
                let _ = write!(
                    buf,
                    "Lorem ipsum dolor sit amet, **bold text** and _italic_ \
                     for block number {i}. This paragraph has enough content to \
                     be realistic but not overwhelming.\n\n"
                );
            }
            2 => {
                // List
                let _ = write!(
                    buf,
                    "- Item alpha {i}\n- Item beta {i}\n- Item gamma {i}\n\n"
                );
            }
            3 => {
                // Code fence
                let _ = write!(
                    buf,
                    "```rust\nfn example_{i}() {{\n    println!(\"hello {i}\");\n}}\n```\n\n"
                );
            }
            4 => {
                // Table
                let _ = write!(
                    buf,
                    "| Col A | Col B | Col C |\n|-------|-------|-------|\n\
                     | a{i}  | b{i}  | c{i}  |\n| d{i}  | e{i}  | f{i}  |\n\n"
                );
            }
            _ => unreachable!(),
        }
    }
    buf
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

const WARMUP_ITERS: u32 = 2;
const BENCH_ITERS: u32 = 5;

fn bench<F: FnMut()>(mut f: F) -> Duration {
    // Warmup
    for _ in 0..WARMUP_ITERS {
        f();
    }
    // Measure
    let start = Instant::now();
    for _ in 0..BENCH_ITERS {
        f();
    }
    start.elapsed() / BENCH_ITERS
}

fn format_throughput(bytes: usize, duration: Duration) -> (f64, f64) {
    let ms = duration.as_secs_f64() * 1000.0;
    #[allow(clippy::cast_precision_loss)]
    let mb_per_sec = if ms > 0.0 {
        (bytes as f64 / 1_000_000.0) / duration.as_secs_f64()
    } else {
        f64::INFINITY
    };
    (ms, mb_per_sec)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    let sizes: &[usize] = &[1_000, 5_000, 20_000, 50_000];

    println!("open-md pipeline benchmark (dependency-free harness)");
    println!("=====================================================\n");

    // Header
    println!(
        "{:<8} {:>10} {:>12} {:>10} {:>12} {:>10} {:>12}",
        "Blocks", "Seg (ms)", "Seg MB/s", "Full (ms)", "Full MB/s", "ReSeg (ms)", "ReSeg MB/s"
    );
    println!("{}", "-".repeat(78));

    for &num_blocks in sizes {
        let source = generate_markdown(num_blocks);
        let bytes = source.len();

        // 1) Segmentation only
        let seg_dur = bench(|| {
            let _ = segment(&source);
        });
        let (seg_ms, seg_mbps) = format_throughput(bytes, seg_dur);

        // 2) Full payload render (segment + render all blocks)
        let full_dur = bench(|| {
            let _ = render_document_payload(&source, "bench.md");
        });
        let (full_ms, full_mbps) = format_throughput(bytes, full_dur);

        // 3) Re-segmentation after a small edit (append one paragraph)
        let mut edited = source.clone();
        edited.push_str("\nA small appended paragraph after the edit.\n\n");
        let reseg_dur = bench(|| {
            let _ = segment(&edited);
        });
        let (reseg_ms, reseg_mbps) = format_throughput(edited.len(), reseg_dur);

        println!(
            "{num_blocks:<8} {seg_ms:>10.2} {seg_mbps:>12.1} {full_ms:>10.2} {full_mbps:>12.1} {reseg_ms:>10.2} {reseg_mbps:>12.1}"
        );
    }

    println!("\nDone. All times are averages of {BENCH_ITERS} iterations after {WARMUP_ITERS} warmup runs.");
}
