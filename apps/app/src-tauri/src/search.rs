use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use ignore::{WalkBuilder, WalkState};
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub extension: Option<String>,
    pub score: u32,
}

const SEARCH_LIMIT: usize = 100;
const WALK_LIMIT: usize = 250_000;
const INDEX_TTL: Duration = Duration::from_secs(5 * 60); // evict after 5 min idle
const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".turbo",
    ".gradle",
    ".idea",
    ".vscode",
    "Library",
];

// Lean: only what the fuzzy scorer needs. Size/mtime fetched on-demand at result time.
struct IndexEntry {
    name: String,
    path: String,
    is_dir: bool,
}

struct CachedIndex {
    entries: Arc<Vec<IndexEntry>>,
    last_used: Instant,
}

#[derive(Default)]
pub struct SearchIndex(Mutex<HashMap<String, CachedIndex>>);

fn build_index(root: &str) -> Vec<IndexEntry> {
    let entries: Arc<Mutex<Vec<IndexEntry>>> = Arc::new(Mutex::new(Vec::with_capacity(8192)));
    let walked = Arc::new(AtomicUsize::new(0));

    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4);

    WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(false)
        .ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            match entry.file_name().to_str() {
                Some(name) => !SKIP_DIRS.contains(&name),
                None => true,
            }
        })
        .threads(threads)
        .build_parallel()
        .run(|| {
            let entries = entries.clone();
            let walked = walked.clone();

            Box::new(move |entry| {
                if walked.fetch_add(1, Ordering::Relaxed) > WALK_LIMIT {
                    return WalkState::Quit;
                }
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => return WalkState::Continue,
                };
                if entry.depth() == 0 {
                    return WalkState::Continue;
                }
                let name = match entry.file_name().to_str() {
                    Some(n) => n.to_string(),
                    None => return WalkState::Continue,
                };
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if let Ok(mut e) = entries.lock() {
                    e.push(IndexEntry {
                        name,
                        path: entry.path().to_string_lossy().into_owned(),
                        is_dir,
                    });
                }
                WalkState::Continue
            })
        });

    Arc::try_unwrap(entries)
        .ok()
        .and_then(|m| m.into_inner().ok())
        .unwrap_or_default()
}

fn get_or_build_index(state: &SearchIndex, root: &str) -> Result<Arc<Vec<IndexEntry>>, String> {
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        // Evict stale entries before lookup.
        map.retain(|_, v| v.last_used.elapsed() < INDEX_TTL);
        if let Some(cached) = map.get_mut(root) {
            cached.last_used = Instant::now();
            return Ok(cached.entries.clone());
        }
    }
    let entries = Arc::new(build_index(root));
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.insert(root.to_string(), CachedIndex { entries: entries.clone(), last_used: Instant::now() });
    Ok(entries)
}

#[tauri::command]
pub fn index_path(state: tauri::State<SearchIndex>, root: String) -> Result<usize, String> {
    let idx = get_or_build_index(&state, &root)?;
    Ok(idx.len())
}

#[tauri::command]
pub fn clear_search_index(state: tauri::State<SearchIndex>) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

#[tauri::command]
pub fn search_files(
    state: tauri::State<SearchIndex>,
    root: String,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    let index = get_or_build_index(&state, &root)?;

    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut matcher = Matcher::new(Config::DEFAULT);
    let mut buf = Vec::new();

    let mut results: Vec<SearchResult> = index
        .iter()
        .filter_map(|e| {
            buf.clear();
            let utf32 = Utf32Str::new(&e.name, &mut buf);
            pattern
                .score(utf32, &mut matcher)
                .map(|score| SearchResult {
                    name: e.name.clone(),
                    path: e.path.clone(),
                    is_dir: e.is_dir,
                    size: 0,
                    modified: 0,
                    extension: None,
                    score,
                })
        })
        .collect();

    results.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.name.len().cmp(&b.name.len()))
    });
    results.truncate(SEARCH_LIMIT);

    // Stat top results only — avoids storing metadata for 250k entries.
    for r in &mut results {
        let p = Path::new(&r.path);
        if let Ok(meta) = std::fs::symlink_metadata(p) {
            r.size = if r.is_dir { 0 } else { meta.len() };
            r.modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
        }
        r.extension = if !r.is_dir {
            p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase())
        } else {
            None
        };
    }

    Ok(results)
}
