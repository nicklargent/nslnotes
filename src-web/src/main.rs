mod auth;
mod routes;
mod session_store;
mod sse;

use clap::{Parser, Subcommand};
use nslnotes_core::settings::AppSettings;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Parser)]
#[command(name = "nslnotes-web", about = "NslNotes web server")]
struct Args {
    /// Port to listen on (overrides settings.json webPort)
    #[arg(short, long)]
    port: Option<u16>,

    /// Bootstrap path: when settings.json has no notebooks yet, a single
    /// notebook with this path is created (local paths only; SMB notebooks
    /// need credentials and must be added via the UI).
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

fn timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn default_notebook_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .find(|s| !s.is_empty())
        .filter(|s| !s.ends_with(':'))
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Notes".to_string())
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    if let Some(Command::HashPassword) = args.command {
        run_hash_password();
        return;
    }

    let settings_path = PathBuf::from(&args.settings_path);
    let mut settings = nslnotes_core::settings::load_from_path(&settings_path).unwrap_or_default();

    let port = args.port.or(settings.web_port).unwrap_or(3000);

    // Bootstrap: if --notes-dir is supplied and settings has no notebooks,
    // seed one. SMB notebooks need credentials, so this only covers local
    // paths; SMB notebooks are added via the UI.
    if let Some(dir) = args.notes_dir.as_deref() {
        if !dir.is_empty() && dir != "." && settings.notebooks.is_empty() && !nslnotes_core::smb_url::is_smb_url(dir) {
            let name = default_notebook_name(dir);
            let id = format!("nb-{}", timestamp_secs());
            settings.notebooks.push(nslnotes_core::settings::Notebook {
                id: id.clone(),
                name,
                path: dir.to_string(),
                ..Default::default()
            });
            settings.active_notebook_id = Some(id);
            settings.root_path = Some(dir.to_string());
            if let Err(e) = nslnotes_core::settings::save_to_path(&settings_path, &settings) {
                eprintln!("nslnotes-web: failed to seed settings.json: {e}");
            }
        }
    }

    let auth_config = match auth::AuthConfig::from_env(settings_path.clone()) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("nslnotes-web: {e}");
            std::process::exit(1);
        }
    };

    // SMB backend registration is deferred until login — credentials in
    // settings.json are encrypted with a key derived from the login password,
    // which isn't available at boot. The one exception is disabled-auth mode,
    // where we accept legacy plaintext credentials for local dev use.
    if auth_config.disabled {
        reconcile_smb_backends(&settings, None);
    }

    println!("NslNotes web server");
    println!("  Settings:    {}", args.settings_path);
    println!("  Notebooks:   {}", notebook_summary(&settings));
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

/// Flush the SMB backend registry and re-register one entry per SMB notebook
/// in `settings`. When `kek` is `Some`, `smb_password_enc` fields are
/// decrypted; plaintext `smb_password` entries are used as a fallback so
/// legacy settings files still work until the next save migrates them.
/// When `kek` is `None` (disabled-auth mode, or before login), only plaintext
/// credentials are honored and encrypted entries are skipped with a warning.
///
/// Notebooks pointing at the same `(host, share)` with the same user share
/// one backend instead of being registered twice — the registry is keyed on
/// `(host, share)`, so a second `register_smb` would just overwrite the first
/// while spinning up a redundant libsmbclient session.
pub fn reconcile_smb_backends(
    settings: &AppSettings,
    kek: Option<nslnotes_core::crypto::Kek>,
) {
    nslnotes_core::fs::registry().clear_smb();
    let mut seen: std::collections::HashSet<(String, String, String, String)> =
        std::collections::HashSet::new();
    for nb in &settings.notebooks {
        if !nslnotes_core::smb_url::is_smb_url(&nb.path) {
            continue;
        }
        let cred = match smb_credential_from_notebook(nb, kek.as_ref()) {
            Ok(c) => c,
            Err(e) => {
                eprintln!(
                    "nslnotes-web: skipping SMB notebook '{}' ({}): {e}",
                    nb.name, nb.path
                );
                continue;
            }
        };
        let dedupe_key = (
            cred.host.clone(),
            cred.share.clone(),
            cred.username.clone(),
            cred.domain.clone(),
        );
        if !seen.insert(dedupe_key) {
            continue;
        }
        if let Err(e) = nslnotes_core::fs::registry().register_smb(cred) {
            eprintln!(
                "nslnotes-web: failed to register SMB notebook '{}' ({}): {e}",
                nb.name, nb.path
            );
        }
    }
}

