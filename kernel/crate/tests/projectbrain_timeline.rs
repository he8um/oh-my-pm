//! Deterministic Project Timeline derivation tests (v0.4).
//!
//! Cover the empty/one/two/many-capture shapes, repeated identical snapshots,
//! multiple events in one capture, equal timestamps with distinct capture
//! sequences, deterministic ids and ordering, category/kind/combined filtering,
//! beforeSequence pagination, the limit bounds, and byte-stable serialization.

mod common;

use common::load_fixture;
use oh_my_pm_kernel::contracts::projectbrain::{
    CanonicalStateItem, ChangeCategory, ChangeSet, StateChange, StateItemKind, TimelineQuery,
    TimelineResult,
};
use oh_my_pm_kernel::projectbrain::timeline::{
    derive_project_timeline, TimelineCapture, TimelineDerivationInput, DEFAULT_TIMELINE_LIMIT,
    MAX_TIMELINE_LIMIT,
};
use serde::Deserialize;

const PROJECT: &str = "pb_timeline_project";

fn item(kind: StateItemKind, id: &str, title: &str) -> CanonicalStateItem {
    CanonicalStateItem {
        kind,
        id: id.to_string(),
        title: title.to_string(),
        evidence_refs: vec!["ev_1".to_string(), "ev_2".to_string()],
        status: Some("open".to_string()),
        severity: Some("high".to_string()),
        owner: Some("someone".to_string()),
        due_date: Some("2026-09-01".to_string()),
        priority: Some("p1".to_string()),
        metadata: None,
    }
}

fn change(category: ChangeCategory, kind: StateItemKind, id: &str) -> StateChange {
    StateChange {
        category,
        item_kind: kind.clone(),
        item_id: id.to_string(),
        evidence_refs: vec!["ev_1".to_string(), "ev_2".to_string()],
        previous_value: None,
        current_value: Some(item(kind, id, "Some title")),
    }
}

fn change_set(previous: &str, current: &str, changes: Vec<StateChange>) -> ChangeSet {
    ChangeSet {
        project_id: PROJECT.to_string(),
        previous_snapshot_id: previous.to_string(),
        current_snapshot_id: current.to_string(),
        compared_at: "2026-03-01T00:00:00Z".to_string(),
        changes,
        schema_version: 1,
    }
}

fn capture(sequence: i64, captured_at: &str, changes: Vec<StateChange>) -> TimelineCapture {
    let current = format!("snap_{sequence}");
    let previous = format!("snap_{}", sequence - 1);
    TimelineCapture {
        snapshot_id: current.clone(),
        capture_sequence: sequence,
        captured_at: captured_at.to_string(),
        change_set: change_set(&previous, &current, changes),
    }
}

fn query(project_id: &str) -> TimelineQuery {
    TimelineQuery {
        project_id: project_id.to_string(),
        limit: None,
        before_sequence: None,
        category: None,
        kind: None,
    }
}

fn derive(captures: Vec<TimelineCapture>, query: TimelineQuery) -> TimelineResult {
    derive_project_timeline(&TimelineDerivationInput { captures, query }).unwrap()
}

// --- empty / degenerate shapes ---------------------------------------------

/// Zero snapshots produce zero adjacent pairs, so the timeline is empty and
/// valid — not a failure.
#[test]
fn zero_captures_return_an_empty_valid_timeline() {
    let result = derive(vec![], query(PROJECT));
    assert_eq!(result.project_id, PROJECT);
    assert_eq!(result.event_count, 0);
    assert!(result.events.is_empty());
    assert!(!result.has_more);
    assert_eq!(result.next_before_sequence, None);
}

/// One snapshot has no predecessor, so the Runtime supplies zero comparisons and
/// the timeline is empty and valid.
#[test]
fn one_snapshot_returns_an_empty_valid_timeline() {
    // A single committed snapshot yields no adjacent pair at all.
    let result = derive(vec![], query(PROJECT));
    assert_eq!(result.event_count, 0);
    assert!(!result.has_more);
}

