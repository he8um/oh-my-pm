//! Deterministic diff / change-classification tests.

mod common;

use std::collections::BTreeSet;

use common::{item, load_fixture, snapshot, state_with_tasks};
use oh_my_pm_kernel::contracts::projectbrain::{
    ChangeCategory, ChangeSet, EvidenceRecord, StateChange, StateItemKind,
};
use oh_my_pm_kernel::projectbrain::diff::{diff_project_snapshots, SnapshotDiffInput};
use oh_my_pm_kernel::projectbrain::freshness::StalenessPolicy;

fn golden_input() -> SnapshotDiffInput {
    SnapshotDiffInput {
        previous: load_fixture("snapshot-previous.json"),
        current: load_fixture("snapshot-current.json"),
        previous_evidence: load_fixture::<Vec<EvidenceRecord>>("evidence-previous.json"),
        current_evidence: load_fixture::<Vec<EvidenceRecord>>("evidence-current.json"),
        compared_at: "2026-03-25T12:00:00Z".to_string(),
        staleness_policy: StalenessPolicy {
            evidence_stale_after_seconds: 432000,
            max_future_skew_seconds: 300,
        },
    }
}

/// G4: the golden diff matches the recorded expected ChangeSet exactly, and is
/// deep-equal on repeat.
#[test]
fn golden_changeset_is_exact_and_deep_equal_on_repeat() {
    let expected: ChangeSet = load_fixture("changes-expected.json");
    let a = diff_project_snapshots(golden_input()).unwrap();
    let b = diff_project_snapshots(golden_input()).unwrap();
    assert_eq!(a, b, "diff is deterministic across runs");
    assert_eq!(a, expected, "diff matches the golden fixture");
}

/// The golden fixture exercises all twelve change categories.
#[test]
fn golden_changeset_covers_all_twelve_categories() {
    let changeset = diff_project_snapshots(golden_input()).unwrap();
    let categories: BTreeSet<String> = changeset
        .changes
        .iter()
        .map(|c| format!("{:?}", c.category))
        .collect();
    assert_eq!(categories.len(), 12, "categories seen: {categories:?}");
}

/// Output ordering is (item-kind rank, item id, category rank).
#[test]
fn changes_are_in_fixed_order() {
    let changeset = diff_project_snapshots(golden_input()).unwrap();
    let keys: Vec<(u8, &str, u8)> = changeset
        .changes
        .iter()
        .map(|c| {
            let kind_rank = match c.item_kind {
                StateItemKind::Milestone => 0,
                StateItemKind::Task => 1,
                StateItemKind::Risk => 2,
                StateItemKind::Decision => 3,
                StateItemKind::Dependency => 4,
                StateItemKind::Blocker => 5,
            };
            let cat_rank = category_rank(&c.category);
            (kind_rank, c.item_id.as_str(), cat_rank)
        })
        .collect();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted);
}

fn category_rank(c: &ChangeCategory) -> u8 {
    match c {
        ChangeCategory::Added => 0,
        ChangeCategory::Removed => 1,
        ChangeCategory::Resolved => 2,
        ChangeCategory::Reopened => 3,
        ChangeCategory::BecameOverdue => 4,
        ChangeCategory::NoLongerOverdue => 5,
        ChangeCategory::SeverityIncreased => 6,
        ChangeCategory::SeverityDecreased => 7,
        ChangeCategory::Fresh => 8,
        ChangeCategory::Stale => 9,
        ChangeCategory::EvidenceChanged => 10,
        ChangeCategory::Modified => 11,
    }
}

fn changes_for<'a>(cs: &'a ChangeSet, id: &str) -> Vec<&'a StateChange> {
    cs.changes.iter().filter(|c| c.item_id == id).collect()
}

fn has_category(cs: &ChangeSet, id: &str, cat: ChangeCategory) -> bool {
    cs.changes
        .iter()
        .any(|c| c.item_id == id && c.category == cat)
}

/// A single item may emit multiple specific categories.
#[test]
fn one_item_can_emit_multiple_categories() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    // t-fresh: evidence age crosses fresh AND its evidence refs changed.
    assert!(has_category(&cs, "t-fresh", ChangeCategory::Fresh));
    assert!(has_category(
        &cs,
        "t-fresh",
        ChangeCategory::EvidenceChanged
    ));
    assert!(changes_for(&cs, "t-fresh").len() >= 2);
}

