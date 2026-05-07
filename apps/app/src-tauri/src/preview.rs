use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

use crate::path_safety::reject_traversal;

const MAX_TEXT_BYTES: u64 = 256 * 1024;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Preview {
    Text { mime: String, content: String, truncated: bool },
    Image { mime: String },
    Audio { mime: String },
    Video { mime: String },
    Pdf,
    Unsupported { ext: Option<String> },
}

fn classify(ext: &str) -> (&'static str, &'static str) {
    match ext {
        "png" => ("image", "image/png"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "gif" => ("image", "image/gif"),
        "webp" => ("image", "image/webp"),
        "svg" => ("image", "image/svg+xml"),
        "bmp" => ("image", "image/bmp"),
        "ico" => ("image", "image/x-icon"),
        "avif" => ("image", "image/avif"),
        "mp3" => ("audio", "audio/mpeg"),
        "wav" => ("audio", "audio/wav"),
        "ogg" | "oga" => ("audio", "audio/ogg"),
        "flac" => ("audio", "audio/flac"),
        "m4a" => ("audio", "audio/mp4"),
        "mp4" | "m4v" => ("video", "video/mp4"),
        "webm" => ("video", "video/webm"),
        "mov" => ("video", "video/quicktime"),
        "pdf" => ("pdf", "application/pdf"),
        "txt" | "md" | "rs" | "ts" | "tsx" | "js" | "jsx" | "json" | "toml" | "yaml" | "yml"
        | "html" | "css" | "scss" | "py" | "go" | "java" | "c" | "cpp" | "h" | "hpp" | "sh"
        | "zsh" | "bash" | "fish" | "lua" | "rb" | "php" | "sql" | "xml" | "csv" | "log"
        | "ini" | "conf" | "env" | "gitignore" | "lock" => ("text", "text/plain"),
        _ => ("other", "application/octet-stream"),
    }
}

#[tauri::command]
pub async fn preview_file(path: String) -> Result<Preview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        reject_traversal(p)?;

        let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            return Ok(Preview::Unsupported { ext: None });
        }
        let size = meta.len();

        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let ext_str = ext.as_deref().unwrap_or("");
        let (kind, mime) = classify(ext_str);

        if kind == "text" {
            let cap = std::cmp::min(size, MAX_TEXT_BYTES) as usize;
            let mut buf = Vec::with_capacity(cap);
            File::open(p)
                .map_err(|e| e.to_string())?
                .take(MAX_TEXT_BYTES)
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            let content = String::from_utf8_lossy(&buf).into_owned();
            return Ok(Preview::Text {
                mime: mime.into(),
                content,
                truncated: size > MAX_TEXT_BYTES,
            });
        }

        let _ = size;
        match kind {
            "image" => Ok(Preview::Image { mime: mime.into() }),
            "audio" => Ok(Preview::Audio { mime: mime.into() }),
            "video" => Ok(Preview::Video { mime: mime.into() }),
            "pdf" => Ok(Preview::Pdf),
            _ => Ok(Preview::Unsupported { ext }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
