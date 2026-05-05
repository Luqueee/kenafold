use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
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
// Archive format detection
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum ArchiveKind {
    TarZst,  // .tar.zst
    Zst,     // .zst (raw)
    TarGz,   // .tar.gz / .tgz
    Gz,      // .gz (raw)
    TarBz2,  // .tar.bz2 / .tbz2
    Bz2,     // .bz2 (raw)
    Zip,     // .zip
    Tar,     // .tar
    Iso,     // .iso
}

impl ArchiveKind {
    /// True when extraction always produces a folder (multi-file archive).
    fn is_multi_file(self) -> bool {
        matches!(self, Self::TarZst | Self::TarGz | Self::TarBz2 | Self::Tar | Self::Zip | Self::Iso)
    }
}

/// Detect archive kind and return the stem (filename without archive suffix).
/// Matching is case-insensitive; the returned stem borrows from `name`.
fn detect_kind(name: &str) -> Option<(ArchiveKind, &str)> {
    let lo = name.to_ascii_lowercase();
    // Longest suffixes first to avoid partial matches
    if lo.ends_with(".tar.zst") { return Some((ArchiveKind::TarZst, &name[..name.len()-8])); }
    if lo.ends_with(".tar.gz")  { return Some((ArchiveKind::TarGz,  &name[..name.len()-7])); }
    if lo.ends_with(".tar.bz2") { return Some((ArchiveKind::TarBz2, &name[..name.len()-8])); }
    if lo.ends_with(".tgz")     { return Some((ArchiveKind::TarGz,  &name[..name.len()-4])); }
    if lo.ends_with(".tbz2")    { return Some((ArchiveKind::TarBz2, &name[..name.len()-5])); }
    if lo.ends_with(".zst")     { return Some((ArchiveKind::Zst,    &name[..name.len()-4])); }
    if lo.ends_with(".gz")      { return Some((ArchiveKind::Gz,     &name[..name.len()-3])); }
    if lo.ends_with(".bz2")     { return Some((ArchiveKind::Bz2,    &name[..name.len()-4])); }
    if lo.ends_with(".zip")     { return Some((ArchiveKind::Zip,    &name[..name.len()-4])); }
    if lo.ends_with(".tar")     { return Some((ArchiveKind::Tar,    &name[..name.len()-4])); }
    if lo.ends_with(".iso")     { return Some((ArchiveKind::Iso,    &name[..name.len()-4])); }
    None
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

fn extract_tar<R: Read>(
    reader: R,
    out_dir: &Path,
    on_progress: &impl Fn(usize, &str),
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
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
        entry.unpack_in(out_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_zip(
    src: &Path,
    out_dir: &Path,
    on_progress: &impl Fn(usize, &str),
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::open(src).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let total = archive.len();
    for i in 0..total {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let mut zf = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = zf.name().to_string();
        on_progress(i + 1, &name);

        // Safety: reject path traversal inside zip entries
        let dest = out_dir.join(&name);
        if !dest.starts_with(out_dir) {
            continue;
        }

        if zf.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut zf, &mut out_file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn run_decompression(
    src: &Path,
    out_path: &Path,
    kind: ArchiveKind,
    on_progress: impl Fn(usize, &str),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use bzip2::read::BzDecoder;

    match kind {
        ArchiveKind::TarZst => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            let dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
            extract_tar(dec, out_path, &on_progress, &should_cancel)
        }
        ArchiveKind::TarGz => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            extract_tar(GzDecoder::new(file), out_path, &on_progress, &should_cancel)
        }
        ArchiveKind::TarBz2 => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            extract_tar(BzDecoder::new(file), out_path, &on_progress, &should_cancel)
        }
        ArchiveKind::Tar => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            extract_tar(file, out_path, &on_progress, &should_cancel)
        }
        ArchiveKind::Zip => extract_zip(src, out_path, &on_progress, &should_cancel),
        ArchiveKind::Iso => extract_iso(src, out_path, &on_progress, &should_cancel),
        // Raw single-file decompressors — out_path is a file, not a directory
        ArchiveKind::Zst => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            on_progress(1, src.file_name().and_then(|n| n.to_str()).unwrap_or(""));
            let file = File::open(src).map_err(|e| e.to_string())?;
            let mut dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut dec, &mut out).map_err(|e| e.to_string())?;
            Ok(())
        }
        ArchiveKind::Gz => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            on_progress(1, src.file_name().and_then(|n| n.to_str()).unwrap_or(""));
            let file = File::open(src).map_err(|e| e.to_string())?;
            let mut dec = GzDecoder::new(file);
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut dec, &mut out).map_err(|e| e.to_string())?;
            Ok(())
        }
        ArchiveKind::Bz2 => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            on_progress(1, src.file_name().and_then(|n| n.to_str()).unwrap_or(""));
            let file = File::open(src).map_err(|e| e.to_string())?;
            let mut dec = BzDecoder::new(file);
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut dec, &mut out).map_err(|e| e.to_string())?;
            Ok(())
        }
    }
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

