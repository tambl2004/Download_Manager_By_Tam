use mydm_engine::{ProbeResult, Settings, Store, Task};

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
pub fn add_task_advanced(
    s: tauri::State<'_, Store>,
    url: String,
    name: String,
    hold: bool,
    folder: Option<String>,
    category: Option<String>,
    total: Option<u64>,
) -> Result<Task, String> {
    s.add_with_options(
        &url,
        &name,
        folder.as_deref(),
        hold,
        category.as_deref(),
        total,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_held_task(
    s: tauri::State<'_, Store>,
    id: String,
    name: Option<String>,
    folder: Option<String>,
    category: Option<String>,
    total: Option<u64>,
    start_now: bool,
) -> Result<Task, String> {
    let t = s
        .update_held_task(
            &id,
            name.as_deref(),
            folder.as_deref(),
            category.as_deref(),
            total,
        )
        .map_err(|e| e.to_string())?;
    if start_now {
        s.action(&id, "resume").map_err(|e| e.to_string())?;
    }
    Ok(t)
}

#[tauri::command]
pub fn probe(url: String) -> Result<ProbeResult, String> {
    mydm_engine::probe_url(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pick_folder() -> Result<Option<String>, String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Chọn thư mục tải xuống'; if ($f.ShowDialog() -eq 'OK') { [Console]::Write($f.SelectedPath) }",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}

#[tauri::command]
pub fn confirm_delete_dialog(_name: String) -> Result<String, String> {
    let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "Xác nhận xóa mục tải xuống"
        $form.Size = New-Object System.Drawing.Size(440, 195)
        $form.StartPosition = "CenterScreen"
        $form.FormBorderStyle = "FixedDialog"
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false
        $form.TopMost = $true
        $form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = "Bạn chắc chắn muốn xóa các mục được chọn trong danh sách tải xuống của MyDM?"
        $lbl.Location = New-Object System.Drawing.Point(14, 14)
        $lbl.Size = New-Object System.Drawing.Size(400, 34)
        $form.Controls.Add($lbl)

        $cbDeleteFile = New-Object System.Windows.Forms.CheckBox
        $cbDeleteFile.Text = "Xóa cả những tệp tin đã tải xuống hoàn tất trên ổ đĩa cứng. Hãy chú ý!"
        $cbDeleteFile.Location = New-Object System.Drawing.Point(18, 52)
        $cbDeleteFile.Size = New-Object System.Drawing.Size(400, 22)
        $cbDeleteFile.Checked = $false
        $form.Controls.Add($cbDeleteFile)

        $cbDontShow = New-Object System.Windows.Forms.CheckBox
        $cbDontShow.Text = "Không hiện hộp thoại này nữa"
        $cbDontShow.Location = New-Object System.Drawing.Point(18, 78)
        $cbDontShow.Size = New-Object System.Drawing.Size(400, 22)
        $cbDontShow.Checked = $false
        $form.Controls.Add($cbDontShow)

        $btnYes = New-Object System.Windows.Forms.Button
        $btnYes.Text = "Có"
        $btnYes.Location = New-Object System.Drawing.Point(125, 116)
        $btnYes.Size = New-Object System.Drawing.Size(80, 26)
        $btnYes.DialogResult = [System.Windows.Forms.DialogResult]::Yes
        $form.Controls.Add($btnYes)
        $form.AcceptButton = $btnYes

        $btnNo = New-Object System.Windows.Forms.Button
        $btnNo.Text = "Không"
        $btnNo.Location = New-Object System.Drawing.Point(215, 116)
        $btnNo.Size = New-Object System.Drawing.Size(80, 26)
        $btnNo.DialogResult = [System.Windows.Forms.DialogResult]::No
        $form.Controls.Add($btnNo)
        $form.CancelButton = $btnNo

        $res = $form.ShowDialog()
        if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
            if ($cbDeleteFile.Checked) {
                [Console]::Write("DELETE_FILE")
            } else {
                [Console]::Write("DELETE_ONLY")
            }
        } else {
            [Console]::Write("CANCEL")
        }
    "#;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;

    let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(res)
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

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_with(path: String) -> Result<(), String> {
    std::process::Command::new("rundll32.exe")
        .args(["shell32.dll,OpenAs_RunDLL", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn focus_window(window: tauri::Window) -> Result<(), String> {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn open_folder_select(path: String) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
