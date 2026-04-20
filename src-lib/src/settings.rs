use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Returns the settings file path.
/// Checks `NSLNOTES_SETTINGS` env var first, falls back to `~/.config/nslnotes/settings.json`.
pub fn default_path() -> PathBuf {
    if let Ok(p) = std::env::var("NSLNOTES_SETTINGS") {
        return PathBuf::from(p);
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nslnotes")
        .join("settings.json")
}

/// A registered notebook (a root folder that holds notes/tasks/docs)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// Application settings
#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppSettings {
    #[serde(rename = "rootPath")]
    pub root_path: Option<String>,
    #[serde(default)]
    pub notebooks: Vec<Notebook>,
    #[serde(rename = "activeNotebookId", default)]
    pub active_notebook_id: Option<String>,
    #[serde(rename = "leftColumnWidth", default)]
    pub left_column_width: Option<f64>,
    #[serde(rename = "rightColumnWidth", default)]
    pub right_column_width: Option<f64>,
    #[serde(rename = "fontSize", default)]
    pub font_size: Option<f64>,
    #[serde(rename = "windowWidth", default)]
    pub window_width: Option<f64>,
    #[serde(rename = "windowHeight", default)]
    pub window_height: Option<f64>,
    #[serde(rename = "windowMaximized", default)]
    pub window_maximized: Option<bool>,
    #[serde(rename = "darkMode", default)]
    pub dark_mode: Option<bool>,
    #[serde(rename = "webPort", default)]
    pub web_port: Option<u16>,
}

/// Load application settings from a file path
pub fn load_from_path(path: &Path) -> Result<AppSettings, String> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Save application settings to a file path
pub fn save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(path, content).map_err(|e| format!("Failed to write settings: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_settings_without_notebooks_deserializes() {
        // A settings.json from before multi-notebook support: only rootPath.
        let legacy = r#"{"rootPath": "/home/nsl/docs/nslnotes1"}"#;
        let parsed: AppSettings = serde_json::from_str(legacy).expect("parse");
        assert_eq!(parsed.root_path.as_deref(), Some("/home/nsl/docs/nslnotes1"));
        assert!(parsed.notebooks.is_empty());
        assert!(parsed.active_notebook_id.is_none());
    }

    #[test]
    fn settings_with_notebooks_round_trip() {
        let s = AppSettings {
            root_path: Some("/a".into()),
            notebooks: vec![
                Notebook { id: "n1".into(), name: "Work".into(), path: "/a".into() },
                Notebook { id: "n2".into(), name: "Home".into(), path: "/b".into() },
            ],
            active_notebook_id: Some("n1".into()),
            ..Default::default()
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let parsed: AppSettings = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed.notebooks.len(), 2);
        assert_eq!(parsed.notebooks[0].name, "Work");
        assert_eq!(parsed.active_notebook_id.as_deref(), Some("n1"));
    }
}
