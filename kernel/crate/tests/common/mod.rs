//! Shared test helpers: fixture loading and small contract builders.
#![allow(dead_code)]

use std::fs;
use std::path::PathBuf;

use oh_my_pm_kernel::contracts::projectbrain::{
    CanonicalStateItem, EvidenceRecord, Freshness, FreshnessDimension, FreshnessStatus,
    ProjectIdentity, ProjectIdentityKind, ProjectSnapshot, ProjectState, StateItemKind,
};

/// Absolute path to the committed Project Brain fixtures.
pub fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/fixtures/project-brain")
}

/// Read a fixture file as a UTF-8 string.
pub fn read_fixture(name: &str) -> String {
    fs::read_to_string(fixture_dir().join(name))
        .unwrap_or_else(|e| panic!("failed to read fixture {name}: {e}"))
}

/// Parse a fixture file as a JSON value of type `T`.
pub fn load_fixture<T: serde::de::DeserializeOwned>(name: &str) -> T {
    serde_json::from_str(&read_fixture(name))
        .unwrap_or_else(|e| panic!("failed to parse fixture {name}: {e}"))
}

/// A minimal known freshness block for building states.
pub fn simple_freshness() -> Freshness {
    let known = FreshnessDimension {
        status: FreshnessStatus::Known,
        age_seconds: Some(0),
        reference_timestamp: Some("2026-03-01T00:00:00Z".to_string()),
    };
    Freshness {
        observation_freshness: known.clone(),
        source_freshness: FreshnessDimension {
            status: FreshnessStatus::Unknown,
            age_seconds: None,
            reference_timestamp: None,
        },
        evidence_freshness: known.clone(),
        derived_state_freshness: known,
        coverage_complete: true,
        coverage_gaps: vec![],
        schema_version: 1,
    }
}

/// A minimal explicit identity.
pub fn identity(id: &str) -> ProjectIdentity {
    ProjectIdentity {
        id: id.to_string(),
        kind: ProjectIdentityKind::Explicit,
        schema_version: 1,
        display_name: None,
        root_hint: None,
    }
}

/// A bare state item with no optional fields.
pub fn item(kind: StateItemKind, id: &str, title: &str) -> CanonicalStateItem {
    CanonicalStateItem {
        kind,
        id: id.to_string(),
        title: title.to_string(),
        evidence_refs: vec![],
        status: None,
        severity: None,
        owner: None,
        due_date: None,
        priority: None,
        metadata: None,
    }
}

/// A minimal valid state for a given identity id, with one task collection.
pub fn state_with_tasks(id: &str, tasks: Vec<CanonicalStateItem>) -> ProjectState {
    ProjectState {
        identity: identity(id),
        observed_at: "2026-03-01T00:00:00Z".to_string(),
        sources: vec![],
        status_summary: std::collections::BTreeMap::new(),
        evidence_refs: vec![],
        freshness: simple_freshness(),
        schema_version: 1,
        state_fingerprint: "PLACEHOLDER".to_string(),
        objective: None,
        milestones: None,
        tasks: Some(tasks),
        risks: None,
        decisions: None,
        dependencies: None,
        blockers: None,
    }
}

/// A minimal valid snapshot wrapping a state.
pub fn snapshot(project_id: &str, captured_at: &str, state: ProjectState) -> ProjectSnapshot {
    ProjectSnapshot {
        snapshot_id: "PLACEHOLDER".to_string(),
        project_id: project_id.to_string(),
        captured_at: captured_at.to_string(),
        source_boundaries: vec![],
        state,
        evidence_refs: vec![],
        schema_version: 1,
        fingerprint: "PLACEHOLDER".to_string(),
    }
}

/// A minimal minimized evidence record.
pub fn evidence(project_id: &str, id: &str, source_identity: &str) -> EvidenceRecord {
    use oh_my_pm_kernel::contracts::projectbrain::{
        EvidenceSourceKind, RawContentPolicy, RetentionState,
    };
    EvidenceRecord {
        evidence_id: id.to_string(),
        project_id: project_id.to_string(),
        source_kind: EvidenceSourceKind::Markdown,
        source_identity: source_identity.to_string(),
        observed_at: "2026-03-01T00:00:00Z".to_string(),
        provenance: std::collections::BTreeMap::new(),
        raw_content_policy: RawContentPolicy::NotStored,
        retention_state: RetentionState::Active,
        schema_version: 1,
        content_fingerprint: None,
        source_updated_at: None,
        metadata: None,
    }
}
