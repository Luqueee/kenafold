use std::path::Path;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri_plugin_opener::OpenerExt;

use crate::path_safety::{ensure_within, reject_traversal, validate_filename};

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub extension: Option<String>,
}

const DEFAULT_PAGE_SIZE: usize = 2_000;

#[derive(Serialize, Clone)]
pub struct DirectoryPage {
    pub entries: Vec<FileEntry>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum SortBy {
    Name,
    Size,
    Modified,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum SortDir {
    Asc,
    Desc,
}

#[derive(Deserialize)]
pub struct ListOptions {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    #[serde(rename = "sortBy")]
    pub sort_by: Option<SortBy>,
    #[serde(rename = "sortDir")]
    pub sort_dir: Option<SortDir>,
}

#[tauri::command]
pub fn list_directory(
    path: String,
    options: Option<ListOptions>,
) -> Result<DirectoryPage, String> {
    let limit = options.as_ref().and_then(|o| o.limit).unwrap_or(DEFAULT_PAGE_SIZE);
    let offset = options.as_ref().and_then(|o| o.offset).unwrap_or(0);
    let sort_by = options.as_ref().and_then(|o| o.sort_by).unwrap_or(SortBy::Name);
    let sort_dir = options.as_ref().and_then(|o| o.sort_dir).unwrap_or(SortDir::Asc);

    let dir = Path::new(&path);

    let mut all: Vec<FileEntry> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().into_string().ok()?;

            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let is_dir = metadata.is_dir();
            let extension = if !is_dir {
                path.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
            } else {
                None
            };

            Some(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                size: if !is_dir { metadata.len() } else { 0 },
                modified,
                extension,
            })
        })
        .collect();

    all.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let primary = match sort_by {
                    SortBy::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                    SortBy::Size => a.size.cmp(&b.size),
                    SortBy::Modified => a.modified.cmp(&b.modified),
                };
                let primary = match sort_dir {
                    SortDir::Asc => primary,
                    SortDir::Desc => primary.reverse(),
                };
                primary.then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            }
        }
    });

    let total = all.len();
    let entries = all.into_iter().skip(offset).take(limit).collect();

    Ok(DirectoryPage { entries, total, offset, limit })
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())
}

#[tauri::command]
pub fn open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Reveal an entry in the OS file manager (Finder on macOS, Explorer on Windows,
/// `xdg-open` on the parent dir on Linux).
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    reject_traversal(p)?;
    if !p.exists() {
        return Err("La ruta no existe".into());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    #[cfg(target_os = "linux")]
    {
        // No "select item" verb on Linux — open the parent dir instead.
        let parent = p.parent().unwrap_or(p);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// Copy a single entry to the same parent dir with an automatic " copy" /
/// " copy N" suffix (Finder-style).
#[tauri::command]
pub fn duplicate_entry(src: String) -> Result<String, String> {
    let src_path = Path::new(&src);
    reject_traversal(src_path)?;
    if !src_path.exists() {
        return Err("La ruta no existe".into());
    }
    let parent = src_path.parent().ok_or("Sin directorio padre")?;
    let file_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nombre inválido")?;

    let (stem, ext) = match file_name.rfind('.') {
        Some(i) if i > 0 && !src_path.is_dir() => (&file_name[..i], &file_name[i..]),
        _ => (file_name, ""),
    };

    let mut candidate = parent.join(format!("{} copy{}", stem, ext));
    let mut n = 2;
    while candidate.exists() && n < 1000 {
        candidate = parent.join(format!("{} copy {}{}", stem, n, ext));
        n += 1;
    }
    if candidate.exists() {
        return Err("No se encontró un nombre disponible".into());
    }
    ensure_within(parent, &candidate)?;

    if src_path.is_dir() {
        copy_dir_recursive(src_path, &candidate).map_err(|e| e.to_string())?;
    } else {
        std::fs::copy(src_path, &candidate).map_err(|e| e.to_string())?;
    }
    Ok(candidate.to_string_lossy().into_owned())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        // file_type() does NOT follow symlinks; check is_symlink first so we never
        // descend into a target outside the src tree (or duplicate its contents).
        let ft = entry.file_type()?;
        if ft.is_symlink() {
            #[cfg(unix)]
            {
                let target = std::fs::read_link(entry.path())?;
                let _ = std::fs::remove_file(&dst_path);
                std::os::unix::fs::symlink(target, &dst_path)?;
            }
            #[cfg(not(unix))]
            {
                // On non-unix platforms, skip symlinks rather than risk following them.
                continue;
            }
        } else if ft.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    reject_traversal(p)?;
    std::fs::create_dir_all(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    reject_traversal(p)?;
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        validate_filename(name)?;
    }
    std::fs::File::create(p).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_entry(src: String, new_name: String) -> Result<(), String> {
    validate_filename(&new_name)?;
    let src_path = Path::new(&src);
    reject_traversal(src_path)?;
    let parent = src_path.parent().ok_or("Sin directorio padre")?;
    let dest = parent.join(&new_name);
    ensure_within(parent, &dest)?;
    std::fs::rename(src_path, &dest).map_err(|e| e.to_string())
}

/// Rename + list parent in one roundtrip — saves a separate list_directory call.
#[tauri::command]
pub fn rename_and_list(
    src: String,
    new_name: String,
    options: Option<ListOptions>,
) -> Result<DirectoryPage, String> {
    validate_filename(&new_name)?;
    let src_path = Path::new(&src);
    reject_traversal(src_path)?;
    let parent = src_path.parent().ok_or("Sin directorio padre")?;
    let dest = parent.join(&new_name);
    ensure_within(parent, &dest)?;
    std::fs::rename(src_path, &dest).map_err(|e| e.to_string())?;
    // Re-use list_directory logic on the same parent.
    let parent_str = parent.to_string_lossy().to_string();
    list_directory(parent_str, options)
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    reject_traversal(p)?;
    std::fs::symlink_metadata(p).map_err(|e| e.to_string())?;
    trash::delete(p).map_err(|e| format!("Trash: {}", e))
}

#[tauri::command]
pub fn delete_entries(paths: Vec<String>) -> Result<(), String> {
    for path in &paths {
        let p = Path::new(path);
        reject_traversal(p)?;
        std::fs::symlink_metadata(p).map_err(|e| e.to_string())?;
    }
    trash::delete_all(&paths).map_err(|e| format!("Trash: {}", e))
}

#[tauri::command]
pub fn copy_entry(src: String, dest: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dest_path = Path::new(&dest);
    reject_traversal(src_path)?;
    reject_traversal(dest_path)?;
    if let Some(name) = dest_path.file_name().and_then(|n| n.to_str()) {
        validate_filename(name)?;
    }
    if src_path.is_dir() {
        copy_dir_recursive(src_path, dest_path).map_err(|e| e.to_string())
    } else {
        std::fs::copy(src_path, dest_path).map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn move_entry(src: String, dest: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dest_path = Path::new(&dest);
    reject_traversal(src_path)?;
    reject_traversal(dest_path)?;
    if let Some(name) = dest_path.file_name().and_then(|n| n.to_str()) {
        validate_filename(name)?;
    }
    std::fs::rename(src_path, dest_path).map_err(|e| e.to_string())
}
