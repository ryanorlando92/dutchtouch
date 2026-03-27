use tauri::Manager;

// --- MICRO-LESSON: RUST BASICS ---
// `#[tauri::command]` is a macro. It automatically generates the background boilerplate
// required to make this Rust function callable from your JavaScript frontend.
// `app: tauri::AppHandle` is automatically injected by Tauri and acts as the "master controller" for your app's state.
// `Result<(), String>` tells Rust this function will either return nothing `()` on success,
// or a `String` containing an error message on failure.

// --- MICRO-LESSON: ENVIRONMENT VARIABLES ---
// `std::env::var` allows Rust to read system-level variables.
// Windows stores the logged-in user under "USERNAME", while Linux/macOS use "USER".
// `.unwrap_or_else` provides a safe fallback string just in case the OS refuses to answer,
// preventing your app from crashing.
#[tauri::command]
fn get_os_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "dutch_touch_default".to_string())
}

#[tauri::command]
fn inject_js(app: tauri::AppHandle, window_label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&window_label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Window '{}' not found", window_label))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![inject_js, get_os_username])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: window_event,
                ..
            } = event
            {
                if label == "main" {
                    if let tauri::WindowEvent::Destroyed = window_event {
                        println!("Main window closed. Executing total application shutdown.");
                        app_handle.exit(0);
                    }
                }
            }
        });
}
