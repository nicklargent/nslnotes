mod routes;
mod sse;

use clap::Parser;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Parser)]
#[command(name = "nslnotes-web", about = "NslNotes web server")]
struct Args {
    /// Port to listen on
    #[arg(short, long, env = "NSLNOTES_WEB_PORT", default_value_t = 3000)]
    port: u16,

    /// Notes directory path (overrides settings)
    #[arg(long)]
    notes_dir: Option<String>,

    /// Settings file path
    #[arg(long, default_value_t = default_settings_path())]
    settings_path: String,
}

fn default_settings_path() -> String {
    nslnotes_core::settings::default_path().to_string_lossy().to_string()
}

fn env_file_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nslnotes");
    config_dir.join("web.env")
}

/// Create default env file if it doesn't exist
fn ensure_env_file() {
    let path = env_file_path();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(
            &path,
            "# NslNotes web server configuration\n# Uncomment to change the port:\n# NSLNOTES_WEB_PORT=3000\n",
        );
    }
}

/// Load env vars from the env file
fn load_env_file() {
    let path = env_file_path();
    if let Ok(contents) = std::fs::read_to_string(&path) {
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                if std::env::var(key.trim()).is_err() {
                    std::env::set_var(key.trim(), value.trim());
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    ensure_env_file();
    load_env_file();
    let args = Args::parse();

    let settings_path = PathBuf::from(&args.settings_path);

    // Load settings to display notes dir info
    let settings = nslnotes_core::settings::load_from_path(&settings_path).unwrap_or_default();
    let notes_dir = args
        .notes_dir
        .or(settings.root_path.clone())
        .unwrap_or_else(|| ".".to_string());

    println!("NslNotes web server");
    println!("  Notes dir: {}", notes_dir);
    println!("  Settings:  {}", args.settings_path);
    println!("  Port:      {}", args.port);

    let watcher_state = Arc::new(Mutex::new(nslnotes_core::watcher::WatcherState::default()));
    let broadcast_tx = sse::create_broadcast();

    let app = routes::create_router(settings_path, watcher_state, broadcast_tx);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", args.port))
        .await
        .expect("Failed to bind to port");

    println!("  Listening: http://localhost:{}", args.port);

    axum::serve(listener, app).await.expect("Server error");
}
