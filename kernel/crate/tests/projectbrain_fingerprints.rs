//! Fingerprint tests: golden values, semantic vs temporal, content hashing.

mod common;

use common::{item, load_fixture, read_fixture, state_with_tasks};
use oh_my_pm_kernel::contracts::projectbrain::{
    FreshnessStatus, ProjectSnapshot, ProjectState, StateItemKind,
};
use oh_my_pm_kernel::projectbrain::fingerprint::{
    compute_state_fingerprint, finalize_project_snapshot, finalize_project_state,
    fingerprint_minimized_content,
};

/// G3 groundwork: the state fingerprint of the golden state matches the recorded
/// hard-coded value exactly, across repeated runs.
#[test]
fn golden_state_fingerprint_is_exact() {
    let expected = read_fixture("state-fingerprint.txt");
    let expected = expected.trim();
    let state: ProjectState = load_fixture("state-unordered.json");
    let finalized = finalize_project_state(state).unwrap();
    assert_eq!(finalized.state_fingerprint, expected);
    // The published normalized fixture is deep-equal to the recomputed one.
    let normalized_fixture: ProjectState = load_fixture("state-normalized.json");
    assert_eq!(finalized, normalized_fixture);
}

#[test]
fn state_fingerprint_format_is_sha256_hex() {
    let state = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    let finalized = finalize_project_state(state).unwrap();
    let hex = finalized
        .state_fingerprint
        .strip_prefix("sha256:")
        .expect("sha256 prefix");
    assert_eq!(hex.len(), 64);
    assert!(hex
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
}

#[test]
fn reordered_non_semantic_arrays_hash_equal() {
    let mut a = state_with_tasks(
        "p1",
        vec![
            item(StateItemKind::Task, "t-2", "Two"),
            item(StateItemKind::Task, "t-1", "One"),
        ],
    );
    a.sources = vec![];
    let mut b = state_with_tasks(
        "p1",
        vec![
            item(StateItemKind::Task, "t-1", "One"),
            item(StateItemKind::Task, "t-2", "Two"),
        ],
    );
    b.sources = vec![];
    assert_eq!(
        finalize_project_state(a).unwrap().state_fingerprint,
        finalize_project_state(b).unwrap().state_fingerprint
    );
}

#[test]
fn observed_at_does_not_change_state_fingerprint() {
    let mut a = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    a.observed_at = "2026-01-01T00:00:00Z".to_string();
    let mut b = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    b.observed_at = "2026-12-31T23:59:59Z".to_string();
    assert_eq!(
        finalize_project_state(a).unwrap().state_fingerprint,
        finalize_project_state(b).unwrap().state_fingerprint
    );
}

#[test]
fn freshness_does_not_change_state_fingerprint() {
    let mut a = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    let mut b = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    // Change a freshness dimension in b only.
    b.freshness.observation_freshness.status = FreshnessStatus::Unknown;
    b.freshness.observation_freshness.age_seconds = None;
    b.freshness.observation_freshness.reference_timestamp = None;
    a.freshness.observation_freshness.age_seconds = Some(999999);
    assert_eq!(
        finalize_project_state(a).unwrap().state_fingerprint,
        finalize_project_state(b).unwrap().state_fingerprint
    );
}

#[test]
fn semantic_changes_alter_state_fingerprint() {
    let base = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "Title")]);
    let base_fp = finalize_project_state(base).unwrap().state_fingerprint;

    // Title change.
    let mut changed = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "New Title")]);
    changed.sources = vec![];
    assert_ne!(
        finalize_project_state(changed).unwrap().state_fingerprint,
        base_fp
    );

    // Status change.
    let mut with_status = item(StateItemKind::Task, "t", "Title");
    with_status.status = Some("done".to_string());
    let s = state_with_tasks("p1", vec![with_status]);
    assert_ne!(
        finalize_project_state(s).unwrap().state_fingerprint,
        base_fp
    );

    // Evidence reference change.
    let mut with_ev = item(StateItemKind::Task, "t", "Title");
    with_ev.evidence_refs = vec!["evidence:x".to_string()];
    let s = state_with_tasks("p1", vec![with_ev]);
    assert_ne!(
        finalize_project_state(s).unwrap().state_fingerprint,
        base_fp
    );
}