/// Identical adjacent snapshots diff to zero changes, so they contribute no
/// events and do not occupy a page slot.
#[test]
fn identical_adjacent_snapshots_produce_no_events() {
    let captures = vec![
        capture(2, "2026-03-02T00:00:00Z", vec![]),
        capture(3, "2026-03-03T00:00:00Z", vec![]),
    ];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 0);
    assert!(result.events.is_empty());
    assert!(!result.has_more);
    assert_eq!(result.next_before_sequence, None);
}

// --- basic derivation -------------------------------------------------------

/// Two snapshots (one comparison) produce that comparison's events.
#[test]
fn two_snapshots_produce_one_captures_events() {
    let captures = vec![capture(
        2,
        "2026-03-02T00:00:00Z",
        vec![change(ChangeCategory::Added, StateItemKind::Task, "task_a")],
    )];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 1);
    let event = &result.events[0];
    assert_eq!(event.project_id, PROJECT);
    assert_eq!(event.snapshot_id, "snap_2");
    assert_eq!(event.capture_sequence, 2);
    assert_eq!(event.event_sequence, 0);
    assert_eq!(event.captured_at, "2026-03-02T00:00:00Z");
    assert_eq!(event.category, ChangeCategory::Added);
    assert_eq!(event.kind, StateItemKind::Task);
    assert_eq!(event.subject_id, "task_a");
    assert_eq!(event.evidence_count, 2);
    assert_eq!(event.title.as_deref(), Some("Some title"));
    assert_eq!(event.status.as_deref(), Some("open"));
    assert_eq!(event.severity.as_deref(), Some("high"));
    assert_eq!(event.due_date.as_deref(), Some("2026-09-01"));
}

/// The event carries a COUNT of evidence, never the evidence ids themselves, and
/// never the owner/priority/metadata fields present on the source item.
#[test]
fn events_expose_only_the_allowlisted_projection() {
    let captures = vec![capture(
        2,
        "2026-03-02T00:00:00Z",
        vec![change(ChangeCategory::Added, StateItemKind::Risk, "risk_a")],
    )];
    let result = derive(captures, query(PROJECT));
    let serialized = serde_json::to_string(&result).unwrap();
    for forbidden in ["ev_1", "ev_2", "evidenceRefs", "owner", "priority", "someone", "p1"] {
        assert!(
            !serialized.contains(forbidden),
            "serialized timeline leaked \"{forbidden}\": {serialized}"
        );
    }
    // The count is present and correct.
    assert!(serialized.contains("\"evidenceCount\":2"));
}

/// Many captures are all consumed, newest capture first, and each event keeps a
/// contiguous 0-based sequence within its own capture.
#[test]
fn many_captures_are_ordered_newest_capture_first() {
    let captures = (2..=6)
        .map(|seq| {
            capture(
                seq,
                &format!("2026-03-{seq:02}T00:00:00Z"),
                vec![change(
                    ChangeCategory::Added,
                    StateItemKind::Task,
                    &format!("task_{seq}"),
                )],
            )
        })
        .collect();
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 5);
    let sequences: Vec<i64> = result.events.iter().map(|e| e.capture_sequence).collect();
    assert_eq!(sequences, vec![6, 5, 4, 3, 2], "newest capture first");
    for event in &result.events {
        assert_eq!(event.event_sequence, 0, "one change per capture here");
    }
}

/// Several changes in one capture all become events of that capture, with
/// contiguous ascending event sequences in the Kernel's deterministic order.
#[test]
fn multiple_events_in_one_capture_get_contiguous_sequences() {
    let captures = vec![capture(
        2,
        "2026-03-02T00:00:00Z",
        vec![
            change(ChangeCategory::Added, StateItemKind::Task, "task_b"),
            change(ChangeCategory::Added, StateItemKind::Task, "task_a"),
            change(ChangeCategory::Resolved, StateItemKind::Risk, "risk_a"),
        ],
    )];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 3);
    let sequences: Vec<i64> = result.events.iter().map(|e| e.event_sequence).collect();
    assert_eq!(sequences, vec![0, 1, 2], "contiguous within the capture");
    // Deterministic order is (item-kind rank, item id, category rank): both
    // tasks precede the risk, and task_a precedes task_b.
    let subjects: Vec<&str> = result.events.iter().map(|e| e.subject_id.as_str()).collect();
    assert_eq!(subjects, vec!["task_a", "task_b", "risk_a"]);
}

