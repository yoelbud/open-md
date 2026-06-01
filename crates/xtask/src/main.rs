//! Workspace task runner for `open-md`.
//!
//! Invoke with `cargo xtask <task>`. The `ci` task mirrors the gates defined in
//! `.github/workflows/ci.yml` so contributors and agents can reproduce CI with a
//! single command. Tasks run sequentially and stop at the first failure.
//!
//! Tasks:
//! - `ci` (default): all Rust gates, then all frontend gates.
//! - `rust`: Rust format, clippy, build, test, and doc gates.
//! - `frontend`: frontend install, typecheck, test, and build gates.

use std::process::{Command, ExitCode};

/// A single gate to execute as a child process.
struct Step {
    /// Human-readable label printed before the step runs.
    label: &'static str,
    /// Program to launch.
    program: &'static str,
    /// Arguments passed to the program.
    args: &'static [&'static str],
    /// Optional working directory, relative to the workspace root.
    cwd: Option<&'static str>,
    /// Environment variables to set for the child process, for CI parity.
    env: &'static [(&'static str, &'static str)],
}

/// Environment that CI applies to every Rust job (`-D warnings` for compiler and
/// rustdoc). Mirrors the `env:` block in `.github/workflows/ci.yml`.
const RUST_ENV: &[(&str, &str)] = &[
    ("RUSTFLAGS", "-D warnings"),
    ("RUSTDOCFLAGS", "-D warnings"),
];

/// Name of the npm executable, accounting for the Windows `.cmd` shim.
const fn npm() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}

/// Rust gates, in CI order.
fn rust_steps() -> Vec<Step> {
    vec![
        Step {
            label: "cargo fmt --all --check",
            program: "cargo",
            args: &["fmt", "--all", "--check"],
            cwd: None,
            env: RUST_ENV,
        },
        Step {
            label: "cargo clippy (deny warnings)",
            program: "cargo",
            args: &[
                "clippy",
                "--workspace",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
            cwd: None,
            env: RUST_ENV,
        },
        Step {
            label: "cargo build",
            program: "cargo",
            // `xtask` is excluded here only to avoid replacing the running runner
            // binary on Windows; the alias already compiled it, and CI builds the
            // full workspace including `xtask`.
            args: &[
                "build",
                "--workspace",
                "--exclude",
                "xtask",
                "--all-targets",
                "--locked",
            ],
            cwd: None,
            env: RUST_ENV,
        },
        Step {
            label: "cargo test",
            program: "cargo",
            args: &["test", "--workspace", "--exclude", "xtask", "--locked"],
            cwd: None,
            env: RUST_ENV,
        },
        Step {
            label: "cargo doc",
            program: "cargo",
            args: &["doc", "--workspace", "--no-deps", "--locked"],
            cwd: None,
            env: RUST_ENV,
        },
    ]
}

/// Frontend gates, in CI order.
fn frontend_steps() -> Vec<Step> {
    vec![
        Step {
            label: "npm ci",
            program: npm(),
            args: &["ci"],
            cwd: Some("frontend"),
            env: &[],
        },
        Step {
            label: "npm run typecheck",
            program: npm(),
            args: &["run", "typecheck"],
            cwd: Some("frontend"),
            env: &[],
        },
        Step {
            label: "npm test",
            program: npm(),
            args: &["test"],
            cwd: Some("frontend"),
            env: &[],
        },
        Step {
            label: "npm run build",
            program: npm(),
            args: &["run", "build"],
            cwd: Some("frontend"),
            env: &[],
        },
    ]
}

/// Run a list of steps in order, stopping at the first failure. Returns `true`
/// if every step succeeded.
fn run_steps(steps: &[Step]) -> bool {
    for step in steps {
        println!("\n=== {} ===", step.label);
        let mut cmd = Command::new(step.program);
        cmd.args(step.args);
        for (key, value) in step.env {
            cmd.env(key, value);
        }
        if let Some(dir) = step.cwd {
            cmd.current_dir(dir);
        }
        match cmd.status() {
            Ok(status) if status.success() => {}
            Ok(status) => {
                eprintln!(
                    "\nstep failed: {} (exit code {:?})",
                    step.label,
                    status.code()
                );
                return false;
            }
            Err(err) => {
                eprintln!("\nfailed to launch `{}`: {err}", step.program);
                return false;
            }
        }
    }
    true
}

/// Print usage information.
fn print_help() {
    println!(
        "open-md task runner\n\nUsage: cargo xtask <task>\n\nTasks:\n  ci        Run all Rust then all frontend gates (default)\n  rust      Run Rust gates only\n  frontend  Run frontend gates only\n  help      Show this message"
    );
}

fn main() -> ExitCode {
    let task = std::env::args().nth(1).unwrap_or_else(|| "ci".to_owned());
    let ok = match task.as_str() {
        "ci" => run_steps(&rust_steps()) && run_steps(&frontend_steps()),
        "rust" => run_steps(&rust_steps()),
        "frontend" => run_steps(&frontend_steps()),
        "help" | "-h" | "--help" => {
            print_help();
            true
        }
        other => {
            eprintln!("unknown task: {other}\n");
            print_help();
            false
        }
    };
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
