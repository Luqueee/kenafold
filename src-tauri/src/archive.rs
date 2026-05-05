use std::collections::HashSet;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::thread;

use crate::path_safety::{ensure_within, reject_traversal, validate_filename};

const ZSTD_LEVEL: i32 = 3;

fn workers() -> u32 {
    thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1)
}

/// Split `archive (1).tar.zst` correctly: stem = "archive", ext = ".tar.zst".
/// Returns the suffixed candidate as `<stem> (<n>)<ext>`.
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

fn run_compression(
    sources: &[PathBuf],
    out_path: &Path,
    single_file: bool,
) -> Result<(), String> {
    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(1 << 20, file);
    let mut encoder = zstd::stream::Encoder::new(writer, ZSTD_LEVEL).map_err(|e| e.to_string())?;
    encoder.multithread(workers()).map_err(|e| e.to_string())?;
    encoder.include_checksum(true).map_err(|e| e.to_string())?;

    if single_file {
        let mut input = File::open(&sources[0]).map_err(|e| e.to_string())?;
        std::io::copy(&mut input, &mut encoder).map_err(|e| e.to_string())?;
    } else {
        let mut tar = tar::Builder::new(&mut encoder);
        tar.follow_symlinks(false);
        for src in sources {
            let name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Nombre inválido")?;
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

/// Compress one or more entries into a single archive in `dest_dir`.
/// Single regular file → `<name>.zst` (raw zstd, no tar wrapper).
/// Otherwise → `<archive_name>.tar.zst` with tar streaming through zstd.
#[tauri::command]
pub async fn compress_entries(
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

    // Write to <out_path>.partial; rename on success, delete on failure.
    let mut partial = out_path.clone().into_os_string();
    partial.push(".partial");
    let partial = PathBuf::from(partial);

    let partial_clone = partial.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_compression(&sources, &partial_clone, single_file)
    })
    .await
    .map_err(|e| format!("Tarea cancelada: {}", e))?;

    if let Err(e) = result {
        std::fs::remove_file(&partial).ok();
        return Err(e);
    }

    std::fs::rename(&partial, &out_path).map_err(|e| {
        std::fs::remove_file(&partial).ok();
        e.to_string()
    })?;

    Ok(out_path.to_string_lossy().to_string())
}

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
}