#[test]
fn placeholder_state_fingerprint_is_ignored_and_replaced() {
    let mut state = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "T")]);
    state.state_fingerprint = "sha256:not-trusted".to_string();
    let finalized = finalize_project_state(state).unwrap();
    assert_ne!(finalized.state_fingerprint, "sha256:not-trusted");
}

#[test]
fn content_fingerprint_canonicalizes_line_endings() {
    let a = fingerprint_minimized_content("line one\r\nline two\r\n").unwrap();
    let b = fingerprint_minimized_content("line one\nline two").unwrap();
    assert_eq!(a, b);
    // Leading/trailing blank lines and trailing spaces do not matter.
    let c = fingerprint_minimized_content("\n\nline one   \nline two\n\n").unwrap();
    assert_eq!(a, c);
    assert!(a.starts_with("sha256:"));
}

#[test]
fn content_fingerprint_differs_on_meaningful_change() {
    let a = fingerprint_minimized_content("hello world").unwrap();
    let b = fingerprint_minimized_content("hello  world").unwrap(); // internal ws kept
    assert_ne!(a, b);
    // Persian and English produce distinct, deterministic hashes.
    let fa = fingerprint_minimized_content("سلام دنیا").unwrap();
    let en = fingerprint_minimized_content("hello world").unwrap();
    assert_ne!(fa, en);
    assert_eq!(fa, fingerprint_minimized_content("سلام دنیا").unwrap());
}

/// G3: the golden snapshot fingerprints and ids are exact and deterministic.
#[test]
fn golden_snapshot_fingerprints_are_exact() {
    let prev: ProjectSnapshot = load_fixture("snapshot-previous.json");
    let a = finalize_project_snapshot(prev.clone()).unwrap();
    let b = finalize_project_snapshot(prev).unwrap();
    assert_eq!(a, b, "same input produces deep-equal snapshot");
    assert_eq!(
        a.fingerprint,
        "sha256:657c0c4d550636ec9f515490a6225c0e9b8f8ba8a2e158e84327c09d016c8ed4"
    );
    assert_eq!(
        a.snapshot_id,
        "snapshot:657c0c4d550636ec9f515490a6225c0e9b8f8ba8a2e158e84327c09d016c8ed4"
    );

    let curr: ProjectSnapshot = load_fixture("snapshot-current.json");
    let c = finalize_project_snapshot(curr).unwrap();
    assert_eq!(
        c.fingerprint,
        "sha256:4d79dd4a5858e17373d55089fc969ce7522e036f70b7805a54655318ca6f991f"
    );
}

#[test]
fn boundary_and_evidence_ref_order_do_not_change_snapshot_fingerprint() {
    let prev: ProjectSnapshot = load_fixture("snapshot-previous.json");
    let mut reordered = prev.clone();
    reordered.source_boundaries.reverse();
    reordered.evidence_refs.reverse();
    assert_eq!(
        finalize_project_snapshot(prev).unwrap().fingerprint,
        finalize_project_snapshot(reordered).unwrap().fingerprint
    );
}

#[test]
fn captured_at_change_alters_snapshot_fingerprint() {
    let prev: ProjectSnapshot = load_fixture("snapshot-previous.json");
    let base = finalize_project_snapshot(prev.clone()).unwrap().fingerprint;
    let mut later = prev;
    later.captured_at = "2099-01-01T00:00:00Z".to_string();
    assert_ne!(finalize_project_snapshot(later).unwrap().fingerprint, base);
}

#[test]
fn placeholder_snapshot_fields_are_ignored() {
    let prev: ProjectSnapshot = load_fixture("snapshot-previous.json");
    // The input fixture carries PLACEHOLDER-IGNORED snapshotId/fingerprint.
    assert!(prev.fingerprint.contains("PLACEHOLDER"));
    let finalized = finalize_project_snapshot(prev).unwrap();
    assert!(!finalized.fingerprint.contains("PLACEHOLDER"));
    assert!(!finalized.snapshot_id.contains("PLACEHOLDER"));
}

#[test]
fn state_fingerprint_computed_helper_matches_finalized() {
    let state: ProjectState = load_fixture("state-unordered.json");
    let normalized =
        oh_my_pm_kernel::projectbrain::fingerprint::normalize_project_state(state).unwrap();
    let computed = compute_state_fingerprint(&normalized).unwrap();
    let finalized = finalize_project_state(load_fixture("state-unordered.json")).unwrap();
    assert_eq!(computed, finalized.state_fingerprint);
}
