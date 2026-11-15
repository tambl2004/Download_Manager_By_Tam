use mydm_engine::{Settings, Store, Task};

#[tauri::command]
pub fn list(s: tauri::State<'_, Store>) -> Result<Vec<Task>, String> {
    mydm_engine::snapshot(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add(s: tauri::State<'_, Store>, url: String, name: String) -> Result<Task, String> {
    s.add(&url, &name, None, false, None, None, "manual")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn action(s: tauri::State<'_, Store>, id: String, action: String) -> Result<(), String> {
    s.action(&id, &action).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings(s: tauri::State<'_, Store>) -> Result<Settings, String> {
    s.settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(s: tauri::State<'_, Store>, value: Settings) -> Result<(), String> {
    s.save_settings(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_folder(s: tauri::State<'_, Store>, id: String) -> Result<(), String> {
    let t = s.get(&id).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer.exe")
        .arg(&t.folder)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