/// Two captures may share a capturedAt; their distinct capture sequences still
/// order them exactly. capturedAt is never a sort key.
#[test]
fn equal_timestamps_with_distinct_sequences_still_order_exactly() {
    let same = "2026-03-02T00:00:00Z";
    let captures = vec![
        capture(
            2,
            same,
            vec![change(ChangeCategory::Added, StateItemKind::Task, "task_x")],
        ),
        capture(
            3,
            same,
            vec![change(ChangeCategory::Added, StateItemKind::Task, "task_y")],
        ),
    ];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 2);
    assert_eq!(result.events[0].capture_sequence, 3);
    assert_eq!(result.events[1].capture_sequence, 2);
    assert_eq!(result.events[0].captured_at, result.events[1].captured_at);
}

// --- determinism -----------------------------------------------------------

fn three_capture_fixture() -> Vec<TimelineCapture> {
    vec![
        capture(
            2,
            "2026-03-02T00:00:00Z",
            vec![
                change(ChangeCategory::Added, StateItemKind::Task, "task_a"),
                change(ChangeCategory::Added, StateItemKind::Risk, "risk_a"),
            ],
        ),
        capture(
            3,
            "2026-03-03T00:00:00Z",
            vec![change(ChangeCategory::Resolved, StateItemKind::Task, "task_a")],
        ),
        capture(
            4,
            "2026-03-04T00:00:00Z",
            vec![
                change(ChangeCategory::Stale, StateItemKind::Risk, "risk_a"),
                change(ChangeCategory::Added, StateItemKind::Blocker, "blk_a"),
            ],
        ),
    ]
}

/// The same inputs produce a byte-identical serialization.
#[test]
fn derivation_is_byte_identical_on_repeat() {
    let a = derive(three_capture_fixture(), query(PROJECT));
    let b = derive(three_capture_fixture(), query(PROJECT));
    assert_eq!(a, b);
    assert_eq!(
        serde_json::to_string(&a).unwrap(),
        serde_json::to_string(&b).unwrap(),
        "canonical serialization is byte-stable"
    );
}

/// Event ids are deterministic and distinguish distinct events.
#[test]
fn event_ids_are_deterministic_and_distinct() {
    let a = derive(three_capture_fixture(), query(PROJECT));
    let b = derive(three_capture_fixture(), query(PROJECT));
    let ids_a: Vec<&str> = a.events.iter().map(|e| e.event_id.as_str()).collect();
    let ids_b: Vec<&str> = b.events.iter().map(|e| e.event_id.as_str()).collect();
    assert_eq!(ids_a, ids_b, "ids are stable across runs");
    let unique: std::collections::BTreeSet<&str> = ids_a.iter().copied().collect();
    assert_eq!(unique.len(), ids_a.len(), "distinct events have distinct ids");
    for id in &ids_a {
        assert!(id.starts_with("event:sha256:"), "unexpected id form: {id}");
        assert_eq!(id.len(), "event:sha256:".len() + 64);
    }
}

/// An event's id does not depend on which filter the caller passed: filtering
/// selects events, it never renumbers or re-identifies them.
#[test]
fn event_ids_are_filter_independent() {
    let unfiltered = derive(three_capture_fixture(), query(PROJECT));
    let mut filtered_query = query(PROJECT);
    filtered_query.kind = Some(StateItemKind::Risk);
    let filtered = derive(three_capture_fixture(), filtered_query);

    for event in &filtered.events {
        let matching = unfiltered
            .events
            .iter()
            .find(|e| e.subject_id == event.subject_id && e.capture_sequence == event.capture_sequence)
            .expect("a filtered event also appears unfiltered");
        assert_eq!(matching.event_id, event.event_id);
        assert_eq!(matching.event_sequence, event.event_sequence);
    }
}

// --- filtering -------------------------------------------------------------

/// A category filter keeps only that category, deterministically.
#[test]
fn category_filter_is_deterministic() {
    let mut q = query(PROJECT);
    q.category = Some(ChangeCategory::Added);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.event_count, 3);
    for event in &result.events {
        assert_eq!(event.category, ChangeCategory::Added);
    }
}

