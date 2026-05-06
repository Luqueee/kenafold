use std::path::PathBuf;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

mod archive;
mod comparator;
mod fs;
mod grep;
mod hash;
mod path_safety;
mod preview;
mod search;
mod smb;
mod system;
mod tags;
mod terminal;
mod watcher;

fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal_host = matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
            );

            let is_internal = url.scheme() == "tauri" || is_internal_host;

            if is_internal {
                return true;
            }

            let is_external_link = matches!(url.scheme(), "http" | "https" | "mailto" | "tel");

            if is_external_link {
                log::info!("opening external link in system browser: {}", url);
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }

            true
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(external_navigation_plugin())
        .setup(|app| {
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Kenafold")
                .inner_size(1400.0, 700.0)
                .center()
                .visible(false)
                .hidden_title(true);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder.title_bar_style(TitleBarStyle::Transparent);

            let window = win_builder.build().unwrap();

            let smb_path: PathBuf = app
                .path()
                .app_config_dir()
                .map(|d| d.join("smb.json"))
                .unwrap_or_else(|_| PathBuf::from("smb.json"));
            let smb_state = smb::SmbState::new(smb_path);
            let auto_mounts: Vec<smb::SmbShare> = smb_state
                .config
                .lock()
                .map(|c| c.shares.iter().filter(|s| s.auto_mount).cloned().collect())
                .unwrap_or_default();
            std::thread::spawn(move || {
                for share in auto_mounts {
                    if smb::mount_point_for(&share).exists() {
                        continue;
                    }
                    if let Err(e) = smb::run_mount(&share) {
                        log::warn!("auto-mount {} failed: {}", share.name, e);
                    }
                }
            });
            app.manage(smb_state);

            let tags_db_path = app
                .path()
                .app_data_dir()
                .map(|d| {
                    let _ = std::fs::create_dir_all(&d);
                    d.join("tags.db")
                })
                .unwrap_or_else(|_| std::path::PathBuf::from("tags.db"));
            let tags_db = tags::TagsDb::open(&tags_db_path)
                .expect("failed to open tags DB");
            app.manage(tags_db);

            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSColor, NSWindow};

                let ns_window_ptr = window.ns_window().unwrap() as *mut NSWindow;
                unsafe {
                    let ns_window: &NSWindow = &*ns_window_ptr;
                    let bg_color = NSColor::colorWithRed_green_blue_alpha(
                        10.0 / 255.0,
                        16.0 / 255.0,
                        14.0 / 255.0,
                        1.0,
                    );
                    ns_window.setBackgroundColor(Some(&bg_color));
                }
            }

            Ok(())
        })
        .manage(archive::CancelMap::new())
        .manage(search::SearchIndex::default())
        .manage(system::SysState::default())
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            fs::list_directory,
            fs::disk_usage,
            fs::get_home_dir,
            fs::open_file,
            fs::reveal_in_file_manager,
            fs::duplicate_entry,
            fs::create_dir,
            fs::create_file,
            fs::rename_entry,
            fs::rename_and_list,
            fs::rename_entries,
            fs::delete_entry,
            fs::delete_entries,
            fs::copy_entry,
            fs::move_entry,
            archive::compress_entries,
            archive::decompress_entry,
            archive::cancel_archive,
            archive::list_archive_entries,
            preview::preview_file,
            grep::grep_content,
            search::search_files,
            search::index_path,
            search::clear_search_index,
            terminal::open_terminal,
            terminal::list_terminals,
            terminal::run_in_terminal,
            system::get_memory_usage,
            smb::smb_list,
            smb::smb_save,
            smb::smb_delete,
            smb::smb_mount,
            smb::smb_unmount,
            smb::smb_is_mounted,
            tags::tags_get,
            tags::tags_set,
            tags::tags_remove,
            tags::tags_get_all,
            tags::tags_get_by_tag,
            tags::tags_get_entries_by_tag,
            watcher::watch_directory,
            watcher::unwatch_directory,
            watcher::current_watch_path,
            hash::compute_file_hashes,
            comparator::compare_directories
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                let _ = webview.window().show();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
