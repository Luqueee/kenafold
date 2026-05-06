use std::collections::{BTreeSet, HashMap};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffEntry {
    pub name: String,
    pub status: String,
    pub is_dir: bool,
    pub size_a: Option<u64>,
    pub size_b: Option<u64>,
    pub mtime_a: Option<u64>,
    pub mtime_b: Option<u64>,
    pub path_a: Option<String>,
    pub path_b: Option<String>,
}

struct EntryInfo {
    is_dir: bool,
    size: u64,
    mtime: u64,
    path: String,
}

fn read_dir_flat(dir: &str) -> HashMap<String, EntryInfo> {
    let mut map = HashMap::new();
    let Ok(read) = std::fs::read_dir(dir) else {
        return map;
    };
    for entry in read.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(name) = entry.file_name().into_string() else { continue };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        map.insert(
            name,
            EntryInfo {
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                mtime,
                path: entry.path().to_string_lossy().to_string(),
            },
        );
    }
    map
}

#[tauri::command]
pub fn compare_directories(dir_a: String, dir_b: String) -> Result<Vec<DiffEntry>, String> {
    let map_a = read_dir_flat(&dir_a);
    let map_b = read_dir_flat(&dir_b);

    let mut all_names = BTreeSet::new();
    all_names.extend(map_a.keys().cloned());
    all_names.extend(map_b.keys().cloned());

    let mut entries: Vec<DiffEntry> = all_names
        .into_iter()
        .map(|name| {
            let a = map_a.get(&name);
            let b = map_b.get(&name);
            let status = match (a, b) {
                (Some(a), Some(b)) => {
                    if a.size == b.size && a.mtime == b.mtime {
                        "identical"
                    } else {
                        "different"
                    }
                }
                (Some(_), None) => "only_a",
                (None, Some(_)) => "only_b",
                (None, None) => unreachable!(),
            };
            DiffEntry {
                name,
                status: status.to_string(),
                is_dir: a.map(|x| x.is_dir).or(b.map(|x| x.is_dir)).unwrap_or(false),
                size_a: a.map(|x| x.size),
                size_b: b.map(|x| x.size),
                mtime_a: a.map(|x| x.mtime),
                mtime_b: b.map(|x| x.mtime),
                path_a: a.map(|x| x.path.clone()),
                path_b: b.map(|x| x.path.clone()),
            }
        })
        .collect();

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}
