use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use md5::{Digest as _, Md5};
use serde::Serialize;
use sha1::Sha1;
use sha2::Sha256;

use crate::path_safety::reject_traversal;

const BUF_SIZE: usize = 64 * 1024;

#[derive(Serialize)]
pub struct FileHashes {
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
    pub size: u64,
}

fn compute(path: &Path) -> Result<FileHashes, String> {
    reject_traversal(path)?;

    let file = File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut reader = BufReader::new(file);

    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buf = vec![0u8; BUF_SIZE];

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let chunk = &buf[..n];
        md5::Digest::update(&mut md5, chunk);
        sha1::Digest::update(&mut sha1, chunk);
        sha2::Digest::update(&mut sha256, chunk);
    }

    Ok(FileHashes {
        md5: hex::encode(md5::Digest::finalize(md5)),
        sha1: hex::encode(sha1::Digest::finalize(sha1)),
        sha256: hex::encode(sha2::Digest::finalize(sha256)),
        size,
    })
}

#[tauri::command]
pub async fn compute_file_hashes(path: String) -> Result<FileHashes, String> {
    tauri::async_runtime::spawn_blocking(move || compute(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}
