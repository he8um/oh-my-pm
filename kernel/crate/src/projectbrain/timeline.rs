//! Pure, deterministic Project Timeline derivation (v0.4).
//!
//! Converts a sequence of already-computed [`ChangeSet`]s — one per adjacent
//! committed-snapshot pair, supplied in authoritative capture order — into a
//! bounded, filtered, paginated timeline of sanitized [`TimelineEvent`]s.
//!
//! This module performs **no I/O of any kind**: no filesystem, network,
//! environment, system clock, or randomness. Every timestamp and capture
//! ordinal is caller-injected. The same valid input produces a byte-identical
//! [`TimelineResult`] on every platform.
//!
//! It also performs no persistence: a timeline is recomputed per query and has
//! no on-disk representation.

use super::canonical::{fingerprint_hex, CanonicalValue};
use super::diff::category_rank;
use super::error::{ProjectBrainError, OMP_K_PB_INVALID_FIELD};
use super::fingerprint::state_item_kind_rank;
use super::limits::MAX_TIMELINE_CAPTURES;

use crate::contracts::projectbrain::{
    ChangeCategory, ChangeSet, StateChange, StateItemKind, TimelineEvent, TimelineQuery,
    TimelineResult,
};

/// Domain separator for deterministic timeline event ids.
pub const TIMELINE_EVENT_DOMAIN: &str = "oh-my-pm:projectbrain:v1:timeline-event";

/// Default page size when a query omits `limit`.
pub const DEFAULT_TIMELINE_LIMIT: i64 = 20;
/// Inclusive minimum page size.
pub const MIN_TIMELINE_LIMIT: i64 = 1;
/// Inclusive maximum page size.
pub const MAX_TIMELINE_LIMIT: i64 = 100;

/// One adjacent committed-snapshot comparison, attributed to the capture that
/// produced it. This is an internal Kernel input type, not a public contract.
///
/// `capture_sequence` and `captured_at` describe the **current** snapshot of the
/// pair — the capture that first observed the changes. They come from the store's
/// authoritative chronology and are never derived from a lexical id order or a
/// fresh clock read.
#[derive(Debug, Clone)]
pub struct TimelineCapture {
    /// Id of the current snapshot of the adjacent pair.
    pub snapshot_id: String,
    /// The current snapshot's contiguous 1-based capture ordinal.
    pub capture_sequence: i64,
    /// The current snapshot's authoritative capture timestamp.
    pub captured_at: String,
    /// The deterministic diff between the previous and current snapshot.
    pub change_set: ChangeSet,
}

/// Pure input to [`derive_project_timeline`].
#[derive(Debug, Clone)]
pub struct TimelineDerivationInput {
    /// Adjacent comparisons in authoritative capture order, oldest first.
    pub captures: Vec<TimelineCapture>,
    /// The validated, bounded query.
    pub query: TimelineQuery,
}

fn invalid(message: &str, pointer: &str) -> ProjectBrainError {
    ProjectBrainError::at(OMP_K_PB_INVALID_FIELD, message, pointer)
}

/// Resolve and validate the effective page size from an optional query limit.
fn resolve_limit(limit: Option<i64>) -> Result<i64, ProjectBrainError> {
    match limit {
        None => Ok(DEFAULT_TIMELINE_LIMIT),
        Some(value) => {
            if value < MIN_TIMELINE_LIMIT || value > MAX_TIMELINE_LIMIT {
                return Err(invalid(
                    "limit must be between 1 and 100",
                    "/timelineQuery/limit",
                ));
            }
            Ok(value)
        }
    }
}

/// Validate the query's own fields. Filters are validated by construction (the
/// contract types are closed enums), so only the numeric bounds and the required
/// project id need checking here.
fn validate_query(query: &TimelineQuery) -> Result<i64, ProjectBrainError> {
    if query.project_id.trim().is_empty() {
        return Err(invalid(
            "projectId must be a non-empty string",
            "/timelineQuery/projectId",
        ));
    }
    if let Some(before) = query.before_sequence {
        if before < 0 {
            return Err(invalid(
                "beforeSequence must be a non-negative integer",
                "/timelineQuery/beforeSequence",
            ));
        }
    }
    resolve_limit(query.limit)
}

