#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! Thin entry point that launches the Tauri-powered open-md desktop shell.

fn main() {
    if let Err(error) = om_app::run() {
        eprintln!("failed to run open-md: {error}");
        std::process::exit(1);
    }
}
