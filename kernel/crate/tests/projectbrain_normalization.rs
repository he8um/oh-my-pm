//! Normalization tests for the pure Project Brain Kernel.

mod common;

use std::collections::BTreeMap;

use common::{item, state_with_tasks};
use oh_my_pm_kernel::contracts::projectbrain::{CanonicalStateItem, StateItemKind};
use oh_my_pm_kernel::projectbrain::fingerprint::normalize_project_state;
use oh_my_pm_kernel::projectbrain::normalize::{
    normalize_display_text, normalize_label, normalize_source_identity, normalize_string_map,
};

#[test]
fn collapses_unicode_whitespace_and_folds_line_endings() {
    assert_eq!(normalize_display_text("  a\t \n b \r\n c  "), "a b c");
    assert_eq!(normalize_display_text("one\r\ntwo"), "one two");
    // A NBSP (U+00A0) is Unicode whitespace and collapses too.
    assert_eq!(normalize_display_text("a\u{00A0}\u{00A0}b"), "a b");
}

#[test]
fn preserves_persian_text_without_transliteration() {
    let input = "  پیاده‌سازی   ورود  ";
    assert_eq!(normalize_display_text(input), "پیاده‌سازی ورود");
    // The zero-width non-joiner between پیاده and سازی is preserved.
    assert!(normalize_display_text(input).contains('\u{200C}'));
}

#[test]
fn lowercases_classification_labels() {
    assert_eq!(normalize_label("In Progress"), "in progress");
    assert_eq!(normalize_label("HIGH"), "high");
    assert_eq!(normalize_label("Critical!"), "critical!"); // punctuation kept
}

#[test]
fn maps_are_sorted_and_keys_lowercased() {
    let mut input = BTreeMap::new();
    input.insert("Zeta".to_string(), "1".to_string());
    input.insert("alpha".to_string(), "2".to_string());
    let out = normalize_string_map(&input, "/m").unwrap();
    let keys: Vec<&String> = out.keys().collect();
    assert_eq!(keys, vec![&"alpha".to_string(), &"zeta".to_string()]);
}

#[test]
fn colliding_normalized_map_keys_are_rejected() {
    let mut input = BTreeMap::new();
    input.insert("Area".to_string(), "1".to_string());
    input.insert("area".to_string(), "2".to_string());
    let err = normalize_string_map(&input, "/m").unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1003");
}

#[test]
fn secret_like_metadata_keys_are_rejected() {
    for key in [
        "token",
        "access-token",
        "Authorization",
        "api_key",
        "commit.sha",
        "diffHunk",
    ] {
        let mut input = BTreeMap::new();
        input.insert(key.to_string(), "x".to_string());
        let err = normalize_string_map(&input, "/m").unwrap_err();
        assert_eq!(err.code, "OMP-K-PB-1008", "key {key} should be rejected");
    }
}

#[test]
fn ordinary_titles_are_not_secret_scanned() {
    // "body" and "secret" as human title words must survive; the guard is on
    // structured map keys only, never on titles.
    assert_eq!(
        normalize_display_text("Body of the secret plan"),
        "Body of the secret plan"
    );
}

#[test]
fn evidence_refs_are_sorted_and_deduplicated() {
    let mut task = item(StateItemKind::Task, "t-1", "Task");
    task.evidence_refs = vec![
        "evidence:b".to_string(),
        "evidence:a".to_string(),
        "evidence:b".to_string(),
    ];
    let state = state_with_tasks("p1", vec![task]);
    let normalized = normalize_project_state(state).unwrap();
    let refs = &normalized.tasks.unwrap()[0].evidence_refs;
    assert_eq!(
        refs,
        &vec!["evidence:a".to_string(), "evidence:b".to_string()]
    );
}

#[test]
fn duplicate_item_ids_within_a_collection_are_rejected() {
    let state = state_with_tasks(
        "p1",
        vec![
            item(StateItemKind::Task, "dup", "First"),
            item(StateItemKind::Task, "dup", "Second"),
        ],
    );
    let err = normalize_project_state(state).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1003");
}

#[test]
fn collection_kind_mismatch_is_rejected() {
    // A risk item placed in the tasks collection is rejected.
    let mismatched: CanonicalStateItem = item(StateItemKind::Risk, "r-1", "Risk");
    let state = state_with_tasks("p1", vec![mismatched]);
    let err = normalize_project_state(state).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1008");
}

#[test]
fn absolute_paths_in_source_identity_are_rejected() {
    for abs in [
        "/Users/someone/repo",
        "/home/someone/repo",
        "C:\\repo",
        "C:/repo",
        "\\\\server\\share",
        "file:///etc/passwd",
    ] {
        let err = normalize_source_identity(abs, "/s").unwrap_err();
        assert_eq!(err.code, "OMP-K-PB-1008", "{abs} should be rejected");
    }
}

#[test]
fn relative_source_identities_are_normalized() {
    assert_eq!(
        normalize_source_identity("./docs//status.md", "/s").unwrap(),
        "docs/status.md"
    );
    assert_eq!(
        normalize_source_identity("docs\\risks.md", "/s").unwrap(),
        "docs/risks.md"
    );
    assert_eq!(normalize_source_identity("docs/", "/s").unwrap(), "docs");
    assert_eq!(normalize_source_identity(".", "/s").unwrap(), ".");
    // Parent-directory segments are rejected.
    assert_eq!(
        normalize_source_identity("../secret", "/s")
            .unwrap_err()
            .code,
        "OMP-K-PB-1008"
    );
}

#[test]
fn oversized_id_is_rejected() {
    let mut task = item(StateItemKind::Task, &"x".repeat(257), "Task");
    task.title = "Task".to_string();
    let state = state_with_tasks("p1", vec![task]);
    let err = normalize_project_state(state).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1009");
}

#[test]
fn wrong_schema_version_is_rejected() {
    let mut state = state_with_tasks("p1", vec![]);
    state.schema_version = 2;
    let err = normalize_project_state(state).unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1001");
}
