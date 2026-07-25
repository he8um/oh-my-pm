//! Pure, network-free identity derivation.
//!
//! Project identities and evidence ids are derived from caller-supplied inputs
//! only. No filesystem, clock, environment, or randomness is read. A derived id
//! never leaks the root token: only its domain-separated hash is emitted.

use super::canonical::{fingerprint_hex, CanonicalValue};
use super::error::{ProjectBrainError, OMP_K_PB_INVALID_FIELD};
use super::limits::MAX_ID_BYTES;
use super::normalize::{normalize_id, normalize_optional_text};

use crate::contracts::projectbrain::{ProjectIdentity, ProjectIdentityKind};

/// Domain separator for derived project identity hashes.
pub const PROJECT_IDENTITY_DOMAIN: &str = "oh-my-pm:projectbrain:v1:project-identity";

/// Caller-supplied seed for resolving a [`ProjectIdentity`]. This is an internal
/// Kernel input type, not a public contract.
///
/// Resolution precedence:
/// 1. `explicit_id` when present.
/// 2. otherwise `normalized_root_token` + `local_salt` (both required).
#[derive(Debug, Clone, Default)]
pub struct ProjectIdentitySeed {
    /// An explicit, configured project id (portable across clones/moves).
    pub explicit_id: Option<String>,
    /// A caller-normalized, non-secret root token (never emitted in output).
    pub normalized_root_token: Option<String>,
    /// A caller-provided local salt. The Kernel never creates, reads, or stores it.
    pub local_salt: Option<String>,
    /// Optional human-readable display name (output only).
    pub display_name: Option<String>,
    /// Optional non-absolute, display-only root hint.
    pub root_hint: Option<String>,
}

/// Resolve a [`ProjectIdentity`] from a seed.
pub fn resolve_project_identity(
    seed: &ProjectIdentitySeed,
) -> Result<ProjectIdentity, ProjectBrainError> {
    let display_name =
        normalize_optional_text(seed.display_name.as_deref(), 1024, "/identity/displayName")?;
    let root_hint = match seed.root_hint.as_deref() {
        None => None,
        Some(raw) => {
            // A root hint is display-only and must never be an absolute path.
            let normalized =
                super::normalize::normalize_source_identity(raw, "/identity/rootHint")?;
            Some(normalized)
        }
    };

    if let Some(explicit) = seed.explicit_id.as_deref() {
        let id = normalize_id(explicit, MAX_ID_BYTES, "/identity/id")?;
        return Ok(ProjectIdentity {
            id,
            kind: ProjectIdentityKind::Explicit,
            schema_version: crate::contracts::projectbrain::project_brain_schema_version(),
            display_name,
            root_hint,
        });
    }

    let root_token = seed.normalized_root_token.as_deref().ok_or_else(|| {
        ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "a derived identity requires a normalized root token",
            "/identity/id",
        )
    })?;
    let salt = seed.local_salt.as_deref().ok_or_else(|| {
        ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "a derived identity requires a local salt",
            "/identity/id",
        )
    })?;
    if root_token.trim().is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "normalized root token is empty",
            "/identity/id",
        ));
    }
    if salt.trim().is_empty() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_FIELD,
            "local salt is empty",
            "/identity/id",
        ));
    }

    // Hash a domain-separated payload of the root token and salt. Neither the
    // token nor the salt appears in the emitted id.
    let mut payload = std::collections::BTreeMap::new();
    payload.insert("rootToken".to_string(), CanonicalValue::str(root_token));
    payload.insert("salt".to_string(), CanonicalValue::str(salt));
    let hex = fingerprint_hex(PROJECT_IDENTITY_DOMAIN, &CanonicalValue::Object(payload))?;
    let id = format!("project:sha256:{hex}");

    Ok(ProjectIdentity {
        id,
        kind: ProjectIdentityKind::Derived,
        schema_version: crate::contracts::projectbrain::project_brain_schema_version(),
        display_name,
        root_hint,
    })
}
