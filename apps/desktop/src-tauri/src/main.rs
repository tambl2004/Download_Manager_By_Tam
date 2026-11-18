#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use mydm_engine::Store;
use commands::*;

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let s = Store::user()?;
            let stop = s.start()?;
            app.manage(s);
            app.manage(stop);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list,
            add,
            add_task_advanced,
            update_held_task,
            probe,
            pick_folder,
            action,
            settings,
            save_settings,
            open_folder,
            open_file,
            open_with,
            open_folder_select,
            focus_window,
            confirm_delete_dialog
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("MyDM startup failed: {e}");
    }
}
