use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::{AppHandle, Emitter};

use crate::path_safety::reject_traversal;

pub struct WatcherState {
    inner: Mutex<Option<ActiveWatcher>>,
}

struct ActiveWatcher {
    path: PathBuf,
    // Held for its lifetime — drop stops the watcher.
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    state: tauri::State<WatcherState>,
    path: String,
) -> Result<(), String> {
    let p = Path::new(&path);
    reject_traversal(p)?;
    if !p.is_dir() {
        return Err("La ruta no es un directorio".into());
    }
    let target = p.to_path_buf();

    // Replace any previous watcher — only one active at a time (the current dir).
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;

    let path_for_event = target.to_string_lossy().to_string();
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: DebounceEventResult| {
            if res.is_ok() {
                let _ = app.emit("dir:changed", &path_for_event);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(&target, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(ActiveWatcher {
        path: target,
        _debouncer: debouncer,
    });
    Ok(())
}

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<WatcherState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn current_watch_path(state: tauri::State<WatcherState>) -> Result<Option<String>, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(guard
        .as_ref()
        .map(|w| w.path.to_string_lossy().into_owned()))
}
