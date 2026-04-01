use tauri::Manager;

#[tauri::command]
fn get_os_username() -> Result<String, String> {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .or_else(|_| Ok("dutch_touch_default".to_string()))
}

#[tauri::command]
fn inject_js(app: tauri::AppHandle, window_label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&window_label) {
        webview.eval(&script).map_err(|e| format!("JavaScript Evaluation Error: {}", e))?;
        Ok(())
    } else {
        Err(format!("Target window '{}' not found in AppHandle", window_label))
    }
}

#[tauri::command]
fn get_hardware_key() -> Result<String, String> {
    machine_uid::get().map_err(|_| "Failed to fetch Hardware UUID".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![inject_js, get_hardware_key, get_os_username])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: window_event,
                ..
            } = event
            {
                if label == "main" {
                    if let tauri::WindowEvent::Destroyed = window_event {
                        println!("Front-End is supposed to handle shutdown.");
                    }
                }
            }
        });
}