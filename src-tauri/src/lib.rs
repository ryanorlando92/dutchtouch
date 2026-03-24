use tauri::Manager;

// --- MICRO-LESSON: RUST BASICS ---
// `#[tauri::command]` is a macro. It automatically generates the background boilerplate 
// required to make this Rust function callable from your JavaScript frontend.
// `app: tauri::AppHandle` is automatically injected by Tauri and acts as the "master controller" for your app's state.
// `Result<(), String>` tells Rust this function will either return nothing `()` on success, 
// or a `String` containing an error message on failure.
#[tauri::command]
fn inject_dutchie_js(app: tauri::AppHandle, script: String) -> Result<(), String> {
    
    // `get_webview_window` searches for the webview we labeled "dutchie" in JavaScript.
    // `if let Some(...)` is Rust's safe way of handling things that might be null/missing. 
    // It prevents your app from crashing if the window was closed.
    if let Some(webview) = app.get_webview_window("dutchie") {
        
        // `.eval()` forces the webview to execute the raw string as JavaScript.
        // `.map_err(|e| e.to_string())?` catches any internal Tauri errors and safely passes them back to JS.
        webview.eval(&script).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Dutchie window not found".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // We must initialize the plugin we installed via npm
        .plugin(tauri_plugin_global_shortcut::Builder::new().build()) 
        // We tell Tauri to listen for our custom JS-to-Rust command
        .invoke_handler(tauri::generate_handler![inject_dutchie_js])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}