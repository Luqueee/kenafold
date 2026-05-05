use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::Emitter;

use crate::path_safety::{ensure_within, reject_traversal, validate_filename};

const ZSTD_LEVEL: i32 = 3;

static OP_COUNTER: AtomicUsize = AtomicUsize::new(1);

// ---------------------------------------------------------------------------
// CancelMap — managed state for cancellation tokens
// ---------------------------------------------------------------------------

pub struct CancelMap(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl CancelMap {
    pub fn new() -> Self {
        CancelMap(Mutex::new(HashMap::new()))
    }

    /// Register a new operation and return its cancellation flag.
    pub fn register(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.0.lock() {
            map.insert(id.to_string(), flag.clone());
        }
        flag
    }

    /// Remove the entry for a completed / cleaned-up operation.
    pub fn unregister(&self, id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(id);
        }
    }

    /// Signal cancellation for the given operation id.
    pub fn cancel(&self, id: &str) {
        if let Ok(map) = self.0.lock() {
            if let Some(flag) = map.get(id) {
                flag.store(true, Ordering::Relaxed);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Progress payload
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    id: String,
    operation: String,
    current: usize,
    total: i64, // -1 = unknown (streaming decompress)
    label: String,
    done: bool,
    output: Option<String>,
    cancelled: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn workers() -> u32 {
    thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1)
}

fn build_suffixed(parent: &Path, name: &str, n: usize) -> PathBuf {
    let (stem, ext) = if let Some(rest) = name.strip_suffix(".tar.zst") {
        (rest, ".tar.zst")
    } else if let Some(rest) = name.strip_suffix(".zst") {
        (rest, ".zst")
    } else {
        match name.rfind('.') {
            Some(i) if i > 0 => (&name[..i], &name[i..]),
            _ => (name, ""),
        }
    };
    parent.join(format!("{} ({}){}", stem, n, ext))
}

fn unique_dest(base: &Path) -> PathBuf {
    if !base.exists() {
        return base.to_path_buf();
    }
    let parent = base.parent().unwrap_or(Path::new("."));
    let name = base.file_name().and_then(|n| n.to_str()).unwrap_or("archive");
    for i in 1..1000 {
        let candidate = build_suffixed(parent, name, i);
        if !candidate.exists() {
            return candidate;
        }
    }
    base.to_path_buf()
}

fn detect_collisions(sources: &[PathBuf]) -> Result<(), String> {
    let mut seen: HashSet<&str> = HashSet::new();
    for s in sources {
        let name = s
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        if !seen.insert(name) {
            return Err(format!(
                "Hay archivos con el mismo nombre: {}. Renombrá alguno o comprimí por separado.",
                name
            ));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Core workers (run on a blocking thread)
// ---------------------------------------------------------------------------

fn run_compression(
    sources: &[PathBuf],
    out_path: &Path,
    single_file: bool,
    on_progress: impl Fn(usize, usize, &str),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let mut encoder =
        zstd::stream::Encoder::new(writer, ZSTD_LEVEL).map_err(|e| e.to_string())?;
    encoder.multithread(workers()).map_err(|e| e.to_string())?;
    encoder.include_checksum(true).map_err(|e| e.to_string())?;

    if single_file {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let name = sources[0]
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        on_progress(1, 1, name);
        let mut input = File::open(&sources[0]).map_err(|e| e.to_string())?;
        std::io::copy(&mut input, &mut encoder).map_err(|e| e.to_string())?;
    } else {
        let total = sources.len();
        let mut tar = tar::Builder::new(&mut encoder);
        tar.follow_symlinks(false);
        for (i, src) in sources.iter().enumerate() {
            if should_cancel() {
                return Err("__CANCELLED__".into());
            }
            let name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Nombre inválido")?;
            on_progress(i + 1, total, name);
            if src.is_dir() {
                tar.append_dir_all(name, src).map_err(|e| e.to_string())?;
            } else {
                tar.append_path_with_name(src, name)
                    .map_err(|e| e.to_string())?;
            }
        }
        tar.finish().map_err(|e| e.to_string())?;
    }

    let writer = encoder.finish().map_err(|e| e.to_string())?;
    writer.into_inner().map_err(|e| e.to_string())?;
    Ok(())
}

fn run_decompression(
    src: &Path,
    out_path: &Path,
    is_tar: bool,
    on_progress: impl Fn(usize, &str),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::open(src).map_err(|e| e.to_string())?;
    let decoder = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
    if is_tar {
        let mut archive = tar::Archive::new(decoder);
        archive.set_preserve_permissions(false);
        let mut count = 0usize;
        for entry in archive.entries().map_err(|e| e.to_string())? {
            if should_cancel() {
                return Err("__CANCELLED__".into());
            }
            let mut entry = entry.map_err(|e| e.to_string())?;
            let label = entry
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            count += 1;
            on_progress(count, &label);
            entry.unpack_in(out_path).map_err(|e| e.to_string())?;
        }
    } else {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        on_progress(1, src.file_name().and_then(|n| n.to_str()).unwrap_or(""));
        let mut out_file = File::create(out_path).map_err(|e| e.to_string())?;
        let mut decoder = decoder;
        std::io::copy(&mut decoder, &mut out_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Compress one or more entries into a single archive in `dest_dir`.
#[tauri::command]
pub async fn compress_entries(
    app: tauri::AppHandle,
    cancel_map: tauri::State<'_, CancelMap>,
    paths: Vec<String>,
    dest_dir: String,
    archive_name: Option<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("Sin archivos para comprimir".into());
    }
    let dest = Path::new(&dest_dir);
    reject_traversal(dest)?;
    if !dest.is_dir() {
        return Err("Destino inválido".into());
    }

    let sources: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    for s in &sources {
        reject_traversal(s)?;
        if !s.exists() {
            return Err(format!("No existe: {}", s.display()));
        }
    }

    detect_collisions(&sources)?;

    let single_file = sources.len() == 1 && sources[0].is_file();

    let out_path = if single_file {
        let src = &sources[0];
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        let target = format!("{}.zst", name);
        validate_filename(&target)?;
        unique_dest(&dest.join(target))
    } else {
        let base = archive_name.unwrap_or_else(|| {
            sources[0]
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("archive")
                .to_string()
        });
        validate_filename(&base)?;
        let target = format!("{}.tar.zst", base);
        unique_dest(&dest.join(target))
    };

    ensure_within(dest, &out_path)?;

    let mut partial = out_path.clone().into_os_string();
    partial.push(".partial");
    let partial = PathBuf::from(partial);

    let op_id = format!("compress-{}", OP_COUNTER.fetch_add(1, Ordering::Relaxed));
    let total_files = if single_file { 1usize } else { sources.len() };

    // Register cancellation token
    let cancel_flag = cancel_map.register(&op_id);

    let _ = app.emit(
        "archive://progress",
        ProgressPayload {
            id: op_id.clone(),
            operation: "compress".into(),
            current: 0,
            total: total_files as i64,
            label: String::new(),
            done: false,
            output: None,
            cancelled: false,
        },
    );

    let app_clone = app.clone();
    let op_id_clone = op_id.clone();
    let partial_clone = partial.clone();
    let cancel_flag_clone = cancel_flag.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_compression(
            &sources,
            &partial_clone,
            single_file,
            |current, total, label| {
                let _ = app_clone.emit(
                    "archive://progress",
                    ProgressPayload {
                        id: op_id_clone.clone(),
                        operation: "compress".into(),
                        current,
                        total: total as i64,
                        label: label.to_string(),
                        done: false,
                        output: None,
                        cancelled: false,
                    },
                );
            },
            move || cancel_flag_clone.load(Ordering::Relaxed),
        )
    })
    .await
    .map_err(|e| format!("Tarea cancelada: {}", e))?;

    cancel_map.unregister(&op_id);

    if let Err(ref e) = result {
        let cancelled = e == "__CANCELLED__";
        std::fs::remove_file(&partial).ok();
        let _ = app.emit(
            "archive://progress",
            ProgressPayload {
                id: op_id.clone(),
                operation: "compress".into(),
                current: 0,
                total: total_files as i64,
                label: if cancelled { String::new() } else { e.clone() },
                done: true,
                output: None,
                cancelled,
            },
        );
        return Err(e.clone());
    }

    std::fs::rename(&partial, &out_path).map_err(|e| {
        std::fs::remove_file(&partial).ok();
        e.to_string()
    })?;

    let out_name = out_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let _ = app.emit(
        "archive://progress",
        ProgressPayload {
            id: op_id,
            operation: "compress".into(),
            current: total_files,
            total: total_files as i64,
            label: out_name,
            done: true,
            output: Some(out_path.to_string_lossy().to_string()),
            cancelled: false,
        },
    );

    Ok(out_path.to_string_lossy().to_string())
}

/// Decompress a `.zst` or `.tar.zst` file next to the original.
#[tauri::command]
pub async fn decompress_entry(
    app: tauri::AppHandle,
    cancel_map: tauri::State<'_, CancelMap>,
    path: String,
) -> Result<String, String> {
    let src = Path::new(&path);
    reject_traversal(src)?;
    if !src.is_file() {
        return Err("No es un archivo".into());
    }

    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nombre inválido")?;
    let parent = src.parent().unwrap_or(Path::new("."));

    let (stem, is_tar) = if let Some(s) = name.strip_suffix(".tar.zst") {
        (s, true)
    } else if let Some(s) = name.strip_suffix(".zst") {
        (s, false)
    } else {
        return Err("Formato no soportado. Solo .zst y .tar.zst".into());
    };

    if stem.is_empty() {
        return Err("Nombre de archivo inválido".into());
    }

    let base_out = parent.join(stem);
    let out_path = unique_dest(&base_out);
    ensure_within(parent, &out_path)?;

    if is_tar {
        std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
    }

    let partial = if is_tar {
        None
    } else {
        let mut p = out_path.clone().into_os_string();
        p.push(".partial");
        Some(PathBuf::from(p))
    };

    let op_id = format!("decompress-{}", OP_COUNTER.fetch_add(1, Ordering::Relaxed));

    // Register cancellation token
    let cancel_flag = cancel_map.register(&op_id);

    let _ = app.emit(
        "archive://progress",
        ProgressPayload {
            id: op_id.clone(),
            operation: "decompress".into(),
            current: 0,
            total: -1,
            label: name.to_string(),
            done: false,
            output: None,
            cancelled: false,
        },
    );

    let effective_out = partial.clone().unwrap_or_else(|| out_path.clone());
    let src_clone = src.to_path_buf();
    let app_clone = app.clone();
    let op_id_clone = op_id.clone();
    let cancel_flag_clone = cancel_flag.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_decompression(
            &src_clone,
            &effective_out,
            is_tar,
            |current, label| {
                let _ = app_clone.emit(
                    "archive://progress",
                    ProgressPayload {
                        id: op_id_clone.clone(),
                        operation: "decompress".into(),
                        current,
                        total: -1,
                        label: label.to_string(),
                        done: false,
                        output: None,
                        cancelled: false,
                    },
                );
            },
            move || cancel_flag_clone.load(Ordering::Relaxed),
        )
    })
    .await
    .map_err(|e| format!("Tarea cancelada: {}", e))?;

    cancel_map.unregister(&op_id);

    if let Err(ref e) = result {
        let cancelled = e == "__CANCELLED__";
        if is_tar {
            std::fs::remove_dir_all(&out_path).ok();
        }
        if let Some(ref p) = partial {
            std::fs::remove_file(p).ok();
        }
        let _ = app.emit(
            "archive://progress",
            ProgressPayload {
                id: op_id.clone(),
                operation: "decompress".into(),
                current: 0,
                total: -1,
                label: if cancelled { String::new() } else { e.clone() },
                done: true,
                output: None,
                cancelled,
            },
        );
        return Err(e.clone());
    }

    if let Some(ref p) = partial {
        std::fs::rename(p, &out_path).map_err(|e| {
            std::fs::remove_file(p).ok();
            e.to_string()
        })?;
    }

    let out_name = out_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let _ = app.emit(
        "archive://progress",
        ProgressPayload {
            id: op_id,
            operation: "decompress".into(),
            current: 1,
            total: 1,
            label: out_name,
            done: true,
            output: Some(out_path.to_string_lossy().to_string()),
            cancelled: false,
        },
    );

    Ok(out_path.to_string_lossy().to_string())
}

/// Cancel an in-progress archive operation by its op_id.
#[tauri::command]
pub fn cancel_archive(op_id: String, cancel_map: tauri::State<'_, CancelMap>) {
    cancel_map.cancel(&op_id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_suffixed_preserves_tar_zst() {
        let p = build_suffixed(Path::new("/tmp"), "archive.tar.zst", 1);
        assert_eq!(p, Path::new("/tmp/archive (1).tar.zst"));
    }

    #[test]
    fn build_suffixed_preserves_zst() {
        let p = build_suffixed(Path::new("/tmp"), "foto.txt.zst", 1);
        assert_eq!(p, Path::new("/tmp/foto.txt (1).zst"));
    }

    #[test]
    fn build_suffixed_preserves_simple_extension() {
        let p = build_suffixed(Path::new("/tmp"), "doc.pdf", 2);
        assert_eq!(p, Path::new("/tmp/doc (2).pdf"));
    }

    #[test]
    fn build_suffixed_no_extension() {
        let p = build_suffixed(Path::new("/tmp"), "README", 1);
        assert_eq!(p, Path::new("/tmp/README (1)"));
    }

    #[test]
    fn detect_collisions_flags_duplicate_names() {
        let sources = vec![
            PathBuf::from("/a/foto.jpg"),
            PathBuf::from("/b/foto.jpg"),
        ];
        assert!(detect_collisions(&sources).is_err());
    }

    #[test]
    fn detect_collisions_accepts_unique_names() {
        let sources = vec![
            PathBuf::from("/a/foto.jpg"),
            PathBuf::from("/a/video.mp4"),
        ];
        assert!(detect_collisions(&sources).is_ok());
    }

    #[test]
    fn cancel_map_register_and_cancel() {
        let map = CancelMap::new();
        let flag = map.register("test-1");
        assert!(!flag.load(Ordering::Relaxed));
        map.cancel("test-1");
        assert!(flag.load(Ordering::Relaxed));
        map.unregister("test-1");
        // After unregister, flag is still usable via the Arc clone
        assert!(flag.load(Ordering::Relaxed));
    }

    #[test]
    fn cancel_map_cancel_unknown_id_is_noop() {
        let map = CancelMap::new();
        // Should not panic
        map.cancel("nonexistent");
    }
}
