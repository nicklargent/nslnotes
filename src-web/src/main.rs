mod auth;
mod routes;
mod sse;

use clap::{Parser, Subcommand};
use std::net::SocketAddr;
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

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Generate an argon2id PHC hash for use as NSLNOTES_PASSWORD_HASH.
    HashPassword,
}

fn default_settings_path() -> String {
    nslnotes_core::settings::default_path()
        .to_string_lossy()
        .to_string()
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    if let Some(Command::HashPassword) = args.command {
        run_hash_password();
        return;
    }

    let settings_path = PathBuf::from(&args.settings_path);
    let settings = nslnotes_core::settings::load_from_path(&settings_path).unwrap_or_default();

    let port = args.port.or(settings.web_port).unwrap_or(3000);
    let notes_dir = args
        .notes_dir
        .or(settings.root_path.clone())
        .unwrap_or_else(|| ".".to_string());

    let auth_config = match auth::AuthConfig::from_env() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("nslnotes-web: {e}");
            std::process::exit(1);
        }
    };

    println!("NslNotes web server");
    println!("  Notes dir:   {}", notes_dir);
    println!("  Settings:    {}", args.settings_path);
    println!("  Port:        {}", port);
    println!(
        "  Trust proxy: {}",
        if auth_config.trust_proxy { "yes" } else { "no" }
    );
    if auth_config.disabled {
        println!("  Auth:        DISABLED (NSLNOTES_DISABLE_AUTH=1)");
        eprintln!(
            "WARNING: authentication is disabled. Do NOT expose this port beyond localhost."
        );
    } else {
        println!("  Auth:        enabled");
    }

    let watcher_state = Arc::new(Mutex::new(nslnotes_core::watcher::WatcherState::default()));
    let broadcast_tx = sse::create_broadcast();

    let app = routes::create_router(settings_path, watcher_state, broadcast_tx, auth_config);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind to port");

    println!("  Listening:   http://localhost:{}", port);

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("Server error");
}

fn prompt(label: &str) -> String {
    match rpassword::prompt_password(label) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to read password: {e}");
            std::process::exit(1);
        }
    }
}

fn run_hash_password() {
    use std::io::IsTerminal;
    let password = if std::io::stdin().is_terminal() {
        let p = prompt("Password: ");
        if p.is_empty() {
            eprintln!("Password cannot be empty.");
            std::process::exit(1);
        }
        if p != prompt("Confirm:  ") {
            eprintln!("Passwords do not match.");
            std::process::exit(1);
        }
        p
    } else {
        let mut buf = String::new();
        if let Err(e) = std::io::stdin().read_line(&mut buf) {
            eprintln!("Failed to read password from stdin: {e}");
            std::process::exit(1);
        }
        let p = buf.trim_end_matches(['\r', '\n']).to_string();
        if p.is_empty() {
            eprintln!("Password cannot be empty.");
            std::process::exit(1);
        }
        p
    };

    match auth::hash_password(&password) {
        Ok(hash) => {
            if std::io::stdin().is_terminal() {
                println!();
                println!("Set this environment variable:");
                println!();
                println!("  NSLNOTES_PASSWORD_HASH='{}'", hash);
            } else {
                // Print only the hash so callers can capture it directly.
                println!("{hash}");
            }
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
