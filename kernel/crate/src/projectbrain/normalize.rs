//! Exact, documented string and map normalization. Pure and deterministic.
//!
//! No Unicode NFKC/NFKD folding is applied: distinct Persian or technical
//! identifiers must never be merged. Case is preserved for display text and
//! opaque ids; only classification labels and map keys are lowercased, using
//! Rust's locale-independent Unicode lowercasing.

use std::collections::BTreeMap;

use super::error::{
    ProjectBrainError, OMP_K_PB_DUPLICATE, OMP_K_PB_INVALID_FIELD, OMP_K_PB_LIMIT_EXCEEDED,
    OMP_K_PB_UNSUPPORTED_VALUE,
};
use super::limits::{
    MAX_LABEL_BYTES, MAX_METADATA_ENTRIES, MAX_METADATA_KEY_BYTES, MAX_METADATA_VALUE_BYTES,
};

/// Normalize display text: titles, objective, display name, owner, gap reason.
///
/// - CRLF and CR are folded to LF.
/// - Leading/trailing Unicode whitespace is trimmed.
/// - Internal Unicode whitespace runs collapse to a single ASCII space.
/// - Letter case, punctuation, and Persian/Arabic characters are preserved.
/// - Nothing is transliterated and no meaningful punctuation is removed.
pub fn normalize_display_text(input: &str) -> String {
    // Fold line endings first so CR / CRLF count as whitespace uniformly.
    let folded: String = input
        .replace("\r\n", "\n")
        .chars()
        .map(|c| if c == '\r' { '\n' } else { c })
        .collect();

    let mut out = String::with_capacity(folded.len());
    let mut in_ws_run = false;
    let mut started = false;
    for ch in folded.chars() {
        if ch.is_whitespace() {
            in_ws_run = true;
            continue;
        }
        if in_ws_run && started {
            out.push(' ');
        }
        out.push(ch);
        in_ws_run = false;
        started = true;
    }
    out
}

/// Normalize a classification label: status, severity, priority.
///
/// Applies display-text normalization, then locale-independent Unicode
/// lowercasing. Punctuation is preserved.
pub fn normalize_label(input: &str) -> String {
    normalize_display_text(input).to_lowercase()
}

/// Normalize a required, non-empty display-text field, enforcing a byte bound.
pub fn normalize_required_text(
    input: &str,
    max_bytes: usize,
    field_path: &str,
) -> Result<String, ProjectBrainError> {
    let normalized = normalize_display_text(input);
    if normalized.is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "required text field is empty after normalization",
            field_path,
        ));
    }
    if normalized.len() > max_bytes {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "text field exceeds the maximum permitted size",
            field_path,
        ));
    }
    Ok(normalized)
}

/// Normalize an optional display-text field: `None` and empty-after-normalize
/// both become `None`, so absent and blank collapse identically.
pub fn normalize_optional_text(
    input: Option<&str>,
    max_bytes: usize,
    field_path: &str,
) -> Result<Option<String>, ProjectBrainError> {
    match input {
        None => Ok(None),
        Some(raw) => {
            let normalized = normalize_display_text(raw);
            if normalized.is_empty() {
                return Ok(None);
            }
            if normalized.len() > max_bytes {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_LIMIT_EXCEEDED,
                    "text field exceeds the maximum permitted size",
                    field_path,
                ));
            }
            Ok(Some(normalized))
        }
    }
}

/// Normalize an optional classification label, enforcing the label bound.
pub fn normalize_optional_label(
    input: Option<&str>,
    field_path: &str,
) -> Result<Option<String>, ProjectBrainError> {
    match input {
        None => Ok(None),
        Some(raw) => {
            let normalized = normalize_label(raw);
            if normalized.is_empty() {
                return Ok(None);
            }
            if normalized.len() > MAX_LABEL_BYTES {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_LIMIT_EXCEEDED,
                    "label exceeds the maximum permitted size",
                    field_path,
                ));
            }
            Ok(Some(normalized))
        }
    }
}