/// Decompress an archive file next to the original.
/// Supports: .zst, .tar.zst, .gz, .tar.gz, .tgz, .bz2, .tar.bz2, .tbz2, .zip, .tar, .iso
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

    let (kind, stem) = detect_kind(name)
        .ok_or_else(|| "Formato no soportado".to_string())?;

    if stem.is_empty() {
        return Err("Nombre de archivo inválido".into());
    }

    let is_multi = kind.is_multi_file();
    let base_out = parent.join(stem);
    let out_path = unique_dest(&base_out);
    ensure_within(parent, &out_path)?;

    if is_multi {
        std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
    }

    let partial = if is_multi {
        None
    } else {
        let mut p = out_path.clone().into_os_string();
        p.push(".partial");
        Some(PathBuf::from(p))
    };

    let op_id = format!("decompress-{}", OP_COUNTER.fetch_add(1, Ordering::Relaxed));
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
            kind,
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
        if is_multi {
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
// Archive listing (no extraction)
// ---------------------------------------------------------------------------

/// Flat entry metadata read from an archive header — no extraction needed.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
}

// ---------------------------------------------------------------------------
// ISO 9660 reader (with Joliet extension support)
// ---------------------------------------------------------------------------

const ISO_SECTOR: u64 = 2048;

fn iso_u32le(buf: &[u8], off: usize) -> u32 {
    u32::from_le_bytes(buf[off..off + 4].try_into().unwrap_or([0; 4]))
}

/// Decode a directory record identifier.
/// Joliet uses UCS-2 big-endian; plain ISO 9660 uses ASCII.
fn decode_iso_name(id_bytes: &[u8], is_joliet: bool) -> String {
    let raw: String = if is_joliet {
        id_bytes
            .chunks_exact(2)
            .filter_map(|c| char::from_u32(u16::from_be_bytes([c[0], c[1]]) as u32))
            .collect()
    } else {
        String::from_utf8_lossy(id_bytes).trim_end().to_string()
    };
    // Strip ";1" version suffix present in ISO 9660 names
    match raw.rfind(';') {
        Some(p) => raw[..p].to_string(),
        None => raw,
    }
}

/// Internal ISO entry that also carries the extent LBA (needed for extraction).
struct IsoRawEntry {
    path: String,
    lba: u32,
    size: u32,
    is_dir: bool,
}

fn iso_collect_dir(
    file: &mut File,
    lba: u32,
    size: u32,
    prefix: &str,
    is_joliet: bool,
    entries: &mut Vec<IsoRawEntry>,
) -> Result<(), String> {
    if size == 0 || lba == 0 {
        return Ok(());
    }
    file.seek(SeekFrom::Start(lba as u64 * ISO_SECTOR))
        .map_err(|e| e.to_string())?;
    let mut data = vec![0u8; size as usize];
    file.read_exact(&mut data).map_err(|e| e.to_string())?;

    let mut i = 0usize;
    while i < data.len() {
        let rec_len = data[i] as usize;
        if rec_len == 0 {
            // Zero-pad at sector boundary — advance to next sector.
            let next = (i / 2048 + 1) * 2048;
            if next >= data.len() { break; }
            i = next;
            continue;
        }
        if rec_len < 33 || i + rec_len > data.len() {
            i += 1; // skip malformed record rather than aborting
            continue;
        }

        let rec = &data[i..i + rec_len];
        i += rec_len;

        let id_len = rec[32] as usize;
        if id_len == 0 || 33 + id_len > rec.len() {
            continue;
        }
        let id_bytes = &rec[33..33 + id_len];

        // Skip "." (0x00) and ".." (0x01)
        if id_len == 1 && (id_bytes[0] == 0 || id_bytes[0] == 1) {
            continue;
        }

        let flags = rec[25];
        let is_dir = (flags & 0x02) != 0;
        let extent_lba = iso_u32le(rec, 2);
        let data_len = iso_u32le(rec, 10);

        let name = decode_iso_name(id_bytes, is_joliet);
        if name.is_empty() { continue; }

        let path = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };

        entries.push(IsoRawEntry { path: path.clone(), lba: extent_lba, size: data_len, is_dir });

        if entries.len() >= 50_000 { break; }

        if is_dir {
            iso_collect_dir(file, extent_lba, data_len, &path, is_joliet, entries)?;
        }
    }
    Ok(())
}

