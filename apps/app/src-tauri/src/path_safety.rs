use std::path::{Component, Path, PathBuf};

pub fn validate_filename(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Nombre vacío".into());
    }
    if name == "." || name == ".." {
        return Err("Nombre reservado".into());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("Nombre con caracteres inválidos".into());
    }
    #[cfg(target_os = "windows")]
    {
        const RESERVED: &[&str] = &[
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];
        let upper = name.to_uppercase();
        let stem = upper.split('.').next().unwrap_or(&upper);
        if RESERVED.contains(&stem) {
            return Err("Nombre reservado por Windows".into());
        }
        if name.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*')) {
            return Err("Carácter no permitido en Windows".into());
        }
    }
    Ok(())
}

/// Canonicaliza `parent` y asegura que `child` (resuelto) viva bajo él.
/// Sirve para bloquear symlink-escape y `..` ocultos.
pub fn ensure_within(parent: &Path, child: &Path) -> Result<PathBuf, String> {
    let canon_parent = parent
        .canonicalize()
        .map_err(|e| format!("Padre inaccesible: {}", e))?;

    // El hijo puede no existir aún (ej. rename target). Resolvemos su parent y le pegamos el filename.
    let resolved = if child.exists() {
        child.canonicalize().map_err(|e| e.to_string())?
    } else {
        let cp = child
            .parent()
            .ok_or("Sin directorio padre")?
            .canonicalize()
            .map_err(|e| format!("Padre destino inaccesible: {}", e))?;
        let name = child.file_name().ok_or("Sin nombre de archivo")?;
        cp.join(name)
    };

    if !resolved.starts_with(&canon_parent) {
        return Err("Path escapa del directorio permitido".into());
    }
    Ok(resolved)
}

/// Rechaza paths con componentes `..` o prefijos sospechosos.
pub fn reject_traversal(path: &Path) -> Result<(), String> {
    for c in path.components() {
        if matches!(c, Component::ParentDir) {
            return Err("Path con '..' rechazado".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_name() {
        assert!(validate_filename("").is_err());
    }

    #[test]
    fn rejects_dot_names() {
        assert!(validate_filename(".").is_err());
        assert!(validate_filename("..").is_err());
    }

    #[test]
    fn rejects_path_separators() {
        assert!(validate_filename("a/b").is_err());
        assert!(validate_filename("a\\b").is_err());
    }

    #[test]
    fn rejects_null_byte() {
        assert!(validate_filename("a\0b").is_err());
    }

    #[test]
    fn accepts_normal_names() {
        assert!(validate_filename("foo.txt").is_ok());
        assert!(validate_filename("hidden.dotfile").is_ok());
        assert!(validate_filename("with spaces.md").is_ok());
        assert!(validate_filename("über.txt").is_ok());
    }

    #[test]
    fn traversal_blocks_parent_dir() {
        assert!(reject_traversal(Path::new("foo/../bar")).is_err());
        assert!(reject_traversal(Path::new("..")).is_err());
        assert!(reject_traversal(Path::new("a/b/../c")).is_err());
    }

    #[test]
    fn traversal_allows_clean_paths() {
        assert!(reject_traversal(Path::new("/a/b/c")).is_ok());
        assert!(reject_traversal(Path::new("foo/bar/baz.txt")).is_ok());
    }

    #[test]
    fn ensure_within_blocks_escape() {
        let tmp = std::env::temp_dir();
        let outside = tmp.parent().unwrap_or(Path::new("/")).join("escapee");
        let result = ensure_within(&tmp, &outside);
        assert!(result.is_err());
    }

    #[test]
    fn ensure_within_accepts_child() {
        let tmp = std::env::temp_dir();
        let child = tmp.join("inside.txt");
        // Path no existe pero parent canoniza OK
        assert!(ensure_within(&tmp, &child).is_ok());
    }
}