/// Normalize an opaque identifier: trim surrounding whitespace, reject empty,
/// preserve case, and enforce the byte bound. No fuzzy folding.
pub fn normalize_id(
    input: &str,
    max_bytes: usize,
    field_path: &str,
) -> Result<String, ProjectBrainError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "identifier is empty",
            field_path,
        ));
    }
    if trimmed.len() > max_bytes {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "identifier exceeds the maximum permitted size",
            field_path,
        ));
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err(ProjectBrainError::at(
            OMP_K_PB_UNSUPPORTED_VALUE,
            "identifier contains a control character",
            field_path,
        ));
    }
    Ok(trimmed.to_string())
}

/// The forbidden metadata / provenance key stems. A structured key is rejected
/// when, after lowercasing and removing separators, it equals one of these.
///
/// This guard applies to structured map keys only — never to human titles.
const FORBIDDEN_KEY_STEMS: &[&str] = &[
    "token",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "bearer",
    "password",
    "secret",
    "apikey",
    "privatekey",
    "cookie",
    "setcookie",
    "rawbody",
    "body",
    "diff",
    "diffhunk",
    "commithash",
    "commitsha",
];

/// The canonical form of a map key used for the secret-key guard: lowercase with
/// separators (`_`, `-`, space, `.`) removed.
fn key_stem(key: &str) -> String {
    key.to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '_' | '-' | ' ' | '.'))
        .collect()
}

/// Normalize a string→string map (metadata / provenance).
///
/// - Keys are trimmed and Unicode-lowercased; values are display-normalized.
/// - Two keys that collide after normalization are rejected.
/// - Secret-like keys are rejected on their structured stem.
/// - Entry count and key/value sizes are bounded.
/// - The result is a `BTreeMap`, so ordering is deterministic.
pub fn normalize_string_map(
    input: &BTreeMap<String, String>,
    field_path: &str,
) -> Result<BTreeMap<String, String>, ProjectBrainError> {
    if input.len() > MAX_METADATA_ENTRIES {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "map exceeds the maximum permitted entry count",
            field_path,
        ));
    }
    let mut out: BTreeMap<String, String> = BTreeMap::new();
    for (raw_key, raw_value) in input {
        let key = normalize_display_text(raw_key).to_lowercase();
        if key.is_empty() {
            return Err(ProjectBrainError::at(
                OMP_K_PB_INVALID_FIELD,
                "map key is empty after normalization",
                field_path,
            ));
        }
        if key.len() > MAX_METADATA_KEY_BYTES {
            return Err(ProjectBrainError::at(
                OMP_K_PB_LIMIT_EXCEEDED,
                "map key exceeds the maximum permitted size",
                field_path,
            ));
        }
        if FORBIDDEN_KEY_STEMS.contains(&key_stem(&key).as_str()) {
            return Err(ProjectBrainError::at(
                OMP_K_PB_UNSUPPORTED_VALUE,
                "map key is a forbidden secret-like key",
                field_path,
            ));
        }
        let value = normalize_display_text(raw_value);
        if value.len() > MAX_METADATA_VALUE_BYTES {
            return Err(ProjectBrainError::at(
                OMP_K_PB_LIMIT_EXCEEDED,
                "map value exceeds the maximum permitted size",
                field_path,
            ));
        }
        if out.insert(key, value).is_some() {
            return Err(ProjectBrainError::at(
                OMP_K_PB_DUPLICATE,
                "two map keys collide after normalization",
                field_path,
            ));
        }
    }
    Ok(out)
}