/// A kind filter keeps only that item kind.
#[test]
fn kind_filter_is_deterministic() {
    let mut q = query(PROJECT);
    q.kind = Some(StateItemKind::Risk);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.event_count, 2);
    for event in &result.events {
        assert_eq!(event.kind, StateItemKind::Risk);
    }
}

/// Category and kind combine as a conjunction.
#[test]
fn combined_filters_conjoin() {
    let mut q = query(PROJECT);
    q.category = Some(ChangeCategory::Added);
    q.kind = Some(StateItemKind::Risk);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.event_count, 1);
    assert_eq!(result.events[0].subject_id, "risk_a");
    assert_eq!(result.events[0].capture_sequence, 2);
}

/// A filter that matches nothing yields an empty, valid, non-paginated result.
#[test]
fn a_filter_matching_nothing_yields_an_empty_result() {
    let mut q = query(PROJECT);
    q.category = Some(ChangeCategory::BecameOverdue);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.event_count, 0);
    assert!(!result.has_more);
    assert_eq!(result.next_before_sequence, None);
}

/// Filtering happens BEFORE the limit is taken: a small limit over a filtered
/// timeline still returns filtered events rather than being consumed by
/// filtered-out ones.
#[test]
fn filters_apply_before_the_limit() {
    let mut q = query(PROJECT);
    q.kind = Some(StateItemKind::Risk);
    q.limit = Some(1);
    let result = derive(three_capture_fixture(), q);
    // Capture 4 holds the newest matching risk event.
    assert_eq!(result.event_count, 1);
    assert_eq!(result.events[0].kind, StateItemKind::Risk);
    assert_eq!(result.events[0].capture_sequence, 4);
    assert!(result.has_more, "the capture-2 risk event remains");
    assert_eq!(result.next_before_sequence, Some(4));
}

// --- pagination ------------------------------------------------------------

/// beforeSequence excludes every capture at or above the bound.
#[test]
fn before_sequence_excludes_the_bound_and_above() {
    let mut q = query(PROJECT);
    q.before_sequence = Some(4);
    let result = derive(three_capture_fixture(), q);
    for event in &result.events {
        assert!(event.capture_sequence < 4);
    }
    assert_eq!(result.events[0].capture_sequence, 3);
}

/// Walking every page with nextBeforeSequence visits each event exactly once:
/// no duplicate, no skip.
#[test]
fn pagination_never_duplicates_or_skips() {
    let full = derive(three_capture_fixture(), query(PROJECT));
    let mut seen: Vec<String> = Vec::new();
    let mut before: Option<i64> = None;
    loop {
        let mut q = query(PROJECT);
        q.limit = Some(1);
        q.before_sequence = before;
        let page = derive(three_capture_fixture(), q);
        for event in &page.events {
            seen.push(event.event_id.clone());
        }
        if !page.has_more {
            assert_eq!(page.next_before_sequence, None);
            break;
        }
        let next = page.next_before_sequence.expect("hasMore implies a cursor");
        assert!(
            before.is_none() || next < before.unwrap(),
            "the cursor must strictly advance"
        );
        before = Some(next);
    }
    let expected: Vec<String> = full.events.iter().map(|e| e.event_id.clone()).collect();
    assert_eq!(seen, expected, "every event exactly once, in order");
    let unique: std::collections::BTreeSet<&String> = seen.iter().collect();
    assert_eq!(unique.len(), seen.len(), "no duplicate across pages");
}

/// A page never splits a capture: at least one whole capture is returned even
/// when its event count exceeds the limit, and the count is reported truthfully.
#[test]
fn a_page_never_splits_a_capture() {
    let captures = vec![capture(
        2,
        "2026-03-02T00:00:00Z",
        vec![
            change(ChangeCategory::Added, StateItemKind::Task, "task_a"),
            change(ChangeCategory::Added, StateItemKind::Task, "task_b"),
            change(ChangeCategory::Added, StateItemKind::Task, "task_c"),
        ],
    )];
    let mut q = query(PROJECT);
    q.limit = Some(1);
    let result = derive(captures, q);
    assert_eq!(result.event_count, 3, "the whole capture is returned");
    assert_eq!(result.events.len(), 3);
    assert!(!result.has_more);
}

