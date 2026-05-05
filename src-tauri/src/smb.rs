use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

const KEYCHAIN_SERVICE: &str = "arbor.smb";

#[derive(Serialize, Deserialize, Clone)]
pub struct SmbShare {
    pub id: String,
    pub name: String,
    pub host: String,
    pub share: String,
    pub username: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub auto_mount: bool,
}

#[derive(Default, Serialize, Deserialize)]
pub struct SmbConfig {
    pub shares: Vec<SmbShare>,
}

pub struct SmbState {
    pub config_path: PathBuf,
    pub config: Mutex<SmbConfig>,
}

impl SmbState {
    pub fn new(config_path: PathBuf) -> Self {
        let config = std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|s| serde_json::from_str::<SmbConfig>(&s).ok())
            .unwrap_or_default();
        Self {
            config_path,
            config: Mutex::new(config),
        }
    }

    fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let cfg = self.config.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*cfg).map_err(|e| e.to_string())?;
        std::fs::write(&self.config_path, json).map_err(|e| e.to_string())
    }
}

fn keychain_account(share_id: &str) -> String {
    format!("share:{}", share_id)
}

fn store_password(share_id: &str, password: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &keychain_account(share_id))
        .map_err(|e| e.to_string())?;
    entry.set_password(password).map_err(|e| e.to_string())
}

fn get_password(share_id: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &keychain_account(share_id))
        .map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

fn delete_password(share_id: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, &keychain_account(share_id)) {
        let _ = entry.delete_credential();
    }
}

fn pct(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

pub fn mount_point_for(share: &SmbShare) -> PathBuf {
    PathBuf::from(format!("/Volumes/{}", share.share))
}

fn build_smb_url(share: &SmbShare, password: &str) -> String {
    let user = if let Some(domain) = share.domain.as_ref().filter(|d| !d.is_empty()) {
        format!("{};{}", pct(domain), pct(&share.username))
    } else {
        pct(&share.username)
    };
    format!(
        "smb://{}:{}@{}/{}",
        user,
        pct(password),
        share.host,
        pct(&share.share)
    )
}

/// Strip user:password from any smb:// URL that osascript may echo back.
/// `smb://user:secret@host/share` → `smb://host/share`.
fn redact_smb(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"smb://") {
            out.push_str("smb://");
            i += 6;
            // Find the next '@' before whitespace/quote/end; if found, skip credentials.
            let rest = &input[i..];
            let end = rest
                .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
                .unwrap_or(rest.len());
            if let Some(at) = rest[..end].find('@') {
                i += at + 1;
            }
        } else {
            // Push one char and advance; safe for UTF-8.
            let ch = input[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

pub fn run_mount(share: &SmbShare) -> Result<String, String> {
    let password = get_password(&share.id)
        .map_err(|e| format!("No hay contraseña en keychain ({})", e))?;
    let url = build_smb_url(share, &password);
    let script = format!(r#"mount volume "{}""#, url.replace('"', "\\\""));
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(redact_smb(err.trim()));
    }
    Ok(mount_point_for(share).to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_strips_credentials() {
        let input = "mount failed: smb://alice:hunter2@host.local/share permission denied";
        let out = redact_smb(input);
        assert!(!out.contains("alice"));
        assert!(!out.contains("hunter2"));
        assert!(out.contains("smb://host.local/share"));
    }

    #[test]
    fn redact_preserves_text_without_smb() {
        let input = "generic error message";
        assert_eq!(redact_smb(input), input);
    }

    #[test]
    fn redact_handles_url_at_end() {
        let input = "url: smb://u:p@host/s";
        let out = redact_smb(input);
        assert_eq!(out, "url: smb://host/s");
    }
}

#[tauri::command]
pub fn smb_list(state: tauri::State<SmbState>) -> Result<Vec<SmbShare>, String> {
    Ok(state
        .config
        .lock()
        .map_err(|e| e.to_string())?
        .shares
        .clone())
}

#[tauri::command]
pub fn smb_save(
    state: tauri::State<SmbState>,
    share: SmbShare,
    password: Option<String>,
) -> Result<SmbShare, String> {
    {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = cfg.shares.iter_mut().find(|s| s.id == share.id) {
            *existing = share.clone();
        } else {
            cfg.shares.push(share.clone());
        }
    }
    state.save()?;
    if let Some(pw) = password {
        if !pw.is_empty() {
            store_password(&share.id, &pw)?;
        }
    }
    Ok(share)
}

#[tauri::command]
pub fn smb_delete(state: tauri::State<SmbState>, id: String) -> Result<(), String> {
    let share = {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        let pos = cfg.shares.iter().position(|s| s.id == id);
        pos.map(|i| cfg.shares.remove(i))
    };
    state.save()?;
    if let Some(s) = share {
        let mp = mount_point_for(&s);
        if mp.exists() {
            let _ = Command::new("diskutil")
                .args(["unmount", "force", &mp.to_string_lossy()])
                .output();
        }
    }
    delete_password(&id);
    Ok(())
}

fn find_share(state: &SmbState, id: &str) -> Result<SmbShare, String> {
    let cfg = state.config.lock().map_err(|e| e.to_string())?;
    cfg.shares
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| "Share no encontrado".to_string())
}

#[tauri::command]
pub fn smb_mount(state: tauri::State<SmbState>, id: String) -> Result<String, String> {
    let share = find_share(&state, &id)?;
    if mount_point_for(&share).exists() {
        return Ok(mount_point_for(&share).to_string_lossy().into_owned());
    }
    run_mount(&share)
}

#[tauri::command]
pub fn smb_unmount(state: tauri::State<SmbState>, id: String) -> Result<(), String> {
    let share = find_share(&state, &id)?;
    let mp = mount_point_for(&share);
    if !mp.exists() {
        return Ok(());
    }
    let output = Command::new("diskutil")
        .args(["unmount", &mp.to_string_lossy()])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(redact_smb(
            String::from_utf8_lossy(&output.stderr).trim(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn smb_is_mounted(state: tauri::State<SmbState>, id: String) -> Result<bool, String> {
    let share = find_share(&state, &id)?;
    Ok(mount_point_for(&share).exists())
}