/// Normalize a string→int map (status summary): normalize/dedupe keys only; the
/// integer values are preserved. Keys are not secret-guarded (status labels).
pub fn normalize_int_map(
    input: &BTreeMap<String, i64>,
    field_path: &str,
) -> Result<BTreeMap<String, i64>, ProjectBrainError> {
    if input.len() > MAX_METADATA_ENTRIES {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "map exceeds the maximum permitted entry count",
            field_path,
        ));
    }
    let mut out: BTreeMap<String, i64> = BTreeMap::new();
    for (raw_key, value) in input {
        let key = normalize_label(raw_key);
        if key.is_empty() {
            return Err(ProjectBrainError::at(
                OMP_K_PB_INVALID_FIELD,
                "status-summary key is empty after normalization",
                field_path,
            ));
        }
        if key.len() > MAX_METADATA_KEY_BYTES {
            return Err(ProjectBrainError::at(
                OMP_K_PB_LIMIT_EXCEEDED,
                "status-summary key exceeds the maximum permitted size",
                field_path,
            ));
        }
        if out.insert(key, *value).is_some() {
            return Err(ProjectBrainError::at(
                OMP_K_PB_DUPLICATE,
                "two status-summary keys collide after normalization",
                field_path,
            ));
        }
    }
    Ok(out)
}

/// Normalize a sanitized source identity that must never be an absolute path.
///
/// Applies to `rootHint`, and `sourceIdentity` on evidence, source descriptors,
/// and source boundaries. No filesystem access, no symlink resolution.
///
/// - Obvious absolute forms (POSIX, Windows drive, UNC, `file://`) are rejected.
/// - Backslashes fold to forward slashes; duplicate separators collapse.
/// - A leading `./` is removed; a trailing slash is removed unless the value is
///   exactly `.`.
/// - `..` segments and NUL / control characters are rejected.
pub fn normalize_source_identity(
    input: &str,
    field_path: &str,
) -> Result<String, ProjectBrainError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "source identity is empty",
            field_path,
        ));
    }
    if trimmed.chars().any(|c| c.is_control() || c == '\0') {
        return Err(ProjectBrainError::at(
            OMP_K_PB_UNSUPPORTED_VALUE,
            "source identity contains a control character",
            field_path,
        ));
    }
    if is_absolute_pathlike(trimmed) {
        return Err(ProjectBrainError::at(
            OMP_K_PB_UNSUPPORTED_VALUE,
            "source identity must not be an absolute path",
            field_path,
        ));
    }

    // Fold backslashes to forward slashes, then collapse duplicate separators.
    let forward: String = trimmed
        .chars()
        .map(|c| if c == '\\' { '/' } else { c })
        .collect();
    let mut collapsed = String::with_capacity(forward.len());
    let mut prev_slash = false;
    for ch in forward.chars() {
        if ch == '/' {
            if prev_slash {
                continue;
            }
            prev_slash = true;
        } else {
            prev_slash = false;
        }
        collapsed.push(ch);
    }

    // Remove a leading "./".
    let mut value = collapsed.as_str();
    while let Some(rest) = value.strip_prefix("./") {
        value = rest;
    }
    let mut value = value.to_string();

    // Reject ".." path segments.
    for segment in value.split('/') {
        if segment == ".." {
            return Err(ProjectBrainError::at(
                OMP_K_PB_UNSUPPORTED_VALUE,
                "source identity must not contain a parent-directory segment",
                field_path,
            ));
        }
    }

    // Remove a trailing slash unless the whole value is ".".
    if value != "." && value.ends_with('/') {
        while value.ends_with('/') {
            value.pop();
        }
    }

    if value.is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "source identity is empty after normalization",
            field_path,
        ));
    }
    Ok(value)
}

/// Whether a value is an obvious absolute path form. Pure string inspection.
fn is_absolute_pathlike(value: &str) -> bool {
    if value.starts_with('/') {
        return true; // POSIX absolute, including /Users, /home.
    }
    if value.starts_with("\\\\") {
        return true; // UNC \\server\share.
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("file://") {
        return true;
    }
    // Windows drive: `C:\...` or `C:/...`.
    let bytes = value.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    false
}
