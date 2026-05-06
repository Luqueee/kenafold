use rusqlite::{params, Connection, Result as SqlResult};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::State;

use crate::fs::FileEntry;

pub struct TagsDb(pub Mutex<Connection>);

impl TagsDb {
    pub fn open(path: &Path) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS file_tags (
                path   TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (path, tag_id)
            );",
        )?;
        Ok(TagsDb(Mutex::new(conn)))
    }
}

#[tauri::command]
pub fn tags_get(path: String, db: State<TagsDb>) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT tag_id FROM file_tags WHERE path = ?1")
        .map_err(|e| e.to_string())?;
    let tags: SqlResult<Vec<String>> = stmt
        .query_map(params![path], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect();
    tags.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tags_set(path: String, tag_id: String, db: State<TagsDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO file_tags (path, tag_id) VALUES (?1, ?2)",
        params![path, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn tags_remove(path: String, tag_id: String, db: State<TagsDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM file_tags WHERE path = ?1 AND tag_id = ?2",
        params![path, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn tags_get_all(db: State<TagsDb>) -> Result<HashMap<String, Vec<String>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path, tag_id FROM file_tags")
        .map_err(|e| e.to_string())?;
    let rows: SqlResult<Vec<(String, String)>> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect();
    let rows = rows.map_err(|e| e.to_string())?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for (path, tag_id) in rows {
        map.entry(path).or_default().push(tag_id);
    }
    Ok(map)
}

#[tauri::command]
pub fn tags_get_entries_by_tag(tag_id: String, db: State<TagsDb>) -> Result<Vec<FileEntry>, String> {
    let paths = tags_get_by_tag(tag_id, db)?;
    let mut entries = Vec::new();
    for path_str in paths {
        let p = std::path::Path::new(&path_str);
        if let Ok(meta) = std::fs::metadata(p) {
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let extension = p
                .extension()
                .map(|e| e.to_string_lossy().into_owned());
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            entries.push(FileEntry {
                name,
                path: path_str,
                is_dir: meta.is_dir(),
                size: meta.len(),
                modified,
                extension,
            });
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn tags_get_by_tag(tag_id: String, db: State<TagsDb>) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path FROM file_tags WHERE tag_id = ?1")
        .map_err(|e| e.to_string())?;
    let paths: SqlResult<Vec<String>> = stmt
        .query_map(params![tag_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect();
    paths.map_err(|e| e.to_string())
}
