mod routes;
mod sse;

use clap::Parser;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Parser)]
#[command(name = "nslnotes-web", about = "NslNotes web server")]
struct Args {
    /// Port to listen on (overrides settings.json webPort)
    #[arg(short, long)]
    port: Option<u16>,

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

#[tokio::main]
async fn main() {
    let args = Args::parse();

    let settings_path = PathBuf::from(&args.settings_path);
    let settings = nslnotes_core::settings::load_from_path(&settings_path).unwrap_or_default();

    let port = args.port.or(settings.web_port).unwrap_or(3000);
    let notes_dir = args
        .notes_dir
        .or(settings.root_path.clone())
        .unwrap_or_else(|| ".".to_string());

    println!("NslNotes web server");
    println!("  Notes dir: {}", notes_dir);
    println!("  Settings:  {}", args.settings_path);
    println!("  Port:      {}", port);

    let watcher_state = Arc::new(Mutex::new(nslnotes_core::watcher::WatcherState::default()));
    let broadcast_tx = sse::create_broadcast();

    let app = routes::create_router(settings_path, watcher_state, broadcast_tx);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind to port");

    println!("  Listening: http://localhost:{}", port);

    axum::serve(listener, app).await.expect("Server error");
}
