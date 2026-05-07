use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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
    // Set to true before replacing so stale debounce callbacks are silenced.
    cancelled: Arc<AtomicBool>,
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

    // Build the debouncer outside the lock — OS calls shouldn't block other callers.
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_cb = Arc::clone(&cancelled);
    let path_for_event = target.to_string_lossy().to_string();

    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: DebounceEventResult| {
            // Guard against stale callbacks that fire after the watcher was replaced.
            if cancelled_cb.load(Ordering::Relaxed) {
                return;
            }
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

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    // Cancel the previous watcher's callback before dropping it so any
    // already-queued debounce timer can't emit for the old directory.
    if let Some(old) = guard.as_ref() {
        old.cancelled.store(true, Ordering::SeqCst);
    }
    *guard = Some(ActiveWatcher {
        path: target,
        cancelled,
        _debouncer: debouncer,
    });
    Ok(())
}

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<WatcherState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(old) = guard.as_ref() {
        old.cancelled.store(true, Ordering::SeqCst);
    }
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
