//! Native desktop shell and file/project commands for open-md.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use om_engine::{render_document_payload, DocumentPayload};
use serde::Serialize;

const UNTITLED_PATH: &str = "(untitled).md";
const MAX_PROJECT_FILES: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct LoadedMarkdownFile {
    path: String,
    source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct SavedMarkdownFile {
    path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    path: String,
    relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct ProjectPayload {
    root: String,
    files: Vec<ProjectFile>,
}

#[derive(Debug, thiserror::Error)]
enum MarkdownFileError {
    #[error("path is not a Markdown file: {0}")]
    UnsupportedExtension(String),
    #[error("failed to read {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to write {path}: {source}")]
    Write {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to list {path}: {source}")]
    List {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("project contains more than {0} Markdown files")]
    ProjectTooLarge(usize),
}

/// Starts the open-md Tauri desktop application.
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_document,
            new_markdown_file,
            open_markdown_file,
            save_markdown_file,
            open_project_folder,
            load_project_file,
        ])
        .run(tauri::generate_context!())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn parse_document(source: String, path: String) -> DocumentPayload {
    render_document_payload(&source, path)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn new_markdown_file(project_root: Option<String>) -> Result<Option<LoadedMarkdownFile>, String> {
    let Some(path) = save_dialog(project_root.as_deref()).save_file() else {
        return Ok(None);
    };
    write_markdown_file(&path, "")
        .map(|saved| {
            Some(LoadedMarkdownFile {
                path: saved.path,
                source: String::new(),
            })
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_markdown_file() -> Result<Option<LoadedMarkdownFile>, String> {
    let Some(path) = markdown_file_dialog().pick_file() else {
        return Ok(None);
    };
    read_markdown_file(&path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn save_markdown_file(
    path: Option<String>,
    source: String,
) -> Result<Option<SavedMarkdownFile>, String> {
    let target = existing_file_path(path).or_else(|| save_dialog(None).save_file());
    let Some(target) = target else {
        return Ok(None);
    };
    write_markdown_file(&target, &source)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_project_folder() -> Result<Option<ProjectPayload>, String> {
    let Some(root) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    project_payload(&root)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn load_project_file(path: String) -> Result<LoadedMarkdownFile, String> {
    read_markdown_file(path).map_err(|error| error.to_string())
}

fn markdown_file_dialog() -> rfd::FileDialog {
    rfd::FileDialog::new().add_filter("Markdown", &["md", "markdown"])
}

fn save_dialog(project_root: Option<&str>) -> rfd::FileDialog {
    let dialog = markdown_file_dialog().set_file_name("untitled.md");
    let Some(root) = project_root.filter(|root| !root.trim().is_empty()) else {
        return dialog;
    };
    dialog.set_directory(root)
}

fn existing_file_path(path: Option<String>) -> Option<PathBuf> {
    let path = path?;
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == UNTITLED_PATH {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

fn project_payload(root: &Path) -> Result<ProjectPayload, MarkdownFileError> {
    Ok(ProjectPayload {
        root: path_to_string(root),
        files: discover_markdown_files(root)?,
    })
}

fn read_markdown_file(path: impl AsRef<Path>) -> Result<LoadedMarkdownFile, MarkdownFileError> {
    let path = path.as_ref();
    ensure_markdown_path(path)?;
    let source = fs::read_to_string(path).map_err(|source| MarkdownFileError::Read {
        path: path_to_string(path),
        source,
    })?;
    Ok(LoadedMarkdownFile {
        path: path_to_string(path),
        source,
    })
}

fn write_markdown_file(
    path: impl AsRef<Path>,
    source: &str,
) -> Result<SavedMarkdownFile, MarkdownFileError> {
    let path = path.as_ref();
    ensure_markdown_path(path)?;
    fs::write(path, source).map_err(|source| MarkdownFileError::Write {
        path: path_to_string(path),
        source,
    })?;
    Ok(SavedMarkdownFile {
        path: path_to_string(path),
    })
}

fn discover_markdown_files(root: impl AsRef<Path>) -> Result<Vec<ProjectFile>, MarkdownFileError> {
    let root = root.as_ref();
    let mut files = Vec::new();
    collect_markdown_files(root, root, &mut files)?;
    files.sort_by_key(|file| file.relative_path.to_lowercase());
    Ok(files)
}

fn collect_markdown_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<ProjectFile>,
) -> Result<(), MarkdownFileError> {
    let entries = fs::read_dir(dir).map_err(|source| MarkdownFileError::List {
        path: path_to_string(dir),
        source,
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| MarkdownFileError::List {
            path: path_to_string(dir),
            source,
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|source| MarkdownFileError::List {
                path: path_to_string(&path),
                source,
            })?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            collect_markdown_files(root, &path, files)?;
        } else if file_type.is_file() && is_markdown_path(&path) {
            if files.len() >= MAX_PROJECT_FILES {
                return Err(MarkdownFileError::ProjectTooLarge(MAX_PROJECT_FILES));
            }
            files.push(ProjectFile {
                path: path_to_string(&path),
                relative_path: relative_path_to_string(root, &path),
            });
        }
    }
    Ok(())
}

fn ensure_markdown_path(path: &Path) -> Result<(), MarkdownFileError> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        Err(MarkdownFileError::UnsupportedExtension(path_to_string(
            path,
        )))
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn relative_path_to_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map_or_else(|_| path_to_string(path), path_to_string)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::Path,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use om_core::BlockKind;

    use super::*;

    static NEXT_TEMP_ID: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let id = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("open-md-{name}-{}-{id}", std::process::id()))
    }

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|error| {
                panic!("create temp parent {}: {error}", parent.display());
            });
        }
        fs::write(path, contents).unwrap_or_else(|error| {
            panic!("write temp file {}: {error}", path.display());
        });
    }

    fn cleanup(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).unwrap_or_else(|error| {
                panic!("remove temp dir {}: {error}", path.display());
            });
        }
    }

    #[test]
    fn detects_markdown_extensions_case_insensitively() {
        assert!(is_markdown_path(Path::new("notes.md")));
        assert!(is_markdown_path(Path::new("notes.MARKDOWN")));
        assert!(!is_markdown_path(Path::new("notes.txt")));
    }

    #[test]
    fn renders_document_payload_with_block_html() {
        let payload = render_document_payload("# Heading\n\nbody\n", "notes.md".to_string());

        assert_eq!(payload.path, "notes.md");
        assert_eq!(payload.blocks.len(), 2);
        assert_eq!(payload.blocks[0].kind, BlockKind::Heading);
        assert!(payload.blocks[0].html.contains("<h1>Heading</h1>"));
    }

    #[test]
    fn reads_and_writes_markdown_files() {
        let root = temp_dir("read-write");
        cleanup(&root);
        fs::create_dir_all(&root).unwrap_or_else(|error| {
            panic!("create temp dir {}: {error}", root.display());
        });

        let path = root.join("draft.md");
        write_markdown_file(&path, "# Draft\n").expect("write markdown file");
        let loaded = read_markdown_file(&path).expect("read markdown file");

        assert_eq!(loaded.path, path_to_string(&path));
        assert_eq!(loaded.source, "# Draft\n");
        cleanup(&root);
    }

    #[test]
    fn rejects_non_markdown_files_for_direct_io() {
        let root = temp_dir("reject");
        cleanup(&root);
        fs::create_dir_all(&root).unwrap_or_else(|error| {
            panic!("create temp dir {}: {error}", root.display());
        });
        let path = root.join("notes.txt");
        write_file(&path, "not markdown");

        let error = read_markdown_file(&path).expect_err("txt file should be rejected");

        assert!(matches!(error, MarkdownFileError::UnsupportedExtension(_)));
        cleanup(&root);
    }

    #[test]
    fn discovers_markdown_files_recursively_and_sorted() {
        let root = temp_dir("discover");
        cleanup(&root);
        write_file(&root.join("b.md"), "b");
        write_file(&root.join("a.markdown"), "a");
        write_file(&root.join("nested").join("c.MD"), "c");
        write_file(&root.join("nested").join("ignore.txt"), "x");

        let files = discover_markdown_files(&root).expect("discover markdown files");
        let relative_paths = files
            .iter()
            .map(|file| file.relative_path.replace('\\', "/"))
            .collect::<Vec<_>>();

        assert_eq!(relative_paths, ["a.markdown", "b.md", "nested/c.MD"]);
        cleanup(&root);
    }
}
