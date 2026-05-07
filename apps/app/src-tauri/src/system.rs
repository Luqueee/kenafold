use std::sync::Mutex;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct MemoryUsage {
    pub rss: u64,
    pub total: u64,
}

pub struct SysState(Mutex<sysinfo::System>);

impl Default for SysState {
    fn default() -> Self {
        use sysinfo::{MemoryRefreshKind, RefreshKind};
        let sys = sysinfo::System::new_with_specifics(
            RefreshKind::new().with_memory(MemoryRefreshKind::everything()),
        );
        Self(Mutex::new(sys))
    }
}

#[tauri::command]
pub fn get_memory_usage(state: tauri::State<SysState>) -> Result<MemoryUsage, String> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate};
    let mut sys = state.0.lock().map_err(|e| e.to_string())?;
    sys.refresh_memory();
    let pid = Pid::from_u32(std::process::id());
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::new().with_memory(),
    );
    let rss = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    Ok(MemoryUsage {
        rss,
        total: sys.total_memory(),
    })
}
