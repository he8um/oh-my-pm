//! Contract-only serde round-trip tests for the v0.3 Project Brain contracts.
//!
//! These prove the generated Rust module remains valid and that its camelCase
//! JSON representation matches the generated TypeScript. They exercise the
//! generated contract types only; no Kernel production logic is involved.

use oh_my_pm_kernel::contracts::projectbrain::{
    project_brain_schema_version, CanonicalStateItem, ChangeCategory, ChangeSet, CoverageState,
    EvidenceRecord, EvidenceSourceKind, Freshness, FreshnessDimension, FreshnessStatus,
    ProjectIdentity, ProjectIdentityKind, ProjectSnapshot, ProjectState, RawContentPolicy,
    RetentionState, SourceBoundary, SourceDescriptor, StateChange, StateItemKind,
};
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn schema_version_is_one() {
    assert_eq!(project_brain_schema_version(), 1);
}

#[test]
fn identity_round_trips_as_camel_case() {
    let identity = ProjectIdentity {
        id: "pb_derived_0001".to_string(),
        kind: ProjectIdentityKind::Derived,
        schema_version: project_brain_schema_version(),
        display_name: None,
        root_hint: Some("my-project".to_string()),
    };
    let value = serde_json::to_value(&identity).unwrap();
    assert_eq!(value["kind"], json!("derived"));
    assert_eq!(value["schemaVersion"], json!(1));
    assert_eq!(value["rootHint"], json!("my-project"));
    // Optional None fields are skipped, not serialized as null.
    assert!(value.get("displayName").is_none());

    let parsed: ProjectIdentity = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, identity);
}

#[test]
fn evidence_record_round_trips_minimized() {
    let mut provenance = BTreeMap::new();
    provenance.insert("line".to_string(), "10".to_string());
    let evidence = EvidenceRecord {
        evidence_id: "ev_0001".to_string(),
        project_id: "pb_derived_0001".to_string(),
        source_kind: EvidenceSourceKind::Markdown,
        source_identity: "docs/plan.md#L10".to_string(),
        observed_at: "2026-07-25T00:00:00Z".to_string(),
        provenance,
        raw_content_policy: RawContentPolicy::Minimized,
        retention_state: RetentionState::Active,
        schema_version: project_brain_schema_version(),
        content_fingerprint: Some("sha256:abc".to_string()),
        source_updated_at: None,
        metadata: None,
    };
    let value = serde_json::to_value(&evidence).unwrap();
    assert_eq!(value["sourceKind"], json!("markdown"));
    assert_eq!(value["rawContentPolicy"], json!("minimized"));
    assert_eq!(value["retentionState"], json!("active"));
    assert_eq!(value["contentFingerprint"], json!("sha256:abc"));

    let parsed: EvidenceRecord = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, evidence);
}

#[test]
fn evidence_source_kinds_use_approved_camel_case() {
    assert_eq!(
        serde_json::to_value(EvidenceSourceKind::GithubPullRequest).unwrap(),
        json!("githubPullRequest")
    );
    assert_eq!(
        serde_json::to_value(RawContentPolicy::StoredOptIn).unwrap(),
        json!("storedOptIn")
    );
    assert_eq!(
        serde_json::to_value(RetentionState::PendingDelete).unwrap(),
        json!("pendingDelete")
    );
}

#[test]
fn freshness_preserves_four_dimensions() {
    let known = FreshnessDimension {
        status: FreshnessStatus::Known,
        age_seconds: Some(0),
        reference_timestamp: Some("2026-07-25T00:00:00Z".to_string()),
    };
    let unknown = FreshnessDimension {
        status: FreshnessStatus::Unknown,
        age_seconds: None,
        reference_timestamp: None,
    };
    let freshness = Freshness {
        observation_freshness: known.clone(),
        source_freshness: unknown,
        evidence_freshness: known.clone(),
        derived_state_freshness: known,
        coverage_complete: false,
        coverage_gaps: vec!["github: request failed".to_string()],
        schema_version: project_brain_schema_version(),
    };
    let value = serde_json::to_value(&freshness).unwrap();
    assert_eq!(value["observationFreshness"]["status"], json!("known"));
    assert_eq!(value["sourceFreshness"]["status"], json!("unknown"));
    assert_eq!(value["coverageComplete"], json!(false));

    let parsed: Freshness = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, freshness);
}

