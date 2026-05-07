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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameOp {
    pub src: String,
    pub new_name: String,
}

/// Rename multiple entries atomically (validate all first, then execute) + list parent.
#[tauri::command]
pub fn rename_entries(
    renames: Vec<RenameOp>,
    options: Option<ListOptions>,
) -> Result<DirectoryPage, String> {
    if renames.is_empty() {
        return Err("No hay operaciones de renombrado".to_string());
    }
    for op in &renames {
        validate_filename(&op.new_name)?;
        let src_path = Path::new(&op.src);
        reject_traversal(src_path)?;
        let parent = src_path.parent().ok_or("Sin directorio padre")?;
        let dest = parent.join(&op.new_name);
        ensure_within(parent, &dest)?;
    }
    for op in &renames {
        let src_path = Path::new(&op.src);
        let parent = src_path.parent().unwrap();
        let dest = parent.join(&op.new_name);
        std::fs::rename(src_path, &dest).map_err(|e| e.to_string())?;
    }
    let first_src = Path::new(&renames[0].src);
    let parent = first_src.parent().ok_or("Sin directorio padre")?;
    list_directory(parent.to_string_lossy().to_string(), options)
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn trash_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "No se pudo obtener HOME".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".Trash"))
}

#[tauri::command]
pub fn list_trash() -> Result<Vec<TrashEntry>, String> {
    let dir = trash_dir()?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().into_string().unwrap_or_default();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push(TrashEntry {
            name,
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
            modified,
        });
    }
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

#[tauri::command]
pub fn delete_from_trash(name: String) -> Result<(), String> {
    let path = trash_dir()?.join(&name);
    if !path.starts_with(trash_dir()?) {
        return Err("Ruta inválida".to_string());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn restore_from_trash(name: String, dest_dir: String) -> Result<(), String> {
    let src = trash_dir()?.join(&name);
    if !src.starts_with(trash_dir()?) {
        return Err("Ruta inválida".to_string());
    }
    let dest = Path::new(&dest_dir).join(&name);
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn empty_trash() -> Result<(), String> {
    let dir = trash_dir()?;
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().into_string().unwrap_or_default();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            std::fs::remove_dir_all(&path).ok();
        } else {
            std::fs::remove_file(&path).ok();
        }
    }
    Ok(())
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

#[derive(Serialize, Clone)]
pub struct DiskEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn dir_size(path: &Path, depth: u8) -> u64 {
    if depth == 0 {
        return 0;
    }
    let Ok(rd) = std::fs::read_dir(path) else { return 0 };
    rd.filter_map(|e| e.ok())
        .map(|e| {
            let p = e.path();
            match std::fs::symlink_metadata(&p) {
                Ok(m) if m.is_dir() => dir_size(&p, depth - 1),
                Ok(m) => m.len(),
                Err(_) => 0,
            }
        })
        .sum()
}

#[tauri::command]
pub async fn disk_usage(path: String) -> Result<Vec<DiskEntry>, String> {
    let dir_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = Path::new(&dir_path);
        reject_traversal(dir)?;
        let rd = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        let mut entries: Vec<DiskEntry> = rd
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let p = e.path();
                let meta = std::fs::symlink_metadata(&p).ok()?;
                let name = p.file_name()?.to_string_lossy().into_owned();
                let is_dir = meta.is_dir();
                let size = if is_dir { dir_size(&p, 10) } else { meta.len() };
                Some(DiskEntry {
                    name,
                    path: p.to_string_lossy().into_owned(),
                    is_dir,
                    size,
                })
            })
            .collect();
        entries.sort_by(|a, b| b.size.cmp(&a.size));
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// CLI tool installer
// ---------------------------------------------------------------------------

fn cli_link_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::Path::new(&home).join(".local/bin/kenafold")
}

/// Returns true if the `kenafold` CLI symlink already exists in ~/.local/bin.
#[tauri::command]
pub fn cli_is_installed() -> bool {
    cli_link_path().exists()
}

/// Creates ~/.local/bin/kenafold → the bundled script inside the .app bundle.
/// Safe to call multiple times — noop if already installed.
#[tauri::command]
pub fn install_cli() -> Result<(), String> {
    let link = cli_link_path();

    if link.exists() {
        return Ok(());
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("no parent")?;

    // In a .app bundle the binary lives at Contents/MacOS/<name>.
    // Go up one level to Contents/ then into Resources/scripts/.
    let script = if exe_dir.ends_with("Contents/MacOS") {
        exe_dir.parent()
            .ok_or("no Contents dir")?
            .join("Resources/scripts/kenafold")
    } else {
        // Dev mode — binary is in target/debug/ with no bundle structure.
        return Err(
            "CLI install only available in a release build (.app bundle)".into(),
        );
    };

    if !script.exists() {
        return Err(format!("script not found at {}", script.display()));
    }

    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&script, &link).map_err(|e| e.to_string())?;

    Ok(())
}
