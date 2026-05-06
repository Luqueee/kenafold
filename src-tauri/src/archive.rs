use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::Emitter;

use crate::path_safety::{ensure_within, reject_traversal, validate_filename};

// Incompressible file types — storing them uncompressed saves CPU with no size penalty
const INCOMPRESSIBLE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif",
    "mp4", "mkv", "mov", "avi", "wmv", "m4v", "webm",
    "mp3", "m4a", "aac", "flac", "ogg", "opus", "wav",
    "zip", "gz", "bz2", "zst", "xz", "7z", "rar", "br", "lz4",
];

fn is_incompressible(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| INCOMPRESSIBLE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

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
// CountingReader — tracks bytes read through it
// ---------------------------------------------------------------------------

struct CountingReader<R: Read> {
    inner: R,
    counter: Arc<AtomicU64>,
}

impl<R: Read> Read for CountingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.counter.fetch_add(n as u64, Ordering::Relaxed);
        Ok(n)
    }
}

impl<R: Read + Seek> Seek for CountingReader<R> {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.inner.seek(pos)
    }
}

// TickReader — calls a closure on every read, forwarding byte count
struct TickReader<R: Read, F: Fn(u64)> {
    inner: R,
    bytes: u64,
    tick: F,
}

impl<R: Read, F: Fn(u64)> Read for TickReader<R, F> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.bytes += n as u64;
        (self.tick)(self.bytes);
        Ok(n)
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
    bytes_processed: u64,
    total_bytes: u64, // 0 = unknown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn dir_size(path: &Path) -> u64 {
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let p = e.path();
                    if p.is_dir() { dir_size(&p) } else { p.metadata().map(|m| m.len()).unwrap_or(0) }
                })
                .sum()
        })
        .unwrap_or(0)
}

fn calc_total_bytes(sources: &[PathBuf]) -> u64 {
    sources
        .iter()
        .map(|s| if s.is_dir() { dir_size(s) } else { s.metadata().map(|m| m.len()).unwrap_or(0) })
        .sum()
}

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
// Compression level preset
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CompressLevel {
    Fast,
    Normal,
    Best,
}

impl CompressLevel {
    fn from_str(s: &str) -> Self {
        match s {
            "fast" => Self::Fast,
            "best" => Self::Best,
            _ => Self::Normal,
        }
    }

    fn zstd(self) -> i32 {
        match self { Self::Fast => 1, Self::Normal => 3, Self::Best => 19 }
    }

    fn deflate(self) -> flate2::Compression {
        match self {
            Self::Fast => flate2::Compression::fast(),
            Self::Normal => flate2::Compression::default(),
            Self::Best => flate2::Compression::best(),
        }
    }

    fn bzip2(self) -> bzip2::Compression {
        match self {
            Self::Fast => bzip2::Compression::fast(),
            Self::Normal => bzip2::Compression::default(),
            Self::Best => bzip2::Compression::best(),
        }
    }

    fn zip_level(self) -> i64 {
        match self { Self::Fast => 1, Self::Normal => 6, Self::Best => 9 }
    }
}

// ---------------------------------------------------------------------------
// Supported compression formats
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CompressFormat {
    TarZst,
    TarGz,
    TarBz2,
    Zip,
    SevenZ,
    Rar,
}

impl CompressFormat {
    fn from_str(s: &str) -> Self {
        match s {
            "tar.gz" | "tgz" => Self::TarGz,
            "tar.bz2" | "tbz2" => Self::TarBz2,
            "zip" => Self::Zip,
            "7z" => Self::SevenZ,
            "rar" => Self::Rar,
            _ => Self::TarZst,
        }
    }

    /// Returns the file extension for this format (multi-file or single-file archive).
    fn multi_ext(self) -> &'static str {
        match self {
            Self::TarZst => "tar.zst",
            Self::TarGz  => "tar.gz",
            Self::TarBz2 => "tar.bz2",
            Self::Zip    => "zip",
            Self::SevenZ => "7z",
            Self::Rar    => "rar",
        }
    }

    /// Extension used when archiving a single raw file (only relevant for zst).
    fn single_ext(self) -> &'static str {
        match self {
            Self::TarZst => "zst",
            _            => self.multi_ext(),
        }
    }
}

