//! Native/WASM binding parity (v0.3 Phase 3).
//!
//! The seven Project Brain operations exposed through the WASM binding delegate
//! to these exact pure Rust functions, so a golden value computed natively here
//! must equal the value the TypeScript binding test asserts. Pinning the same
//! literals in both the native (this file) and WASM
//! (`kernel/binding/test/wasm-projectbrain-api.test.ts`) layers proves the two
//! paths are semantically identical. No I/O; the functions are pure.

use std::collections::BTreeMap;

use oh_my_pm_kernel::contracts::projectbrain::{
    EvidenceRecord, EvidenceSourceKind, Freshness, FreshnessDimension, FreshnessStatus,
    ProjectIdentity, ProjectIdentityKind, ProjectState, RawContentPolicy, RetentionState,
};
use oh_my_pm_kernel::projectbrain::{
    derive_evidence_id, derive_freshness, finalize_project_state, fingerprint_minimized_content,
    resolve_project_identity, FreshnessInput, FreshnessPolicy, ProjectIdentitySeed,
};

fn explicit_identity() -> ProjectIdentity {
    resolve_project_identity(&ProjectIdentitySeed {
        explicit_id: Some("proj-1".to_string()),
        ..Default::default()
    })
    .expect("explicit identity resolves")
}

fn base_state() -> ProjectState {
    ProjectState {
        identity: explicit_identity(),
        observed_at: "2026-01-01T00:00:00Z".to_string(),
        sources: Vec::new(),
        status_summary: BTreeMap::new(),
        evidence_refs: Vec::new(),
        freshness: Freshness {
            observation_freshness: FreshnessDimension {
                status: FreshnessStatus::Known,
                age_seconds: Some(0),
                reference_timestamp: Some("2026-01-01T00:00:00Z".to_string()),
            },
            source_freshness: FreshnessDimension {
                status: FreshnessStatus::Unknown,
                age_seconds: None,
                reference_timestamp: None,
            },
            evidence_freshness: FreshnessDimension {
                status: FreshnessStatus::Unknown,
                age_seconds: None,
                reference_timestamp: None,
            },
            derived_state_freshness: FreshnessDimension {
                status: FreshnessStatus::Unknown,
                age_seconds: None,
                reference_timestamp: None,
            },
            coverage_complete: true,
            coverage_gaps: Vec::new(),
            schema_version: 1,
        },
        schema_version: 1,
        state_fingerprint: String::new(),
        objective: None,
        milestones: None,
        tasks: None,
        risks: None,
        decisions: None,
        dependencies: None,
        blockers: None,
    }
}

fn base_evidence() -> EvidenceRecord {
    let mut provenance = BTreeMap::new();
    provenance.insert("line".to_string(), "1".to_string());
    EvidenceRecord {
        evidence_id: "placeholder".to_string(),
        project_id: "proj-1".to_string(),
        source_kind: EvidenceSourceKind::Markdown,
        source_identity: "docs/status.md#L1".to_string(),
        observed_at: "2026-01-01T00:00:00Z".to_string(),
        provenance,
        raw_content_policy: RawContentPolicy::Minimized,
        retention_state: RetentionState::Active,
        schema_version: 1,
        content_fingerprint: Some(format!("sha256:{}", "a".repeat(64))),
        source_updated_at: None,
        metadata: None,
    }
}

#[test]
fn identity_matches_the_wasm_binding_golden() {
    let identity = explicit_identity();
    assert_eq!(identity.id, "proj-1");
    assert_eq!(identity.kind, ProjectIdentityKind::Explicit);
}

#[test]
fn content_fingerprint_matches_the_wasm_binding_golden() {
    assert_eq!(
        fingerprint_minimized_content("hello world").unwrap(),
        "sha256:ccb5d9affb68d81b41457706f0dc1a536f2c478fe45f7697219a3a35a2d553bb"
    );
}

#[test]
fn state_fingerprint_matches_the_wasm_binding_golden() {
    let finalized = finalize_project_state(base_state()).unwrap();
    assert_eq!(
        finalized.state_fingerprint,
        "sha256:a1dc98f574a49dedc9f9e9d847b8123e6c9515cb7a540a89428bf9c76d150231"
    );
}

#[test]
fn evidence_id_matches_the_wasm_binding_golden() {
    assert_eq!(
        derive_evidence_id(&base_evidence()).unwrap(),
        "evidence:sha256:6de2379df9b546c11beeaa95045118f7d6c5a50e111a9aa29790c5e04a01b542"
    );
}

#[test]
fn freshness_matches_the_wasm_binding_golden() {
    let freshness = derive_freshness(
        FreshnessInput {
            observation_at: "2026-01-01T00:00:00Z".to_string(),
            source_updated_ats: Vec::new(),
            evidence_changed_ats: Vec::new(),
            reference_at: "2026-01-02T00:00:00Z".to_string(),
            coverage_gaps: Vec::new(),
        },
        FreshnessPolicy {
            max_future_skew_seconds: 60,
        },
    )
    .unwrap();
    assert_eq!(
        freshness.observation_freshness.status,
        FreshnessStatus::Known
    );
    assert_eq!(freshness.observation_freshness.age_seconds, Some(86_400));
}
