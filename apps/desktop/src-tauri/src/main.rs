#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use mydm_engine::{Settings, Store, Task};
#[tauri::command]
fn list(s: tauri::State<'_, Store>) -> Result<Vec<Task>, String> {
    mydm_engine::snapshot(&s).map_err(|e| e.to_string())
}
#[tauri::command]
fn add(s: tauri::State<'_, Store>, url: String, name: String) -> Result<Task, String> {
    s.add(&url, &name, None, false, None, None, "manual")
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn action(s: tauri::State<'_, Store>, id: String, action: String) -> Result<(), String> {
    s.action(&id, &action).map_err(|e| e.to_string())
}
#[tauri::command]
fn settings(s: tauri::State<'_, Store>) -> Result<Settings, String> {
    s.settings().map_err(|e| e.to_string())
}
#[tauri::command]
fn save_settings(s: tauri::State<'_, Store>, value: Settings) -> Result<(), String> {
    s.save_settings(value).map_err(|e| e.to_string())
}
#[tauri::command]
fn open_folder(s: tauri::State<'_, Store>, id: String) -> Result<(), String> {
    let t = s.get(&id).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer.exe")
        .arg(&t.folder)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
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