#[test]
fn snapshot_embeds_state_and_change_categories_round_trip() {
    let identity = ProjectIdentity {
        id: "pb_derived_0001".to_string(),
        kind: ProjectIdentityKind::Derived,
        schema_version: project_brain_schema_version(),
        display_name: None,
        root_hint: None,
    };
    let dim = FreshnessDimension {
        status: FreshnessStatus::Unknown,
        age_seconds: None,
        reference_timestamp: None,
    };
    let freshness = Freshness {
        observation_freshness: dim.clone(),
        source_freshness: dim.clone(),
        evidence_freshness: dim.clone(),
        derived_state_freshness: dim,
        coverage_complete: true,
        coverage_gaps: Vec::new(),
        schema_version: project_brain_schema_version(),
    };
    let risk = CanonicalStateItem {
        kind: StateItemKind::Risk,
        id: "risk_0001".to_string(),
        title: "Timeline slip".to_string(),
        evidence_refs: vec!["ev_0001".to_string()],
        status: None,
        severity: Some("warning".to_string()),
        owner: None,
        due_date: None,
        priority: None,
        metadata: None,
    };
    let state = ProjectState {
        identity: identity.clone(),
        observed_at: "2026-07-25T00:00:00Z".to_string(),
        sources: vec![SourceDescriptor {
            source_kind: EvidenceSourceKind::Markdown,
            source_identity: "docs/plan.md".to_string(),
        }],
        status_summary: BTreeMap::new(),
        evidence_refs: vec!["ev_0001".to_string()],
        freshness,
        schema_version: project_brain_schema_version(),
        state_fingerprint: "sha256:state".to_string(),
        objective: None,
        milestones: None,
        tasks: None,
        risks: Some(vec![risk.clone()]),
        decisions: None,
        dependencies: None,
        blockers: None,
    };
    let snapshot = ProjectSnapshot {
        snapshot_id: "snap_0001".to_string(),
        project_id: identity.id.clone(),
        captured_at: "2026-07-25T00:00:00Z".to_string(),
        source_boundaries: vec![SourceBoundary {
            source_identity: "docs/plan.md".to_string(),
            included_scope: "all".to_string(),
            coverage_state: CoverageState::Complete,
            gap_reason: None,
        }],
        state,
        evidence_refs: vec!["ev_0001".to_string()],
        schema_version: project_brain_schema_version(),
        fingerprint: "sha256:snapshot".to_string(),
    };
    let value = serde_json::to_value(&snapshot).unwrap();
    assert_eq!(value["state"]["identity"]["id"], json!("pb_derived_0001"));
    assert_eq!(
        value["sourceBoundaries"][0]["coverageState"],
        json!("complete")
    );

    let parsed: ProjectSnapshot = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, snapshot);

    let change_set = ChangeSet {
        project_id: identity.id,
        previous_snapshot_id: "snap_0000".to_string(),
        current_snapshot_id: snapshot.snapshot_id,
        compared_at: "2026-07-25T00:00:00Z".to_string(),
        changes: vec![StateChange {
            category: ChangeCategory::SeverityIncreased,
            item_kind: StateItemKind::Risk,
            item_id: "risk_0001".to_string(),
            evidence_refs: vec!["ev_0001".to_string()],
            previous_value: None,
            current_value: Some(risk),
        }],
        schema_version: project_brain_schema_version(),
    };
    let cs_value = serde_json::to_value(&change_set).unwrap();
    assert_eq!(
        cs_value["changes"][0]["category"],
        json!("severityIncreased")
    );
    let cs_parsed: ChangeSet = serde_json::from_value(cs_value).unwrap();
    assert_eq!(cs_parsed, change_set);
}