/// Validate the injected capture chronology: bounded, strictly ascending
/// sequences, positive ordinals, and a project id matching the query.
fn validate_captures(
    captures: &[TimelineCapture],
    project_id: &str,
) -> Result<(), ProjectBrainError> {
    if captures.len() > MAX_TIMELINE_CAPTURES {
        return Err(invalid(
            "the capture chronology exceeds the maximum permitted length",
            "/timeline/captures",
        ));
    }
    let mut previous: Option<i64> = None;
    for capture in captures {
        if capture.capture_sequence < 1 {
            return Err(invalid(
                "a capture sequence must be a positive integer",
                "/timeline/captures/captureSequence",
            ));
        }
        if let Some(prior) = previous {
            if capture.capture_sequence <= prior {
                return Err(invalid(
                    "capture sequences must be strictly ascending in chronology order",
                    "/timeline/captures/captureSequence",
                ));
            }
        }
        previous = Some(capture.capture_sequence);
        if capture.snapshot_id.trim().is_empty() {
            return Err(invalid(
                "a capture snapshot id must be a non-empty string",
                "/timeline/captures/snapshotId",
            ));
        }
        if capture.change_set.project_id != project_id {
            return Err(invalid(
                "a capture change set belongs to a different project",
                "/timeline/captures/changeSet/projectId",
            ));
        }
    }
    Ok(())
}

/// The stable wire label for a change category. Kept explicit so an event id
/// never depends on a serde rename that could drift.
fn category_wire(category: &ChangeCategory) -> &'static str {
    match category {
        ChangeCategory::Added => "added",
        ChangeCategory::Removed => "removed",
        ChangeCategory::Modified => "modified",
        ChangeCategory::Resolved => "resolved",
        ChangeCategory::Reopened => "reopened",
        ChangeCategory::BecameOverdue => "becameOverdue",
        ChangeCategory::NoLongerOverdue => "noLongerOverdue",
        ChangeCategory::SeverityIncreased => "severityIncreased",
        ChangeCategory::SeverityDecreased => "severityDecreased",
        ChangeCategory::Fresh => "fresh",
        ChangeCategory::Stale => "stale",
        ChangeCategory::EvidenceChanged => "evidenceChanged",
    }
}

/// The stable wire label for an item kind.
fn kind_wire(kind: &StateItemKind) -> &'static str {
    match kind {
        StateItemKind::Milestone => "milestone",
        StateItemKind::Task => "task",
        StateItemKind::Risk => "risk",
        StateItemKind::Decision => "decision",
        StateItemKind::Dependency => "dependency",
        StateItemKind::Blocker => "blocker",
    }
}

fn optional(value: &Option<String>) -> CanonicalValue {
    match value {
        None => CanonicalValue::Null,
        Some(text) => CanonicalValue::str(text.clone()),
    }
}

/// Derive the deterministic event id from canonical, domain-separated inputs.
///
/// The id covers exactly the event's identity and payload, so two events with
/// identical content in identical positions share an id and any difference in
/// subject, category, position, or presented value changes it.
fn derive_event_id(event: &TimelineEventDraft) -> Result<String, ProjectBrainError> {
    let mut entries: Vec<(String, CanonicalValue)> = Vec::new();
    entries.push(("projectId".into(), CanonicalValue::str(event.project_id.clone())));
    entries.push(("snapshotId".into(), CanonicalValue::str(event.snapshot_id.clone())));
    entries.push((
        "captureSequence".into(),
        CanonicalValue::Int(event.capture_sequence),
    ));
    entries.push((
        "eventSequence".into(),
        CanonicalValue::Int(event.event_sequence),
    ));
    entries.push(("capturedAt".into(), CanonicalValue::str(event.captured_at.clone())));
    entries.push((
        "category".into(),
        CanonicalValue::str(category_wire(&event.category)),
    ));
    entries.push(("kind".into(), CanonicalValue::str(kind_wire(&event.kind))));
    entries.push(("subjectId".into(), CanonicalValue::str(event.subject_id.clone())));
    entries.push((
        "evidenceCount".into(),
        CanonicalValue::Int(event.evidence_count),
    ));
    entries.push(("title".into(), optional(&event.title)));
    entries.push(("status".into(), optional(&event.status)));
    entries.push(("severity".into(), optional(&event.severity)));
    entries.push(("dueDate".into(), optional(&event.due_date)));

    let value = CanonicalValue::Object(entries.into_iter().collect());
    let hex = fingerprint_hex(TIMELINE_EVENT_DOMAIN, &value)?;
    Ok(format!("event:sha256:{hex}"))
}

