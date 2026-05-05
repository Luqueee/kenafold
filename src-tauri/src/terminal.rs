use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::path_safety::reject_traversal;

#[derive(Serialize, Clone)]
pub struct TerminalInfo {
    pub id: String,
    pub name: String,
}

#[cfg(target_os = "macos")]
fn macos_app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(format!("{}/Applications", home)));
    }
    dirs
}

/// Lowercased names of all `.app` bundles found in standard macOS app dirs.
/// Single scan — much faster than stat'ing each candidate path individually.
#[cfg(target_os = "macos")]
fn list_installed_app_names_macos() -> Vec<String> {
    let mut out = Vec::new();
    for dir in macos_app_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if let Some(stem) = name.strip_suffix(".app") {
                out.push(stem.to_lowercase());
            }
        }
    }
    out
}

fn detect_bin(bin: &str) -> bool {
    std::process::Command::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn list_terminals() -> Vec<TerminalInfo> {
    let mut out = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // Known terminal emulators on macOS, with case-insensitive aliases for
        // the .app bundle name (iTerm ships as either "iTerm.app" or "iTerm2.app",
        // Wave as "Wave.app" or "Wave Terminal.app", etc.).
        let known: &[(&str, &[&str], &str)] = &[
            ("terminal", &["terminal"], "Terminal"),
            ("iterm", &["iterm", "iterm2"], "iTerm"),
            ("warp", &["warp"], "Warp"),
            ("ghostty", &["ghostty"], "Ghostty"),
            ("hyper", &["hyper"], "Hyper"),
            ("tabby", &["tabby"], "Tabby"),
            ("wezterm", &["wezterm"], "WezTerm"),
            ("alacritty", &["alacritty"], "Alacritty"),
            ("kitty", &["kitty"], "kitty"),
            ("wave", &["wave", "wave terminal"], "Wave"),
            ("blackbox", &["black box", "blackbox"], "Black Box"),
        ];

        let installed = list_installed_app_names_macos();
        for (id, aliases, label) in known {
            if aliases.iter().any(|alias| installed.iter().any(|i| i == alias)) {
                out.push(TerminalInfo {
                    id: (*id).to_string(),
                    name: (*label).to_string(),
                });
            }
        }

        // CLI-only fallbacks (Homebrew installs without a .app bundle).
        for (id, label) in [
            ("alacritty", "Alacritty"),
            ("kitty", "kitty"),
            ("wezterm", "WezTerm"),
            ("ghostty", "Ghostty"),
        ] {
            if !out.iter().any(|t| t.id == id) && detect_bin(id) {
                out.push(TerminalInfo {
                    id: id.into(),
                    name: label.into(),
                });
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let bins = [
            ("gnome-terminal", "GNOME Terminal"),
            ("konsole", "Konsole"),
            ("xfce4-terminal", "XFCE Terminal"),
            ("alacritty", "Alacritty"),
            ("kitty", "kitty"),
            ("wezterm", "WezTerm"),
            ("ghostty", "Ghostty"),
            ("tabby", "Tabby"),
            ("wave", "Wave"),
            ("xterm", "xterm"),
            ("x-terminal-emulator", "Default"),
        ];
        for (bin, label) in bins {
            if out.iter().any(|t| t.id == bin) {
                continue;
            }
            if detect_bin(bin) {
                out.push(TerminalInfo {
                    id: bin.into(),
                    name: label.into(),
                });
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        out.push(TerminalInfo {
            id: "cmd".into(),
            name: "Command Prompt".into(),
        });
        if detect_bin("pwsh") {
            out.push(TerminalInfo {
                id: "pwsh".into(),
                name: "PowerShell".into(),
            });
        }
        if detect_bin("wt") {
            out.push(TerminalInfo {
                id: "wt".into(),
                name: "Windows Terminal".into(),
            });
        }
    }

    out
}

#[cfg(target_os = "macos")]
fn launch_macos_terminal(id: &str, path: &str) -> Result<(), String> {
    use std::process::Command;
    let map = [
        ("terminal", "Terminal"),
        ("iterm", "iTerm"),
        ("warp", "Warp"),
        ("ghostty", "Ghostty"),
        ("hyper", "Hyper"),
        ("tabby", "Tabby"),
        ("wezterm", "WezTerm"),
        ("alacritty", "Alacritty"),
        ("kitty", "Kitty"),
        ("wave", "Wave"),
    ];
    if let Some(&(_, app)) = map.iter().find(|(k, _)| *k == id) {
        return Command::new("open")
            .args(["-a", app, path])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    if id == "alacritty" {
        return Command::new("alacritty")
            .args(["--working-directory", path])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    if id == "kitty" {
        return Command::new("kitty")
            .arg("--directory")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    Err(format!("Unknown terminal: {}", id))
}

#[tauri::command]
pub fn open_terminal(path: String, terminal_id: Option<String>) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err("Ruta inválida".into());
    }

    #[cfg(target_os = "macos")]
    {
        let id = terminal_id.unwrap_or_else(|| "terminal".to_string());
        launch_macos_terminal(&id, &path)
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let id = terminal_id.unwrap_or_else(|| "x-terminal-emulator".to_string());
        if Command::new(&id)
            .arg("--working-directory")
            .arg(&path)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        Command::new(&id)
            .current_dir(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let id = terminal_id.unwrap_or_else(|| "cmd".to_string());
        match id.as_str() {
            "wt" => Command::new("wt")
                .args(["-d", &path])
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string()),
            // -WorkingDirectory takes the path as an isolated argument; no shell parsing.
            "pwsh" => Command::new("pwsh")
                .args(["-NoExit", "-WorkingDirectory", &path])
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string()),
            // current_dir() avoids interpolating `path` into a `cd` string, blocking & | && injection.
            _ => Command::new("cmd")
                .args(["/C", "start", "cmd", "/K"])
                .current_dir(&path)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    /// The script was launched directly in the chosen terminal.
    Direct,
    /// Terminal doesn't support passing a command; the bash invocation was
    /// copied to the system clipboard and the terminal opened in cwd. The
    /// user is expected to paste + Enter.
    FallbackClipboard,
}

#[cfg(target_os = "macos")]
fn shell_quote(s: &str) -> String {
    // POSIX-safe single-quote: ' → '\''
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(target_os = "macos")]
fn write_clipboard(text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut child = std::process::Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

/// Run a shell script inside the chosen terminal emulator.
/// Different terminals expose different mechanisms; we try the most direct one
/// per terminal and fall back to clipboard-copy when not supported.
#[tauri::command]
pub fn run_in_terminal(
    script_path: String,
    terminal_id: Option<String>,
) -> Result<RunOutcome, String> {
    let path = Path::new(&script_path);
    reject_traversal(path)?;
    if !path.is_file() {
        return Err("El archivo no existe".into());
    }
    let cwd = path
        .parent()
        .ok_or("Sin directorio padre")?
        .to_string_lossy()
        .into_owned();

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let id = terminal_id.unwrap_or_else(|| "terminal".to_string());
        let quoted = shell_quote(&script_path);
        let cmd = format!("bash {}", quoted);

        // Direct-run terminals (pass the script via -e / shell-style flag).
        match id.as_str() {
            "terminal" => {
                // Terminal.app handles `open -a Terminal <script>` natively if the
                // script is executable. Otherwise wrap with bash.
                Command::new("osascript")
                    .args([
                        "-e",
                        &format!(
                            r#"tell application "Terminal" to do script "{}""#,
                            cmd.replace('"', "\\\"")
                        ),
                    ])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            "iterm" => {
                let script = format!(
                    r#"tell application "iTerm"
                        activate
                        create window with default profile
                        tell current session of current window to write text "{}"
                    end tell"#,
                    cmd.replace('"', "\\\"")
                );
                Command::new("osascript")
                    .args(["-e", &script])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            "ghostty" => {
                Command::new("ghostty")
                    .args(["-e", "bash", &script_path])
                    .current_dir(&cwd)
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            "alacritty" => {
                Command::new("alacritty")
                    .args(["--working-directory", &cwd, "-e", "bash", &script_path])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            "kitty" => {
                Command::new("kitty")
                    .args(["--directory", &cwd, "bash", &script_path])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            "wezterm" => {
                Command::new("wezterm")
                    .args(["start", "--cwd", &cwd, "--", "bash", &script_path])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                return Ok(RunOutcome::Direct);
            }
            _ => {
                // Warp / Hyper / Tabby / unknown: clipboard fallback.
                write_clipboard(&cmd)?;
                launch_macos_terminal(&id, &cwd)?;
                return Ok(RunOutcome::FallbackClipboard);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let id = terminal_id.unwrap_or_else(|| "x-terminal-emulator".to_string());
        // Most Linux terminal emulators accept `-e` for the command to run.
        let result = Command::new(&id)
            .args(["--working-directory", &cwd, "-e", "bash", &script_path])
            .spawn();
        if result.is_ok() {
            return Ok(RunOutcome::Direct);
        }
        // Fallback: -e without working-directory flag.
        Command::new(&id)
            .args(["-e", "bash", &script_path])
            .current_dir(&cwd)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())?;
        Ok(RunOutcome::Direct)
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let id = terminal_id.unwrap_or_else(|| "cmd".to_string());
        match id.as_str() {
            "wt" => {
                Command::new("wt")
                    .args(["-d", &cwd, "cmd", "/K", &script_path])
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                Ok(RunOutcome::Direct)
            }
            "pwsh" => {
                Command::new("pwsh")
                    .args(["-NoExit", "-File", &script_path])
                    .current_dir(&cwd)
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                Ok(RunOutcome::Direct)
            }
            _ => {
                Command::new("cmd")
                    .args(["/C", "start", "cmd", "/K", &script_path])
                    .current_dir(&cwd)
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| e.to_string())?;
                Ok(RunOutcome::Direct)
            }
        }
    }
}