/// same title + different id => removed + added, never modified.
#[test]
fn same_title_different_id_becomes_removed_and_added() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    assert!(has_category(&cs, "t-rename-old", ChangeCategory::Removed));
    assert!(has_category(&cs, "t-rename-new", ChangeCategory::Added));
    assert!(!has_category(&cs, "t-rename-old", ChangeCategory::Modified));
}

/// same id + different title => a modified change on the matched item.
#[test]
fn same_id_different_title_is_modified() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    let modified = changes_for(&cs, "t-modified");
    assert!(modified
        .iter()
        .any(|c| c.category == ChangeCategory::Modified));
    // No spurious added/removed for a matched item.
    assert!(!has_category(&cs, "t-modified", ChangeCategory::Added));
    assert!(!has_category(&cs, "t-modified", ChangeCategory::Removed));
}

/// A resolved item emits exactly `resolved`, not a redundant `modified`.
#[test]
fn resolved_does_not_emit_redundant_modified() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    let changes = changes_for(&cs, "t-resolve");
    assert!(changes
        .iter()
        .any(|c| c.category == ChangeCategory::Resolved));
    assert!(!changes
        .iter()
        .any(|c| c.category == ChangeCategory::Modified));
}

#[test]
fn added_and_removed_carry_only_one_side() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    let added = changes_for(&cs, "t-added");
    assert_eq!(added.len(), 1);
    assert!(added[0].previous_value.is_none() && added[0].current_value.is_some());
    let removed = changes_for(&cs, "t-removed");
    assert_eq!(removed.len(), 1);
    assert!(removed[0].previous_value.is_some() && removed[0].current_value.is_none());
}

#[test]
fn matched_changes_carry_both_sides() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    for c in changes_for(&cs, "t-resolve") {
        assert!(c.previous_value.is_some() && c.current_value.is_some());
    }
}

#[test]
fn project_mismatch_is_rejected() {
    let mut input = golden_input();
    // Repoint the current snapshot to a different project id.
    input.current.project_id = "project:other".to_string();
    input.current.state.identity.id = "project:other".to_string();
    // Re-point current evidence to the new project so the mismatch is snapshot-level.
    for e in &mut input.current_evidence {
        e.project_id = "project:other".to_string();
    }
    let err = diff_project_snapshots(input).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1004");
}

#[test]
fn missing_evidence_reference_is_rejected() {
    let previous = snapshot("p1", "2026-03-01T00:00:00Z", {
        let mut item = item(StateItemKind::Task, "t", "T");
        item.evidence_refs = vec!["evidence:missing".to_string()];
        state_with_tasks("p1", vec![item])
    });
    let current = snapshot("p1", "2026-03-02T00:00:00Z", state_with_tasks("p1", vec![]));
    let input = SnapshotDiffInput {
        previous,
        current,
        previous_evidence: vec![],
        current_evidence: vec![],
        compared_at: "2026-03-02T00:00:00Z".to_string(),
        staleness_policy: StalenessPolicy {
            evidence_stale_after_seconds: 100,
            max_future_skew_seconds: 0,
        },
    };
    let err = diff_project_snapshots(input).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1006");
}

#[test]
fn identical_snapshots_produce_no_changes() {
    let mut input = golden_input();
    input.current = input.previous.clone();
    input.current_evidence = input.previous_evidence.clone();
    let cs = diff_project_snapshots(input).unwrap();
    assert!(
        cs.changes.is_empty(),
        "unexpected changes: {:?}",
        cs.changes
    );
}

#[test]
fn negative_staleness_threshold_is_rejected() {
    let mut input = golden_input();
    input.staleness_policy.evidence_stale_after_seconds = -1;
    let err = diff_project_snapshots(input).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1002");
}

#[test]
fn expected_changeset_echoes_snapshot_ids_and_compared_at() {
    let cs = diff_project_snapshots(golden_input()).unwrap();
    let expected: ChangeSet = load_fixture("changes-expected.json");
    assert_eq!(cs.previous_snapshot_id, expected.previous_snapshot_id);
    assert_eq!(cs.current_snapshot_id, expected.current_snapshot_id);
    assert_eq!(cs.compared_at, "2026-03-25T12:00:00Z");
    assert_eq!(cs.project_id, "project:acme-atlas");
    assert_eq!(cs.schema_version, 1);
}