/// An event before its id is derived.
struct TimelineEventDraft {
    project_id: String,
    snapshot_id: String,
    capture_sequence: i64,
    event_sequence: i64,
    captured_at: String,
    category: ChangeCategory,
    kind: StateItemKind,
    subject_id: String,
    evidence_count: i64,
    title: Option<String>,
    status: Option<String>,
    severity: Option<String>,
    due_date: Option<String>,
}

/// Project one [`StateChange`] to the allow-listed event payload.
///
/// The presented `title`, `status`, `severity`, and `dueDate` come from the
/// change's **current** value when present, falling back to the previous value
/// (a removal has no current value). Nothing else crosses this boundary: no raw
/// evidence, no evidence ids, no unrestricted previous/current objects, no
/// metadata map, no owner, no priority, no path.
fn project_change(
    change: &StateChange,
    capture: &TimelineCapture,
    project_id: &str,
    event_sequence: i64,
) -> TimelineEventDraft {
    let presented = change
        .current_value
        .as_ref()
        .or(change.previous_value.as_ref());
    let title = presented.map(|item| item.title.clone());
    let status = presented.and_then(|item| item.status.clone());
    let severity = presented.and_then(|item| item.severity.clone());
    let due_date = presented.and_then(|item| item.due_date.clone());
    TimelineEventDraft {
        project_id: project_id.to_string(),
        snapshot_id: capture.snapshot_id.clone(),
        capture_sequence: capture.capture_sequence,
        event_sequence,
        captured_at: capture.captured_at.clone(),
        category: change.category.clone(),
        kind: change.item_kind.clone(),
        subject_id: change.item_id.clone(),
        // A count only. Evidence ids never reach a TimelineEvent.
        evidence_count: change.evidence_refs.len() as i64,
        title,
        status,
        severity,
        due_date,
    }
}

/// Whether a change passes the query's category and kind filters. Both filters
/// are independent and combine as a conjunction.
fn passes_filters(change: &StateChange, query: &TimelineQuery) -> bool {
    if let Some(category) = query.category.as_ref() {
        if &change.category != category {
            return false;
        }
    }
    if let Some(kind) = query.kind.as_ref() {
        if &change.item_kind != kind {
            return false;
        }
    }
    true
}

/// One capture's derived, filtered events, ready for pagination.
struct DerivedCapture {
    capture_sequence: i64,
    events: Vec<TimelineEvent>,
}