fn find_7z_cmd() -> Option<&'static str> {
    for cmd in ["7z", "7za", "7zz"] {
        if std::process::Command::new(cmd)
            .arg("i")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok()
        {
            return Some(cmd);
        }
    }
    None
}

fn run_compression_7z(
    sources: &[PathBuf],
    out_path: &Path,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    if should_cancel() {
        return Err("__CANCELLED__".into());
    }
    let cmd_name = find_7z_cmd().ok_or_else(|| {
        "Comando '7z' no encontrado. Instalá con: brew install sevenzip".to_string()
    })?;

    let mx = match level {
        CompressLevel::Fast   => "1",
        CompressLevel::Normal => "5",
        CompressLevel::Best   => "9",
    };

    // out_path is the .partial file; 7z needs a .7z extension to auto-detect format.
    let dir = out_path.parent().unwrap_or(Path::new("."));
    let tmp = dir.join(format!(".kenafold_tmp_{}.7z", std::process::id()));

    on_progress(1, sources.len(), "comprimiendo...", 0);

    let mut cmd = std::process::Command::new(cmd_name);
    cmd.arg("a").arg(format!("-mx={}", mx)).arg(&tmp);
    for src in sources {
        cmd.arg(src);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    std::fs::rename(&tmp, out_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;

    Ok(())
}

fn run_compression_rar(
    sources: &[PathBuf],
    out_path: &Path,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    if should_cancel() {
        return Err("__CANCELLED__".into());
    }

    let m_flag = match level {
        CompressLevel::Fast   => "-m1",
        CompressLevel::Normal => "-m3",
        CompressLevel::Best   => "-m5",
    };

    let dir = out_path.parent().unwrap_or(Path::new("."));
    let tmp = dir.join(format!(".kenafold_tmp_{}.rar", std::process::id()));

    on_progress(1, sources.len(), "comprimiendo...", 0);

    let mut cmd = std::process::Command::new("rar");
    cmd.arg("a").arg(m_flag).arg("-ep1").arg(&tmp);
    for src in sources {
        cmd.arg(src);
    }

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Comando 'rar' no encontrado. Instalá con: brew install rar".to_string()
        } else {
            e.to_string()
        }
    })?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    std::fs::rename(&tmp, out_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tar file append with intra-file progress
// ---------------------------------------------------------------------------

fn tar_append_file_ticked<W: Write>(
    tar: &mut tar::Builder<W>,
    src: &Path,
    name: &str,
    on_tick: impl Fn(u64),
) -> Result<(), String> {
    let metadata = src.metadata().map_err(|e| e.to_string())?;
    let mut header = tar::Header::new_gnu();
    header.set_path(name).map_err(|e| e.to_string())?;
    header.set_metadata(&metadata);
    header.set_cksum();
    let file = File::open(src).map_err(|e| e.to_string())?;
    let reader = TickReader { inner: file, bytes: 0, tick: on_tick };
    tar.append(&header, reader).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Core workers (run on a blocking thread)
// ---------------------------------------------------------------------------

fn run_compression_zst(
    sources: &[PathBuf],
    out_path: &Path,
    single_file: bool,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let mut encoder =
        zstd::stream::Encoder::new(writer, level.zstd()).map_err(|e| e.to_string())?;
    // Level 19 MT divides data into independent jobs — cross-job context is lost,
    // degrading effective compression. Single-thread is required for true level 19.
    let zstd_workers = if level == CompressLevel::Best { 0 } else { workers() };
    encoder.multithread(zstd_workers).map_err(|e| e.to_string())?;
    encoder.include_checksum(true).map_err(|e| e.to_string())?;

    if single_file {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let name = sources[0]
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let mut input = File::open(&sources[0]).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 1 << 20];
        let mut bytes_done: u64 = 0;
        on_progress(1, 1, name, bytes_done);
        loop {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            let n = input.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            encoder.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            bytes_done += n as u64;
            on_progress(1, 1, name, bytes_done);
        }
    } else {
        let total = sources.len();
        let mut tar = tar::Builder::new(&mut encoder);
        tar.follow_symlinks(false);
        let mut bytes_done: u64 = 0;
        for (i, src) in sources.iter().enumerate() {
            if should_cancel() {
                return Err("__CANCELLED__".into());
            }
            let name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Nombre inválido")?;
            on_progress(i + 1, total, name, bytes_done);
            if src.is_dir() {
                tar.append_dir_all(name, src).map_err(|e| e.to_string())?;
                bytes_done += dir_size(src);
                on_progress(i + 1, total, name, bytes_done);
            } else {
                let base = bytes_done;
                let file_size = src.metadata().map(|m| m.len()).unwrap_or(0);
                tar_append_file_ticked(&mut tar, src, name, |file_bytes| {
                    on_progress(i + 1, total, name, base + file_bytes);
                })?;
                bytes_done = base + file_size;
            }
        }
        tar.finish().map_err(|e| e.to_string())?;
    }

    let writer = encoder.finish().map_err(|e| e.to_string())?;
    writer.into_inner().map_err(|e| e.to_string())?;
    Ok(())
}

fn zip_options_for(path: &Path, level: CompressLevel) -> zip::write::SimpleFileOptions {
    let base = zip::write::SimpleFileOptions::default();
    if level == CompressLevel::Fast && is_incompressible(path) {
        base.compression_method(zip::CompressionMethod::Stored)
    } else {
        base.compression_method(zip::CompressionMethod::Deflated)
            .compression_level(Some(level.zip_level()))
    }
}

fn add_dir_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    level: CompressLevel,
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let dir_name = format!("{}/", prefix);
    let dir_opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);
    zip.add_directory(&dir_name, dir_opts).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        let zip_path = format!("{}/{}", prefix, name);
        if path.is_dir() {
            add_dir_to_zip(zip, &path, &zip_path, level, should_cancel)?;
        } else {
            let opts = zip_options_for(&path, level);
            zip.start_file(&zip_path, opts).map_err(|e| e.to_string())?;
            let mut f = File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn run_compression_zip(
    sources: &[PathBuf],
    out_path: &Path,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let mut zip = zip::ZipWriter::new(writer);

    let total = sources.len();
    let mut bytes_done: u64 = 0;
    for (i, src) in sources.iter().enumerate() {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        on_progress(i + 1, total, name, bytes_done);
        if src.is_dir() {
            add_dir_to_zip(&mut zip, src, name, level, &should_cancel)?;
            bytes_done += dir_size(src);
            on_progress(i + 1, total, name, bytes_done);
        } else {
            let opts = zip_options_for(src, level);
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            let mut f = File::open(src).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 1 << 20];
            let base = bytes_done;
            let mut file_bytes: u64 = 0;
            loop {
                if should_cancel() { return Err("__CANCELLED__".into()); }
                let n = f.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                zip.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                file_bytes += n as u64;
                bytes_done = base + file_bytes;
                on_progress(i + 1, total, name, bytes_done);
            }
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn run_compression_tar_gz(
    sources: &[PathBuf],
    out_path: &Path,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let enc = flate2::write::GzEncoder::new(writer, level.deflate());
    let mut tar_builder = tar::Builder::new(enc);
    tar_builder.follow_symlinks(false);

    let total = sources.len();
    let mut bytes_done: u64 = 0;
    for (i, src) in sources.iter().enumerate() {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        on_progress(i + 1, total, name, bytes_done);
        if src.is_dir() {
            tar_builder.append_dir_all(name, src).map_err(|e| e.to_string())?;
            bytes_done += dir_size(src);
            on_progress(i + 1, total, name, bytes_done);
        } else {
            let base = bytes_done;
            let file_size = src.metadata().map(|m| m.len()).unwrap_or(0);
            tar_append_file_ticked(&mut tar_builder, src, name, |file_bytes| {
                on_progress(i + 1, total, name, base + file_bytes);
            })?;
            bytes_done = base + file_size;
        }
    }
    let enc = tar_builder.into_inner().map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn run_compression_tar_bz2(
    sources: &[PathBuf],
    out_path: &Path,
    level: CompressLevel,
    on_progress: impl Fn(usize, usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let enc = bzip2::write::BzEncoder::new(writer, level.bzip2());
    let mut tar_builder = tar::Builder::new(enc);
    tar_builder.follow_symlinks(false);

    let total = sources.len();
    let mut bytes_done: u64 = 0;
    for (i, src) in sources.iter().enumerate() {
        if should_cancel() {
            return Err("__CANCELLED__".into());
        }
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        on_progress(i + 1, total, name, bytes_done);
        if src.is_dir() {
            tar_builder.append_dir_all(name, src).map_err(|e| e.to_string())?;
            bytes_done += dir_size(src);
            on_progress(i + 1, total, name, bytes_done);
        } else {
            let base = bytes_done;
            let file_size = src.metadata().map(|m| m.len()).unwrap_or(0);
            tar_append_file_ticked(&mut tar_builder, src, name, |file_bytes| {
                on_progress(i + 1, total, name, base + file_bytes);
            })?;
            bytes_done = base + file_size;
        }
    }
    let enc = tar_builder.into_inner().map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())?;
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

fn extract_zip<R: Read + Seek>(
    reader: R,
    out_dir: &Path,
    on_progress: &impl Fn(usize, &str),
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;
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
    on_progress: impl Fn(usize, &str, u64),
    should_cancel: impl Fn() -> bool,
) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use bzip2::read::BzDecoder;

    let bytes_counter = Arc::new(AtomicU64::new(0));

    macro_rules! counting_file {
        () => {{
            let f = File::open(src).map_err(|e| e.to_string())?;
            CountingReader { inner: f, counter: bytes_counter.clone() }
        }};
    }

    let bc = bytes_counter.clone();
    let prog = |current: usize, label: &str| {
        on_progress(current, label, bc.load(Ordering::Relaxed));
    };

    match kind {
        ArchiveKind::TarZst => {
            let dec = zstd::stream::Decoder::new(counting_file!()).map_err(|e| e.to_string())?;
            extract_tar(dec, out_path, &prog, &should_cancel)
        }
        ArchiveKind::TarGz => {
            extract_tar(GzDecoder::new(counting_file!()), out_path, &prog, &should_cancel)
        }
        ArchiveKind::TarBz2 => {
            extract_tar(BzDecoder::new(counting_file!()), out_path, &prog, &should_cancel)
        }
        ArchiveKind::Tar => {
            extract_tar(counting_file!(), out_path, &prog, &should_cancel)
        }
        ArchiveKind::Zip => {
            extract_zip(counting_file!(), out_path, &prog, &should_cancel)
        }
        ArchiveKind::Iso => extract_iso(src, out_path, &prog, &should_cancel),
        // Raw single-file decompressors — chunked copy for smooth progress
        ArchiveKind::Zst => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            let label = src.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let counting = counting_file!();
            let mut dec = zstd::stream::Decoder::new(counting).map_err(|e| e.to_string())?;
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 1 << 20];
            prog(1, label);
            loop {
                if should_cancel() { return Err("__CANCELLED__".into()); }
                let n = dec.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                prog(1, label);
            }
            Ok(())
        }
        ArchiveKind::Gz => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            let label = src.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let mut dec = GzDecoder::new(counting_file!());
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 1 << 20];
            prog(1, label);
            loop {
                if should_cancel() { return Err("__CANCELLED__".into()); }
                let n = dec.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                prog(1, label);
            }
            Ok(())
        }
        ArchiveKind::Bz2 => {
            if should_cancel() { return Err("__CANCELLED__".into()); }
            let label = src.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let mut dec = BzDecoder::new(counting_file!());
            let mut out = File::create(out_path).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 1 << 20];
            prog(1, label);
            loop {
                if should_cancel() { return Err("__CANCELLED__".into()); }
                let n = dec.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                prog(1, label);
            }
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Compress one or more entries into a single archive in `dest_dir`.
/// `format`: "tar.zst" (default) | "tar.gz" | "tar.bz2" | "zip"
/// `level`: "fast" | "normal" (default) | "best"
#[tauri::command]
pub async fn compress_entries(
    app: tauri::AppHandle,
    cancel_map: tauri::State<'_, CancelMap>,
    paths: Vec<String>,
    dest_dir: String,
    archive_name: Option<String>,
    format: Option<String>,
    level: Option<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("Sin archivos para comprimir".into());
    }
    let dest = Path::new(&dest_dir);
    reject_traversal(dest)?;
    if !dest.is_dir() {
        return Err("Destino inválido".into());
    }

    let fmt = CompressFormat::from_str(format.as_deref().unwrap_or("tar.zst"));
    let lvl = CompressLevel::from_str(level.as_deref().unwrap_or("normal"));

    let sources: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    for s in &sources {
        reject_traversal(s)?;
        if !s.exists() {
            return Err(format!("No existe: {}", s.display()));
        }
    }

    detect_collisions(&sources)?;

    let total_bytes = calc_total_bytes(&sources);

    // Only .zst has a distinct single-file mode; all other formats always produce a container.
    let single_file = fmt == CompressFormat::TarZst && sources.len() == 1 && sources[0].is_file();

    let out_path = if single_file {
        let src = &sources[0];
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre inválido")?;
        let target = format!("{}.{}", name, fmt.single_ext());
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
        let target = format!("{}.{}", base, fmt.multi_ext());
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
            bytes_processed: 0,
            total_bytes,
        },
    );

    let app_clone = app.clone();
    let op_id_clone = op_id.clone();
    let partial_clone = partial.clone();
    let cancel_flag_clone = cancel_flag.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let on_progress = |current, total, label: &str, bytes_processed: u64| {
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
                    bytes_processed,
                    total_bytes,
                },
            );
        };
        let should_cancel = move || cancel_flag_clone.load(Ordering::Relaxed);
        match fmt {
            CompressFormat::TarZst => run_compression_zst(&sources, &partial_clone, single_file, lvl, on_progress, should_cancel),
            CompressFormat::Zip    => run_compression_zip(&sources, &partial_clone, lvl, on_progress, should_cancel),
            CompressFormat::TarGz  => run_compression_tar_gz(&sources, &partial_clone, lvl, on_progress, should_cancel),
            CompressFormat::TarBz2 => run_compression_tar_bz2(&sources, &partial_clone, lvl, on_progress, should_cancel),
            CompressFormat::SevenZ => run_compression_7z(&sources, &partial_clone, lvl, on_progress, should_cancel),
            CompressFormat::Rar    => run_compression_rar(&sources, &partial_clone, lvl, on_progress, should_cancel),
        }
    })
    .await
    // Flatten JoinError into our error type so unregister always runs below.
    .unwrap_or_else(|e| Err(format!("Tarea cancelada: {}", e)));

    // Always unregister — even on JoinError — to avoid leaking CancelMap entries.
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
                bytes_processed: 0,
                total_bytes,
            },
        );
        if cancelled {
            return Ok(String::new());
        }
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
            bytes_processed: total_bytes,
            total_bytes,
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

    let file_size = src.metadata().map(|m| m.len()).unwrap_or(0);
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
            bytes_processed: 0,
            total_bytes: file_size,
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
            |current, label, bytes_processed| {
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
                        bytes_processed,
                        total_bytes: file_size,
                    },
                );
            },
            move || cancel_flag_clone.load(Ordering::Relaxed),
        )
    })
    .await
    // Flatten JoinError into our error type so unregister always runs below.
    .unwrap_or_else(|e| Err(format!("Tarea cancelada: {}", e)));

    // Always unregister — even on JoinError — to avoid leaking CancelMap entries.
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
                bytes_processed: 0,
                total_bytes: file_size,
            },
        );
        if cancelled {
            return Ok(String::new());
        }
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
            bytes_processed: file_size,
            total_bytes: file_size,
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
