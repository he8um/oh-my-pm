//! Deterministic, non-secret error boundary for the pure Project Brain Kernel.
//!
//! Every error carries a stable `OMP-K-PB-*` code, a deterministic message that
//! identifies a field path only, and never any private content: no raw bodies,
//! no tokens, no absolute paths, no diffs. The Kernel never panics on
//! user-controlled contract input; it returns one of these errors instead.

use std::fmt;

/// Invalid schema version (not `1`).
pub const OMP_K_PB_INVALID_SCHEMA_VERSION: &str = "OMP-K-PB-1001";
/// Invalid or empty required field.
pub const OMP_K_PB_INVALID_FIELD: &str = "OMP-K-PB-1002";
/// Duplicate identity, item, boundary, or evidence reference.
pub const OMP_K_PB_DUPLICATE: &str = "OMP-K-PB-1003";
/// Project or snapshot identity mismatch.
pub const OMP_K_PB_MISMATCH: &str = "OMP-K-PB-1004";
/// Invalid timestamp or date value.
pub const OMP_K_PB_INVALID_TIME: &str = "OMP-K-PB-1005";
/// A referenced evidence id is missing from the provided set.
pub const OMP_K_PB_MISSING_EVIDENCE: &str = "OMP-K-PB-1006";
/// Invalid fingerprint input (e.g. content too large).
pub const OMP_K_PB_INVALID_FINGERPRINT_INPUT: &str = "OMP-K-PB-1007";
/// Unsupported normalized value (e.g. absolute path where prohibited, secret key).
pub const OMP_K_PB_UNSUPPORTED_VALUE: &str = "OMP-K-PB-1008";
/// A deterministic bound was exceeded.
pub const OMP_K_PB_LIMIT_EXCEEDED: &str = "OMP-K-PB-1009";
/// A timestamp lies in the future beyond the allowed skew.
pub const OMP_K_PB_FUTURE_TIMESTAMP: &str = "OMP-K-PB-1010";

/// A deterministic Project Brain error.
///
/// `code` is a stable, non-secret identifier. `message` and `path` are
/// deterministic and privacy-safe: they name the field that failed but never
/// echo the offending private value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectBrainError {
    /// Stable non-secret error code (`OMP-K-PB-*`).
    pub code: &'static str,
    /// Deterministic, privacy-safe message. Names the failing field only.
    pub message: String,
    /// Field path (e.g. `/state/tasks/0/id`), when a specific field is at fault.
    pub path: Option<String>,
}

impl ProjectBrainError {
    /// Build an error with a code and message but no field path.
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            path: None,
        }
    }

    /// Build an error with a code, message, and field path.
    pub fn at(code: &'static str, message: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            path: Some(path.into()),
        }
    }
}

impl fmt::Display for ProjectBrainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.path {
            Some(path) => write!(f, "[{}] {} (at {})", self.code, self.message, path),
            None => write!(f, "[{}] {}", self.code, self.message),
        }
    }
}

impl std::error::Error for ProjectBrainError {}

/// Convenience result alias for Project Brain operations.
pub type PbResult<T> = Result<T, ProjectBrainError>;