/// Derive a bounded, filtered, newest-first [`TimelineResult`].
///
/// Deterministic rules, in order:
///
/// 1. captures are consumed in authoritative capture order (strictly ascending
///    `captureSequence`), never a lexical snapshot-id order and never a
///    timestamp comparison;
/// 2. within a capture, changes keep the Kernel diff's deterministic order, and
///    each receives a contiguous 0-based `eventSequence`;
/// 3. `beforeSequence` excludes every capture whose sequence is not strictly
///    lower, so a page boundary is exact;
/// 4. category and kind filters are applied **before** the limit is taken, so a
///    page is never short because filtered-out events consumed its budget;
/// 5. pagination consumes whole captures newest-first, so a capture is never
///    split across pages; at least one capture is always returned when any
///    eligible event exists;
/// 6. `hasMore` is true exactly when an eligible event remains below the page,
///    and `nextBeforeSequence` is then the page's lowest `captureSequence`.
pub fn derive_project_timeline(
    input: &TimelineDerivationInput,
) -> Result<TimelineResult, ProjectBrainError> {
    let query = &input.query;
    let limit = validate_query(query)?;
    validate_captures(&input.captures, &query.project_id)?;

    // Derive every eligible capture's events. Eligibility is the beforeSequence
    // bound; the filters then apply within each capture.
    let mut derived: Vec<DerivedCapture> = Vec::new();
    for capture in &input.captures {
        if let Some(before) = query.before_sequence {
            if capture.capture_sequence >= before {
                continue;
            }
        }
        // eventSequence is assigned over the capture's FULL deterministic change
        // order, before filtering, so an event's position — and therefore its id
        // — never depends on which filter the caller happened to pass.
        let mut events: Vec<TimelineEvent> = Vec::new();
        for (index, change) in ordered_changes(&capture.change_set).into_iter().enumerate() {
            if !passes_filters(change, query) {
                continue;
            }
            let draft = project_change(change, capture, &query.project_id, index as i64);
            let event_id = derive_event_id(&draft)?;
            events.push(TimelineEvent {
                event_id,
                project_id: draft.project_id,
                snapshot_id: draft.snapshot_id,
                capture_sequence: draft.capture_sequence,
                event_sequence: draft.event_sequence,
                captured_at: draft.captured_at,
                category: draft.category,
                kind: draft.kind,
                subject_id: draft.subject_id,
                evidence_count: draft.evidence_count,
                title: draft.title,
                status: draft.status,
                severity: draft.severity,
                due_date: draft.due_date,
            });
        }
        if events.is_empty() {
            continue;
        }
        derived.push(DerivedCapture {
            capture_sequence: capture.capture_sequence,
            events,
        });
    }

    // Newest capture first. `derived` is ascending by construction (the input
    // chronology is validated strictly ascending), so reversing is exact.
    derived.reverse();

    // Consume whole captures until the next one would exceed the limit. The
    // first capture is always taken so a single over-limit capture is reported
    // truthfully rather than silently trimmed mid-capture.
    let mut page: Vec<TimelineEvent> = Vec::new();
    let mut consumed = 0usize;
    for capture in &derived {
        let would_be = page.len() + capture.events.len();
        if !page.is_empty() && (would_be as i64) > limit {
            break;
        }
        page.extend(capture.events.iter().cloned());
        consumed += 1;
    }

    let has_more = consumed < derived.len();
    let next_before_sequence = if has_more {
        // The lowest capture sequence in the returned page: passing it back
        // excludes exactly what was returned and nothing else.
        derived
            .get(consumed - 1)
            .map(|capture| capture.capture_sequence)
    } else {
        None
    };

    Ok(TimelineResult {
        project_id: query.project_id.clone(),
        event_count: page.len() as i64,
        has_more,
        events: page,
        next_before_sequence,
    })
}

/// The deterministic change order within one capture.
///
/// The Kernel diff already emits changes in `(item-kind rank, item id, category
/// rank)` order. This re-asserts that order explicitly so the timeline's
/// `eventSequence` is stable even if a caller hands over a ChangeSet whose array
/// order was disturbed in transit (for example by a non-order-preserving
/// serialization step).
fn ordered_changes(change_set: &ChangeSet) -> Vec<&StateChange> {
    let mut changes: Vec<&StateChange> = change_set.changes.iter().collect();
    changes.sort_by(|a, b| {
        state_item_kind_rank(&a.item_kind)
            .cmp(&state_item_kind_rank(&b.item_kind))
            .then_with(|| a.item_id.cmp(&b.item_id))
            .then_with(|| category_rank(&a.category).cmp(&category_rank(&b.category)))
    });
    changes
}
