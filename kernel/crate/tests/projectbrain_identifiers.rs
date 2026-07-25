//! Identity and evidence-id derivation tests.

mod common;

use oh_my_pm_kernel::contracts::projectbrain::{
    EvidenceSourceKind, ProjectIdentityKind, RawContentPolicy,
};
use oh_my_pm_kernel::projectbrain::fingerprint::derive_evidence_id;
use oh_my_pm_kernel::projectbrain::identifiers::{resolve_project_identity, ProjectIdentitySeed};

fn derived_seed(root: &str, salt: &str) -> ProjectIdentitySeed {
    ProjectIdentitySeed {
        explicit_id: None,
        normalized_root_token: Some(root.to_string()),
        local_salt: Some(salt.to_string()),
        display_name: None,
        root_hint: None,
    }
}

#[test]
fn explicit_id_is_deterministic_and_preserves_case() {
    let seed = ProjectIdentitySeed {
        explicit_id: Some("  Project-Atlas  ".to_string()),
        ..Default::default()
    };
    let a = resolve_project_identity(&seed).unwrap();
    let b = resolve_project_identity(&seed).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.id, "Project-Atlas");
    assert_eq!(a.kind, ProjectIdentityKind::Explicit);
}

#[test]
fn derived_id_is_deterministic_and_prefixed() {
    let seed = derived_seed("root-token", "local-salt");
    let a = resolve_project_identity(&seed).unwrap();
    let b = resolve_project_identity(&seed).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.kind, ProjectIdentityKind::Derived);
    assert!(a.id.starts_with("project:sha256:"));
    let hex = a.id.strip_prefix("project:sha256:").unwrap();
    assert_eq!(hex.len(), 64);
    assert!(hex
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
}

#[test]
fn derived_id_changes_with_salt() {
    let a = resolve_project_identity(&derived_seed("root", "salt-a")).unwrap();
    let b = resolve_project_identity(&derived_seed("root", "salt-b")).unwrap();
    assert_ne!(a.id, b.id);
}

#[test]
fn derived_id_changes_with_root_token() {
    let a = resolve_project_identity(&derived_seed("root-a", "salt")).unwrap();
    let b = resolve_project_identity(&derived_seed("root-b", "salt")).unwrap();
    assert_ne!(a.id, b.id);
}

#[test]
fn root_token_never_appears_in_output() {
    let seed = derived_seed("super-secret-root-token", "salt");
    let id = resolve_project_identity(&seed).unwrap();
    assert!(!id.id.contains("super-secret-root-token"));
    assert_eq!(id.root_hint, None);
    assert_eq!(id.display_name, None);
}

#[test]
fn derived_requires_both_root_token_and_salt() {
    let missing_salt = ProjectIdentitySeed {
        normalized_root_token: Some("root".to_string()),
        ..Default::default()
    };
    assert_eq!(
        resolve_project_identity(&missing_salt).unwrap_err().code,
        "OMP-K-PB-1002"
    );
    let missing_root = ProjectIdentitySeed {
        local_salt: Some("salt".to_string()),
        ..Default::default()
    };
    assert_eq!(
        resolve_project_identity(&missing_root).unwrap_err().code,
        "OMP-K-PB-1002"
    );
}

#[test]
fn root_hint_must_not_be_absolute() {
    let seed = ProjectIdentitySeed {
        explicit_id: Some("p1".to_string()),
        root_hint: Some("/Users/someone/repo".to_string()),
        ..Default::default()
    };
    assert_eq!(
        resolve_project_identity(&seed).unwrap_err().code,
        "OMP-K-PB-1008"
    );
}

#[test]
fn evidence_id_is_deterministic() {
    let mut record = common::evidence("p1", "ignored", "docs/status.md#L5");
    record.raw_content_policy = RawContentPolicy::Minimized;
    record.content_fingerprint = Some("sha256:deadbeef".to_string());
    let a = derive_evidence_id(&record).unwrap();
    let b = derive_evidence_id(&record).unwrap();
    assert_eq!(a, b);
    assert!(a.starts_with("evidence:sha256:"));
    assert_eq!(a.strip_prefix("evidence:sha256:").unwrap().len(), 64);
}

#[test]
fn evidence_id_uses_content_fingerprint_when_present() {
    let mut a = common::evidence("p1", "x", "docs/a.md");
    a.raw_content_policy = RawContentPolicy::Minimized;
    a.content_fingerprint = Some("sha256:aaaa".to_string());
    a.observed_at = "2026-01-01T00:00:00Z".to_string();

    let mut b = a.clone();
    // A different observedAt must NOT change the id while a fingerprint is present.
    b.observed_at = "2026-12-31T00:00:00Z".to_string();
    assert_eq!(
        derive_evidence_id(&a).unwrap(),
        derive_evidence_id(&b).unwrap()
    );

    // A different content fingerprint DOES change the id.
    let mut c = a.clone();
    c.content_fingerprint = Some("sha256:bbbb".to_string());
    assert_ne!(
        derive_evidence_id(&a).unwrap(),
        derive_evidence_id(&c).unwrap()
    );
}

#[test]
fn not_stored_evidence_uses_observed_at() {
    // Without a content fingerprint, observedAt distinguishes records.
    let mut a = common::evidence("p1", "x", "docs/a.md");
    a.raw_content_policy = RawContentPolicy::NotStored;
    a.observed_at = "2026-01-01T00:00:00Z".to_string();
    let mut b = a.clone();
    b.observed_at = "2026-02-01T00:00:00Z".to_string();
    assert_ne!(
        derive_evidence_id(&a).unwrap(),
        derive_evidence_id(&b).unwrap()
    );
}

#[test]
fn minimized_evidence_requires_content_fingerprint() {
    let mut record = common::evidence("p1", "x", "docs/a.md");
    record.source_kind = EvidenceSourceKind::GithubIssue;
    record.raw_content_policy = RawContentPolicy::Minimized;
    record.content_fingerprint = None;
    assert_eq!(
        derive_evidence_id(&record).unwrap_err().code,
        "OMP-K-PB-1002"
    );
}

#[test]
fn absolute_source_identity_is_rejected() {
    let mut record = common::evidence("p1", "x", "/Users/secret/notes.md");
    record.raw_content_policy = RawContentPolicy::NotStored;
    assert_eq!(
        derive_evidence_id(&record).unwrap_err().code,
        "OMP-K-PB-1008"
    );
}