/// Scan the volume descriptor set and return the root directory parameters
/// (lba, size, is_joliet). Prefers Joliet over plain ISO 9660.
fn iso_find_root(file: &mut File) -> Result<(u32, u32, bool), String> {
    let mut pvd_root: Option<(u32, u32)> = None;
    let mut joliet_root: Option<(u32, u32)> = None;

    for sector in 16u64..32 {
        let mut vd = [0u8; 2048];
        file.seek(SeekFrom::Start(sector * ISO_SECTOR))
            .map_err(|e| e.to_string())?;
        if file.read_exact(&mut vd).is_err() { break; }
        if &vd[1..6] != b"CD001" { break; }
        match vd[0] {
            1 => {
                let root = &vd[156..190];
                pvd_root = Some((iso_u32le(root, 2), iso_u32le(root, 10)));
            }
            2 => {
                // Joliet SVD has escape sequences at bytes 88-90 starting with "%/"
                if vd[88] == b'%' && vd[89] == b'/' {
                    let root = &vd[156..190];
                    joliet_root = Some((iso_u32le(root, 2), iso_u32le(root, 10)));
                }
            }
            255 => break,
            _ => {}
        }
    }

    if let Some((lba, size)) = joliet_root {
        Ok((lba, size, true))
    } else if let Some((lba, size)) = pvd_root {
        Ok((lba, size, false))
    } else {
        Err("No es un archivo ISO 9660 válido".into())
    }
}

fn collect_iso_entries(src: &Path) -> Result<Vec<IsoRawEntry>, String> {
    let mut file = File::open(src).map_err(|e| e.to_string())?;
    let (root_lba, root_size, is_joliet) = iso_find_root(&mut file)?;
    let mut entries = Vec::new();
    iso_collect_dir(&mut file, root_lba, root_size, "", is_joliet, &mut entries)?;
    Ok(entries)
}

fn read_iso_entries(src: &Path) -> Result<Vec<ArchiveEntry>, String> {
    collect_iso_entries(src).map(|v| {
        v.into_iter()
            .map(|e| ArchiveEntry { path: e.path, size: e.size as u64, is_dir: e.is_dir })
            .collect()
    })
}

fn extract_iso(
    src: &Path,
    out_dir: &Path,
    on_progress: &impl Fn(usize, &str),
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let entries = collect_iso_entries(src)?;
    let mut file = File::open(src).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 65536];

    for (i, entry) in entries.iter().enumerate() {
        if should_cancel() { return Err("__CANCELLED__".into()); }
        let dest = out_dir.join(&entry.path);
        if entry.is_dir {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        on_progress(i + 1, &entry.path);
        file.seek(SeekFrom::Start(entry.lba as u64 * ISO_SECTOR))
            .map_err(|e| e.to_string())?;
        let mut out_file = File::create(&dest).map_err(|e| e.to_string())?;
        let mut remaining = entry.size as u64;
        while remaining > 0 {
            let n = remaining.min(buf.len() as u64) as usize;
            file.read_exact(&mut buf[..n]).map_err(|e| e.to_string())?;
            out_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            remaining -= n as u64;
        }
    }
    Ok(())
}

fn list_tar_entries<R: Read>(reader: R) -> Result<Vec<ArchiveEntry>, String> {
    let mut archive = tar::Archive::new(reader);
    let mut entries: Vec<ArchiveEntry> = Vec::new();
    for entry_result in archive.entries().map_err(|e| e.to_string())? {
        let entry = entry_result.map_err(|e| e.to_string())?;
        let path_str = entry
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let path_clean = path_str.trim_end_matches('/').to_string();
        if path_clean.is_empty() { continue; }
        let size = entry.header().size().unwrap_or(0);
        let is_dir = entry.header().entry_type().is_dir();
        entries.push(ArchiveEntry { path: path_clean, size, is_dir });
        if entries.len() >= 50_000 { break; }
    }
    Ok(entries)
}

fn list_zip_entries(src: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let file = File::open(src).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entries: Vec<ArchiveEntry> = Vec::new();
    for i in 0..archive.len().min(50_000) {
        let zf = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = zf.name().trim_end_matches('/').to_string();
        if name.is_empty() { continue; }
        entries.push(ArchiveEntry { path: name, size: zf.size(), is_dir: zf.is_dir() });
    }
    Ok(entries)
}

/// List the contents of a supported archive without extracting.
#[tauri::command]
pub async fn list_archive_entries(path: String) -> Result<Vec<ArchiveEntry>, String> {
    use flate2::read::GzDecoder;
    use bzip2::read::BzDecoder;

    let src = Path::new(&path);
    reject_traversal(src)?;
    if !src.is_file() {
        return Err("No es un archivo".into());
    }

    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nombre inválido")?;

    let (kind, stem) = detect_kind(name).ok_or_else(|| "Formato no soportado".to_string())?;

    match kind {
        ArchiveKind::TarZst => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            let dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
            list_tar_entries(dec)
        }
        ArchiveKind::TarGz => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            list_tar_entries(GzDecoder::new(file))
        }
        ArchiveKind::TarBz2 => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            list_tar_entries(BzDecoder::new(file))
        }
        ArchiveKind::Tar => {
            let file = File::open(src).map_err(|e| e.to_string())?;
            list_tar_entries(file)
        }
        ArchiveKind::Zip => list_zip_entries(src),
        ArchiveKind::Iso => read_iso_entries(src),
        // Raw single-file compressors — just report the stem as the single entry
        ArchiveKind::Zst | ArchiveKind::Gz | ArchiveKind::Bz2 => {
            Ok(vec![ArchiveEntry { path: stem.to_string(), size: 0, is_dir: false }])
        }
    }
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