/// hasMore is false and the cursor absent when the page covers everything.
#[test]
fn has_more_is_false_when_the_page_is_complete() {
    let result = derive(three_capture_fixture(), query(PROJECT));
    assert_eq!(result.event_count, 5);
    assert!(!result.has_more);
    assert_eq!(result.next_before_sequence, None);
}

// --- limits ---------------------------------------------------------------

/// An omitted limit uses the documented default.
#[test]
fn default_limit_is_twenty() {
    assert_eq!(DEFAULT_TIMELINE_LIMIT, 20);
    let captures: Vec<TimelineCapture> = (2..=30)
        .map(|seq| {
            capture(
                seq,
                "2026-03-02T00:00:00Z",
                vec![change(
                    ChangeCategory::Added,
                    StateItemKind::Task,
                    &format!("task_{seq}"),
                )],
            )
        })
        .collect();
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, DEFAULT_TIMELINE_LIMIT);
    assert!(result.has_more);
}

/// limit = 1 returns exactly the newest capture.
#[test]
fn limit_one_returns_the_newest_capture_only() {
    let mut q = query(PROJECT);
    q.limit = Some(1);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.events[0].capture_sequence, 4);
    assert!(result.has_more);
    assert_eq!(result.next_before_sequence, Some(4));
}

/// limit = 100 is accepted and bounds the page.
#[test]
fn limit_one_hundred_is_accepted() {
    let captures: Vec<TimelineCapture> = (2..=150)
        .map(|seq| {
            capture(
                seq,
                "2026-03-02T00:00:00Z",
                vec![change(
                    ChangeCategory::Added,
                    StateItemKind::Task,
                    &format!("task_{seq}"),
                )],
            )
        })
        .collect();
    let mut q = query(PROJECT);
    q.limit = Some(MAX_TIMELINE_LIMIT);
    let result = derive(captures, q);
    assert_eq!(result.event_count, MAX_TIMELINE_LIMIT);
    assert!(result.has_more);
}

/// A limit outside 1..100 is a controlled validation failure.
#[test]
fn invalid_limits_are_rejected() {
    for invalid in [0i64, -1, 101, 1_000_000] {
        let mut q = query(PROJECT);
        q.limit = Some(invalid);
        let err = derive_project_timeline(&TimelineDerivationInput {
            captures: three_capture_fixture(),
            query: q,
        })
        .expect_err("an out-of-range limit must fail");
        assert_eq!(err.code, "OMP-K-PB-1002");
        assert_eq!(err.path.as_deref(), Some("/timelineQuery/limit"));
    }
}

/// A negative beforeSequence is a controlled validation failure.
#[test]
fn negative_before_sequence_is_rejected() {
    let mut q = query(PROJECT);
    q.before_sequence = Some(-1);
    let err = derive_project_timeline(&TimelineDerivationInput {
        captures: three_capture_fixture(),
        query: q,
    })
    .expect_err("a negative beforeSequence must fail");
    assert_eq!(err.path.as_deref(), Some("/timelineQuery/beforeSequence"));
}

/// beforeSequence = 0 excludes everything (sequences start at 1) and is valid.
#[test]
fn before_sequence_zero_is_valid_and_empty() {
    let mut q = query(PROJECT);
    q.before_sequence = Some(0);
    let result = derive(three_capture_fixture(), q);
    assert_eq!(result.event_count, 0);
    assert!(!result.has_more);
}

/// An empty project id is a controlled validation failure.
#[test]
fn empty_project_id_is_rejected() {
    let err = derive_project_timeline(&TimelineDerivationInput {
        captures: vec![],
        query: query("   "),
    })
    .expect_err("a blank projectId must fail");
    assert_eq!(err.path.as_deref(), Some("/timelineQuery/projectId"));
}

// --- chronology integrity -------------------------------------------------

/// A non-ascending capture chronology is rejected rather than silently sorted:
/// the caller's chronology is authoritative and must already be exact.
#[test]
fn non_ascending_chronology_is_rejected() {
    let captures = vec![
        capture(3, "2026-03-03T00:00:00Z", vec![]),
        capture(2, "2026-03-02T00:00:00Z", vec![]),
    ];
    let err = derive_project_timeline(&TimelineDerivationInput {
        captures,
        query: query(PROJECT),
    })
    .expect_err("a descending chronology must fail");
    assert_eq!(
        err.path.as_deref(),
        Some("/timeline/captures/captureSequence")
    );
}

