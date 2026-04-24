//! Shared helpers for parsing `smb://` URLs. Canonicalized here to avoid the
//! three slightly-different parsers this codebase accumulated across the
//! backend registry, SMB client, and settings reconciler.

/// Returns true if `path` is an `smb://` URL. All other scheme prefixes and
/// local filesystem paths return false.
pub fn is_smb_url(path: &str) -> bool {
    path.starts_with("smb://")
}

/// Host, share, and optional sub-path extracted from a `smb://` URL. Any
/// `user:pass@` portion is dropped — credentials come from the caller's own
/// secret store, never from a path string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmbUrl {
    pub host: String,
    pub share: String,
    /// Path within the share. Empty when the URL is `smb://host/share` with
    /// no trailing component. Always normalized without leading/trailing `/`.
    pub subpath: String,
}

/// Parse `smb://[user:pass@]host/share[/sub/path]`. Returns `Err` for any
/// other shape or when host/share are missing.
pub fn parse_smb_url(url: &str) -> Result<SmbUrl, String> {
    let Some(rest) = url.strip_prefix("smb://") else {
        return Err(format!("not an smb:// URL: {url}"));
    };
    let rest = rest
        .split_once('@')
        .map(|(_, host_rest)| host_rest)
        .unwrap_or(rest);
    let mut parts = rest.splitn(3, '/');
    let host = parts.next().unwrap_or("");
    let share = parts.next().unwrap_or("");
    if host.is_empty() || share.is_empty() {
        return Err(format!(
            "smb URL must have host and share: smb://host/share[/sub] ({url})"
        ));
    }
    let subpath = parts
        .next()
        .unwrap_or("")
        .trim_matches('/')
        .to_string();
    Ok(SmbUrl {
        host: host.to_string(),
        share: share.to_string(),
        subpath,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_smb() {
        assert!(is_smb_url("smb://nas/share"));
        assert!(!is_smb_url("/mnt/notes"));
        assert!(!is_smb_url("file://x"));
    }

    #[test]
    fn parses_host_share() {
        let u = parse_smb_url("smb://nas.local/notebooks").unwrap();
        assert_eq!(u.host, "nas.local");
        assert_eq!(u.share, "notebooks");
        assert_eq!(u.subpath, "");
    }

    #[test]
    fn parses_subpath() {
        let u = parse_smb_url("smb://nas/share/deep/folder").unwrap();
        assert_eq!(u.subpath, "deep/folder");
    }

    #[test]
    fn strips_embedded_creds_and_trailing_slashes() {
        let u = parse_smb_url("smb://alice:pw@nas/share/sub/").unwrap();
        assert_eq!(u.host, "nas");
        assert_eq!(u.share, "share");
        assert_eq!(u.subpath, "sub");
    }

    #[test]
    fn rejects_missing_parts() {
        assert!(parse_smb_url("smb://nas").is_err());
        assert!(parse_smb_url("smb:///share").is_err());
        assert!(parse_smb_url("/local/path").is_err());
    }
}