/// Called from the login handler once the KEK is available. Re-reads the
/// settings file fresh (in case the admin edited it) and, if any notebook
/// still has a plaintext `smbPassword`, re-saves it encrypted before
/// registering backends — opportunistic migration of legacy entries.
pub fn reconcile_after_login(settings_path: &std::path::Path) {
    let Some(kek) = auth::current_kek() else {
        return;
    };
    let mut settings =
        nslnotes_core::settings::load_from_path(settings_path).unwrap_or_default();

    let mut mutated = false;
    for nb in &mut settings.notebooks {
        if !nslnotes_core::smb_url::is_smb_url(&nb.path) {
            continue;
        }
        if let Some(plain) = nb.smb_password.take() {
            if !plain.is_empty() {
                match nslnotes_core::crypto::encrypt_str(&kek, &plain) {
                    Ok(enc) => {
                        nb.smb_password_enc = Some(enc);
                        mutated = true;
                    }
                    Err(e) => {
                        eprintln!(
                            "nslnotes-web: failed to encrypt creds for '{}': {e}",
                            nb.name
                        );
                        // Put plaintext back so we don't lose it silently.
                        nb.smb_password = Some(plain);
                    }
                }
            }
        }
    }
    if mutated {
        if let Err(e) = nslnotes_core::settings::save_to_path(settings_path, &settings) {
            eprintln!("nslnotes-web: failed to save migrated settings: {e}");
        }
    }

    reconcile_smb_backends(&settings, Some(kek));
}

fn smb_credential_from_notebook(
    nb: &nslnotes_core::settings::Notebook,
    kek: Option<&nslnotes_core::crypto::Kek>,
) -> Result<nslnotes_core::fs::SmbCredential, String> {
    let parsed = nslnotes_core::smb_url::parse_smb_url(&nb.path)?;
    let password = match (kek, nb.smb_password_enc.as_deref(), nb.smb_password.as_deref()) {
        (Some(k), Some(enc), _) => nslnotes_core::crypto::decrypt_str(k, enc)
            .map_err(|e| format!("decrypt smbPasswordEnc: {e}"))?,
        (_, _, Some(plain)) if !plain.is_empty() => plain.to_string(),
        (_, Some(_), None) => {
            return Err(
                "smbPasswordEnc present but no login-derived key available yet".into(),
            );
        }
        _ => {
            // No password material at all (or only an empty string). Fail
            // loud rather than registering with `password = ""` — that
            // path connects to the SMB context fine but every real op
            // (`opendir`, `open`, …) returns NULL → "bad file descriptor"
            // 500s, which is misleading enough to chew through hours of
            // debugging. Caller logs the message via `eprintln!`.
            return Err("no SMB password configured (set smbPassword or smbPasswordEnc)".into());
        }
    };

    Ok(nslnotes_core::fs::SmbCredential {
        host: parsed.host,
        share: parsed.share,
        username: nb.smb_username.clone().unwrap_or_default(),
        password,
        domain: nb.smb_domain.clone().unwrap_or_default(),
    })
}

fn notebook_summary(settings: &AppSettings) -> String {
    if settings.notebooks.is_empty() {
        return "none (configure via UI)".into();
    }
    settings
        .notebooks
        .iter()
        .map(|n| {
            let kind = if nslnotes_core::smb_url::is_smb_url(&n.path) { "smb" } else { "local" };
            format!("{} [{kind}]", n.name)
        })
        .collect::<Vec<_>>()
        .join(", ")
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
                println!("{hash}");
            }
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