/// A duplicated capture sequence is rejected.
#[test]
fn duplicate_capture_sequence_is_rejected() {
    let captures = vec![
        capture(2, "2026-03-02T00:00:00Z", vec![]),
        capture(2, "2026-03-02T00:00:00Z", vec![]),
    ];
    assert!(derive_project_timeline(&TimelineDerivationInput {
        captures,
        query: query(PROJECT),
    })
    .is_err());
}

/// A capture sequence below 1 is rejected (the chronology is 1-based).
#[test]
fn zero_capture_sequence_is_rejected() {
    let captures = vec![capture(0, "2026-03-02T00:00:00Z", vec![])];
    assert!(derive_project_timeline(&TimelineDerivationInput {
        captures,
        query: query(PROJECT),
    })
    .is_err());
}

/// A ChangeSet belonging to another project is rejected: a timeline never mixes
/// projects.
#[test]
fn a_foreign_project_change_set_is_rejected() {
    let mut capture_one = capture(2, "2026-03-02T00:00:00Z", vec![]);
    capture_one.change_set.project_id = "some_other_project".to_string();
    let err = derive_project_timeline(&TimelineDerivationInput {
        captures: vec![capture_one],
        query: query(PROJECT),
    })
    .expect_err("a foreign project must fail");
    assert_eq!(
        err.path.as_deref(),
        Some("/timeline/captures/changeSet/projectId")
    );
}

/// A removal has no current value; the presented fields fall back to the
/// previous value so a removed subject is still identifiable.
#[test]
fn a_removal_presents_the_previous_value() {
    let mut removal = change(ChangeCategory::Removed, StateItemKind::Task, "task_gone");
    removal.current_value = None;
    removal.previous_value = Some(item(StateItemKind::Task, "task_gone", "Removed title"));
    let captures = vec![capture(2, "2026-03-02T00:00:00Z", vec![removal])];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 1);
    assert_eq!(result.events[0].title.as_deref(), Some("Removed title"));
    assert_eq!(result.events[0].category, ChangeCategory::Removed);
}

/// A change with neither value still produces a valid event with no presented
/// optional fields.
#[test]
fn a_change_without_values_produces_a_valueless_event() {
    let mut bare = change(ChangeCategory::EvidenceChanged, StateItemKind::Decision, "dec_a");
    bare.current_value = None;
    bare.previous_value = None;
    let captures = vec![capture(2, "2026-03-02T00:00:00Z", vec![bare])];
    let result = derive(captures, query(PROJECT));
    assert_eq!(result.event_count, 1);
    assert_eq!(result.events[0].title, None);
    assert_eq!(result.events[0].status, None);
    assert_eq!(result.events[0].severity, None);
    assert_eq!(result.events[0].due_date, None);
    assert_eq!(result.events[0].subject_id, "dec_a");
}

// --- cross-language fixture parity -----------------------------------------

/// The committed golden fixture, shared with the TypeScript binding test.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineFixture {
    input: TimelineFixtureInput,
    expected: TimelineResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineFixtureInput {
    captures: Vec<TimelineFixtureCapture>,
    query: TimelineQuery,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineFixtureCapture {
    snapshot_id: String,
    capture_sequence: i64,
    captured_at: String,
    change_set: ChangeSet,
}

/// The native derivation reproduces the committed golden fixture exactly. The
/// TypeScript binding test asserts the SAME fixture through the WASM boundary,
/// so a divergence between the two languages fails one of the two tests.
#[test]
fn golden_fixture_matches_across_languages() {
    let fixture: TimelineFixture = load_fixture("timeline-expected.json");
    let input = TimelineDerivationInput {
        captures: fixture
            .input
            .captures
            .into_iter()
            .map(|c| TimelineCapture {
                snapshot_id: c.snapshot_id,
                capture_sequence: c.capture_sequence,
                captured_at: c.captured_at,
                change_set: c.change_set,
            })
            .collect(),
        query: fixture.input.query,
    };
    let actual = derive_project_timeline(&input).unwrap();
    assert_eq!(actual, fixture.expected, "native derivation matches the fixture");
}
