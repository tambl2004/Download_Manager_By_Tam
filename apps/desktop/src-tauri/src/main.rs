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
            action,
            settings,
            save_settings,
            open_folder
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("MyDM startup failed: {e}");
    }
}
