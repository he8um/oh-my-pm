//! Canonical serialization and SHA-256 fingerprinting primitives.
//!
//! All fingerprints are computed from a single canonical byte encoding so the
//! same semantic value hashes identically on every platform and build target.
//!
//! Canonical rules:
//! - UTF-8 output.
//! - Object keys are emitted in lexicographic (byte-order) order.
//! - No insignificant whitespace.
//! - Strings are JSON-escaped via `serde_json`'s string escaping.
//! - Integers serialize canonically (no leading zeros, no exponent).
//! - Arrays preserve the order given to the builder; the caller sorts any array
//!   whose semantic order is declared non-significant before building it.
//! - The serialized size is bounded by [`MAX_CANONICAL_BYTES`].
//!
//! The serializer reads no clock, no locale, no environment, and never uses a
//! `HashMap`, `DefaultHasher`, memory address, or machine path.

use std::collections::BTreeMap;

use sha2::{Digest, Sha256};

use super::error::{ProjectBrainError, OMP_K_PB_LIMIT_EXCEEDED};
use super::limits::MAX_CANONICAL_BYTES;

/// A canonical value tree. Object keys are held in a `BTreeMap` so iteration is
/// always in sorted key order; arrays keep their given order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalValue {
    Null,
    Bool(bool),
    /// A signed integer. Project Brain fingerprints never encode floats.
    Int(i64),
    /// A UTF-8 string, escaped canonically on output.
    Str(String),
    /// An ordered array. The caller declares the order semantically meaningful.
    Array(Vec<CanonicalValue>),
    /// An object with lexicographically ordered keys.
    Object(BTreeMap<String, CanonicalValue>),
}

impl CanonicalValue {
    /// Build a string value.
    pub fn str(value: impl Into<String>) -> Self {
        CanonicalValue::Str(value.into())
    }

    /// Serialize this value to canonical bytes, enforcing the size bound.
    pub fn to_canonical_bytes(&self) -> Result<Vec<u8>, ProjectBrainError> {
        let mut out = Vec::new();
        self.write(&mut out);
        if out.len() > MAX_CANONICAL_BYTES {
            return Err(ProjectBrainError::new(
                OMP_K_PB_LIMIT_EXCEEDED,
                "canonical serialization exceeds the maximum permitted size",
            ));
        }
        Ok(out)
    }

    fn write(&self, out: &mut Vec<u8>) {
        match self {
            CanonicalValue::Null => out.extend_from_slice(b"null"),
            CanonicalValue::Bool(true) => out.extend_from_slice(b"true"),
            CanonicalValue::Bool(false) => out.extend_from_slice(b"false"),
            CanonicalValue::Int(n) => {
                // itoa-free canonical integer via the standard Display impl,
                // which never emits leading zeros, signs on zero, or exponents.
                out.extend_from_slice(n.to_string().as_bytes());
            }
            CanonicalValue::Str(s) => write_json_string(s, out),
            CanonicalValue::Array(items) => {
                out.push(b'[');
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(b',');
                    }
                    item.write(out);
                }
                out.push(b']');
            }
            CanonicalValue::Object(entries) => {
                out.push(b'{');
                // BTreeMap iterates in sorted key order.
                for (index, (key, value)) in entries.iter().enumerate() {
                    if index > 0 {
                        out.push(b',');
                    }
                    write_json_string(key, out);
                    out.push(b':');
                    value.write(out);
                }
                out.push(b'}');
            }
        }
    }
}

/// Write a JSON-escaped string using `serde_json`'s exact string escaping.
fn write_json_string(value: &str, out: &mut Vec<u8>) {
    // Delegating to serde_json guarantees identical escaping across platforms.
    let encoded = serde_json::Value::String(value.to_string()).to_string();
    out.extend_from_slice(encoded.as_bytes());
}

/// Lowercase hexadecimal SHA-256 of `bytes`, without any hex dependency.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        // Manual lowercase hex; avoids adding a hex crate.
        const HEX: &[u8; 16] = b"0123456789abcdef";
        hex.push(HEX[(byte >> 4) as usize] as char);
        hex.push(HEX[(byte & 0x0f) as usize] as char);
    }
    hex
}

/// Domain-separated SHA-256 over a canonical value.
///
/// The domain separator prevents a hash computed for one purpose (e.g. project
/// identity) from ever colliding with a hash computed for another (e.g. state).
/// The separator and a `\n` byte are prepended to the canonical payload.
pub fn fingerprint_hex(domain: &str, value: &CanonicalValue) -> Result<String, ProjectBrainError> {
    let payload = value.to_canonical_bytes()?;
    let mut buf = Vec::with_capacity(domain.len() + 1 + payload.len());
    buf.extend_from_slice(domain.as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(&payload);
    Ok(sha256_hex(&buf))
}

/// Domain-separated SHA-256 over raw bytes (used for content fingerprints).
pub fn fingerprint_hex_bytes(domain: &str, payload: &[u8]) -> String {
    let mut buf = Vec::with_capacity(domain.len() + 1 + payload.len());
    buf.extend_from_slice(domain.as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(payload);
    sha256_hex(&buf)
}
