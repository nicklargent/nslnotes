//! Symmetric encryption of secrets stored alongside `settings.json`.
//!
//! The key-encryption-key (KEK) is the 32-byte argon2id hash output that
//! falls out of verifying the user's login password. We don't store a
//! separate salt: the one embedded in `NSLNOTES_PASSWORD_HASH` is already
//! per-install and rotates with the password, which is the behaviour we
//! want (changing the login password invalidates encrypted SMB creds,
//! forcing the user to re-enter them).
//!
//! Ciphertext format is `base64(nonce[12] || ChaCha20-Poly1305(kek, nonce, plaintext))`.

use argon2::password_hash::PasswordHash;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use rand::RngCore;

/// 32-byte key derived from a verified login password.
pub type Kek = [u8; 32];

/// Extract a [`Kek`] from the argon2 hash portion of a successfully-parsed
/// `NSLNOTES_PASSWORD_HASH`. Callers must have verified the password first —
/// this function only reads what's already been computed.
pub fn kek_from_hash(phc: &PasswordHash<'_>) -> Result<Kek, String> {
    let hash = phc
        .hash
        .ok_or_else(|| "password hash missing output bytes".to_string())?;
    let bytes = hash.as_bytes();
    if bytes.len() < 32 {
        return Err(format!(
            "password hash output is {} bytes, need 32",
            bytes.len()
        ));
    }
    let mut kek = [0u8; 32];
    kek.copy_from_slice(&bytes[..32]);
    Ok(kek)
}

/// Encrypt `plaintext` to a base64 `nonce || ciphertext` string.
pub fn encrypt(kek: &Kek, plaintext: &[u8]) -> Result<String, String> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(kek));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("encrypt: {e}"))?;
    let mut out = Vec::with_capacity(nonce_bytes.len() + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

/// Reverse of [`encrypt`]. Returns an error on any tampering (Poly1305 tag
/// mismatch) or a wrong key.
pub fn decrypt(kek: &Kek, encoded: &str) -> Result<Vec<u8>, String> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| format!("base64: {e}"))?;
    if raw.len() < 12 + 16 {
        return Err(format!("ciphertext too short ({} bytes)", raw.len()));
    }
    let (nonce_bytes, ct) = raw.split_at(12);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(kek));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ct)
        .map_err(|e| format!("decrypt: {e} (wrong key or tampered ciphertext)"))
}

/// Convenience: encrypt a UTF-8 string.
pub fn encrypt_str(kek: &Kek, plaintext: &str) -> Result<String, String> {
    encrypt(kek, plaintext.as_bytes())
}

/// Convenience: decrypt to a UTF-8 string.
pub fn decrypt_str(kek: &Kek, encoded: &str) -> Result<String, String> {
    let bytes = decrypt(kek, encoded)?;
    String::from_utf8(bytes).map_err(|e| format!("decrypted bytes were not UTF-8: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let kek = [7u8; 32];
        let ct = encrypt_str(&kek, "hello world").unwrap();
        assert_ne!(ct, "hello world");
        assert_eq!(decrypt_str(&kek, &ct).unwrap(), "hello world");
    }

    #[test]
    fn wrong_key_fails() {
        let k1 = [1u8; 32];
        let k2 = [2u8; 32];
        let ct = encrypt_str(&k1, "secret").unwrap();
        assert!(decrypt_str(&k2, &ct).is_err());
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let kek = [3u8; 32];
        let mut ct = encrypt_str(&kek, "secret").unwrap();
        // Flip a character in the base64 payload.
        let mid = ct.len() / 2;
        let bytes = unsafe { ct.as_bytes_mut() };
        bytes[mid] = bytes[mid].wrapping_add(1);
        assert!(decrypt_str(&kek, &ct).is_err());
    }

    #[test]
    fn distinct_nonces_per_encryption() {
        let kek = [5u8; 32];
        let a = encrypt_str(&kek, "same").unwrap();
        let b = encrypt_str(&kek, "same").unwrap();
        assert_ne!(a, b);
    }
}
