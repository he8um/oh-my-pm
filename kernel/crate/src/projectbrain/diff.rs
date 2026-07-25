//! Deterministic snapshot diff: exact matching and rule-based change
//! classification. No fuzzy matching, no similarity, no probabilistic score.

use std::collections::{BTreeMap, BTreeSet};

use super::error::{
    ProjectBrainError, OMP_K_PB_DUPLICATE, OMP_K_PB_INVALID_TIME, OMP_K_PB_MISMATCH,
    OMP_K_PB_MISSING_EVIDENCE,
};
use super::fingerprint::{
    finalize_project_snapshot, state_item_kind_rank, validate_evidence_record,
};
use super::freshness::StalenessPolicy;
use super::time::{age_seconds, is_overdue, parse_due_date, parse_rfc3339, Instant};

use crate::contracts::projectbrain::{
    CanonicalStateItem, ChangeCategory, ChangeSet, EvidenceRecord, EvidenceSourceKind,
    ProjectSnapshot, StateChange,
};

const SCHEMA_VERSION: i64 = 1;

/// Pure input to [`diff_project_snapshots`].
#[derive(Debug, Clone)]
pub struct SnapshotDiffInput {
    /// The earlier snapshot.
    pub previous: ProjectSnapshot,
    /// The later snapshot.
    pub current: ProjectSnapshot,
    /// Evidence records referenced by the previous snapshot.
    pub previous_evidence: Vec<EvidenceRecord>,
    /// Evidence records referenced by the current snapshot.
    pub current_evidence: Vec<EvidenceRecord>,
    /// The comparison boundary timestamp (RFC3339).
    pub compared_at: String,
    /// Policy for item evidence-freshness (fresh/stale) transitions.
    pub staleness_policy: StalenessPolicy,
}

/// Fixed severity rank. Unknown labels have no rank.
fn severity_rank(label: &str) -> Option<u8> {
    match label {
        "info" => Some(0),
        "low" => Some(1),
        "medium" => Some(2),
        "high" => Some(3),
        "critical" => Some(4),
        _ => None,
    }
}

fn is_resolved_like(status: &str) -> bool {
    matches!(
        status,
        "resolved" | "closed" | "done" | "complete" | "completed"
    )
}

fn is_open_like(status: &str) -> bool {
    matches!(
        status,
        "open" | "todo" | "planned" | "inprogress" | "active" | "reopened" | "blocked"
    )
}

/// The ordered match key for a state item: `(kind rank, normalized id)`.
type MatchKey = (u8, String);

fn item_key(item: &CanonicalStateItem) -> MatchKey {
    (state_item_kind_rank(&item.kind), item.id.clone())
}

/// Flatten a snapshot's normalized state into one ordered map keyed by
/// `(kind rank, id)`. Duplicate keys are a validation error.
fn flatten_items(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<MatchKey, CanonicalStateItem>, ProjectBrainError> {
    let mut map: BTreeMap<MatchKey, CanonicalStateItem> = BTreeMap::new();
    for items in [
        &snapshot.state.milestones,
        &snapshot.state.tasks,
        &snapshot.state.risks,
        &snapshot.state.decisions,
        &snapshot.state.dependencies,
        &snapshot.state.blockers,
    ]
    .into_iter()
    .flatten()
    {
        for item in items {
            if map.insert(item_key(item), item.clone()).is_some() {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_DUPLICATE,
                    "duplicate item key while flattening state",
                    "/snapshot/state",
                ));
            }
        }
    }
    Ok(map)
}

/// The fixed category rank used for final ordering.
fn category_rank(category: &ChangeCategory) -> u8 {
    match category {
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

/// An evidence index: id → record, and normalized source identity → record.
struct EvidenceIndex<'a> {
    by_id: BTreeMap<String, &'a EvidenceRecord>,
    by_source: BTreeMap<(String, String), &'a EvidenceRecord>,
}

fn source_kind_wire(kind: &EvidenceSourceKind) -> &'static str {
    match kind {
        EvidenceSourceKind::Markdown => "markdown",
        EvidenceSourceKind::GithubIssue => "githubIssue",
        EvidenceSourceKind::GithubPullRequest => "githubPullRequest",
        EvidenceSourceKind::GithubRepository => "githubRepository",
        EvidenceSourceKind::Structured => "structured",
        EvidenceSourceKind::Generic => "generic",
    }
}

fn build_evidence_index<'a>(
    project_id: &str,
    records: &'a [EvidenceRecord],
) -> Result<EvidenceIndex<'a>, ProjectBrainError> {
    let mut by_id: BTreeMap<String, &EvidenceRecord> = BTreeMap::new();
    let mut by_source: BTreeMap<(String, String), &EvidenceRecord> = BTreeMap::new();
    for record in records {
        validate_evidence_record(record)?;
        if record.project_id.trim() != project_id {
            return Err(ProjectBrainError::at(
                OMP_K_PB_MISMATCH,
                "evidence record does not belong to the project",
                "/evidence/projectId",
            ));
        }
        let id = super::normalize::normalize_id(
            &record.evidence_id,
            super::limits::MAX_ID_BYTES,
            "/evidence/evidenceId",
        )?;
        if by_id.insert(id, record).is_some() {
            return Err(ProjectBrainError::at(
                OMP_K_PB_DUPLICATE,
                "duplicate evidence id in the provided set",
                "/evidence/evidenceId",
            ));
        }
        let source_identity = super::normalize::normalize_source_identity(
            &record.source_identity,
            "/evidence/sourceIdentity",
        )?;
        // Last record for a given source key wins deterministically (BTreeMap
        // insertion order over a sorted input is stable for our callers).
        by_source.insert(
            (
                source_kind_wire(&record.source_kind).to_string(),
                source_identity,
            ),
            record,
        );
    }
    Ok(EvidenceIndex { by_id, by_source })
}

/// Assert every evidence ref held by a snapshot exists in the index.
fn assert_refs_present(
    snapshot: &ProjectSnapshot,
    index: &EvidenceIndex,
) -> Result<(), ProjectBrainError> {
    let check = |refs: &[String]| -> Result<(), ProjectBrainError> {
        for r in refs {
            if !index.by_id.contains_key(r) {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_MISSING_EVIDENCE,
                    "referenced evidence id is not present in the provided set",
                    "/snapshot/evidenceRefs",
                ));
            }
        }
        Ok(())
    };
    check(&snapshot.state.evidence_refs)?;
    check(&snapshot.evidence_refs)?;
    for items in [
        &snapshot.state.milestones,
        &snapshot.state.tasks,
        &snapshot.state.risks,
        &snapshot.state.decisions,
        &snapshot.state.dependencies,
        &snapshot.state.blockers,
    ]
    .into_iter()
    .flatten()
    {
        for item in items {
            check(&item.evidence_refs)?;
        }
    }
    Ok(())
}

/// The oldest (maximum-age) contributing evidence age for an item, or `None`
/// when no contributing evidence carries a usable timestamp.
fn item_evidence_age(
    item: &CanonicalStateItem,
    index: &EvidenceIndex,
    reference: Instant,
    policy: &StalenessPolicy,
) -> Result<Option<i64>, ProjectBrainError> {
    let mut max_age: Option<i64> = None;
    for r in &item.evidence_refs {
        let Some(record) = index.by_id.get(r) else {
            continue;
        };
        // sourceUpdatedAt when present, otherwise observedAt.
        let ts = record
            .source_updated_at
            .as_deref()
            .unwrap_or(record.observed_at.as_str());
        let instant = parse_rfc3339(ts, "/evidence/timestamp")?;
        let age = age_seconds(
            reference,
            instant,
            policy.max_future_skew_seconds,
            "/evidence/timestamp",
        )?;
        max_age = Some(max_age.map_or(age, |m: i64| m.max(age)));
    }
    Ok(max_age)
}

/// Whether an item's sorted evidence refs, or a source-equivalent record's
/// content fingerprint, changed between snapshots.
fn evidence_changed(
    prev: &CanonicalStateItem,
    curr: &CanonicalStateItem,
    prev_index: &EvidenceIndex,
    curr_index: &EvidenceIndex,
) -> bool {
    if prev.evidence_refs != curr.evidence_refs {
        return true;
    }
    // Compare source-equivalent content fingerprints for the shared refs.
    for r in &curr.evidence_refs {
        let (Some(cur_rec), Some(prev_rec)) = (curr_index.by_id.get(r), prev_index.by_id.get(r))
        else {
            continue;
        };
        let cur_source = (
            source_kind_wire(&cur_rec.source_kind).to_string(),
            normalize_source_or_empty(&cur_rec.source_identity),
        );
        if let Some(prev_by_source) = prev_index.by_source.get(&cur_source) {
            if prev_by_source.content_fingerprint != cur_rec.content_fingerprint {
                return true;
            }
        }
        if prev_rec.content_fingerprint != cur_rec.content_fingerprint {
            return true;
        }
    }
    false
}

fn normalize_source_or_empty(raw: &str) -> String {
    super::normalize::normalize_source_identity(raw, "/evidence/sourceIdentity").unwrap_or_default()
}

/// Merge two evidence-ref lists into a sorted, deduplicated union.
fn union_refs(a: &[String], b: &[String]) -> Vec<String> {
    let mut set: BTreeSet<String> = BTreeSet::new();
    set.extend(a.iter().cloned());
    set.extend(b.iter().cloned());
    set.into_iter().collect()
}

/// Build a `StateChange` for a matched-item category (previous + current).
fn matched_change(
    category: ChangeCategory,
    prev: &CanonicalStateItem,
    curr: &CanonicalStateItem,
) -> StateChange {
    StateChange {
        category,
        item_kind: curr.kind.clone(),
        item_id: curr.id.clone(),
        evidence_refs: union_refs(&prev.evidence_refs, &curr.evidence_refs),
        previous_value: Some(prev.clone()),
        current_value: Some(curr.clone()),
    }
}

/// Diff two snapshots into a deterministic [`ChangeSet`].
pub fn diff_project_snapshots(input: SnapshotDiffInput) -> Result<ChangeSet, ProjectBrainError> {
    input.staleness_policy.validate()?;

    // Normalize and finalize both snapshots so ids/fingerprints are trustworthy.
    let previous = finalize_project_snapshot(input.previous)?;
    let current = finalize_project_snapshot(input.current)?;

    if previous.project_id != current.project_id {
        return Err(ProjectBrainError::at(
            OMP_K_PB_MISMATCH,
            "snapshots belong to different projects",
            "/snapshot/projectId",
        ));
    }
    if previous.schema_version != current.schema_version {
        return Err(ProjectBrainError::at(
            super::error::OMP_K_PB_INVALID_SCHEMA_VERSION,
            "snapshots use different schema versions",
            "/snapshot/schemaVersion",
        ));
    }
    let compared_at = parse_rfc3339(&input.compared_at, "/compared/comparedAt").map_err(|_| {
        ProjectBrainError::at(
            OMP_K_PB_INVALID_TIME,
            "invalid comparedAt",
            "/compared/comparedAt",
        )
    })?;

    let project_id = current.project_id.clone();
    let prev_index = build_evidence_index(&project_id, &input.previous_evidence)?;
    let curr_index = build_evidence_index(&project_id, &input.current_evidence)?;
    assert_refs_present(&previous, &prev_index)?;
    assert_refs_present(&current, &curr_index)?;

    let prev_items = flatten_items(&previous)?;
    let curr_items = flatten_items(&current)?;

    let prev_captured = parse_rfc3339(&previous.captured_at, "/snapshot/capturedAt")?;
    let curr_captured = parse_rfc3339(&current.captured_at, "/snapshot/capturedAt")?;

    let mut changes: Vec<StateChange> = Vec::new();

    // Added: keys only in current.
    for (key, item) in &curr_items {
        if !prev_items.contains_key(key) {
            changes.push(StateChange {
                category: ChangeCategory::Added,
                item_kind: item.kind.clone(),
                item_id: item.id.clone(),
                evidence_refs: item.evidence_refs.clone(),
                previous_value: None,
                current_value: Some(item.clone()),
            });
        }
    }
    // Removed: keys only in previous.
    for (key, item) in &prev_items {
        if !curr_items.contains_key(key) {
            changes.push(StateChange {
                category: ChangeCategory::Removed,
                item_kind: item.kind.clone(),
                item_id: item.id.clone(),
                evidence_refs: item.evidence_refs.clone(),
                previous_value: Some(item.clone()),
                current_value: None,
            });
        }
    }

    // Matched: keys in both. Evaluate categories in fixed order.
    for (key, curr) in &curr_items {
        let Some(prev) = prev_items.get(key) else {
            continue;
        };
        let mut specific_emitted = false;

        // Track which fields are already explained by a specific category.
        let mut status_explained = false;
        let mut severity_explained = false;
        let mut due_explained = false;

        // resolved / reopened — from status transitions.
        if let (Some(prev_status), Some(curr_status)) = (&prev.status, &curr.status) {
            if prev_status != curr_status {
                if !is_resolved_like(prev_status) && is_resolved_like(curr_status) {
                    changes.push(matched_change(ChangeCategory::Resolved, prev, curr));
                    specific_emitted = true;
                    status_explained = true;
                } else if is_resolved_like(prev_status) && is_open_like(curr_status) {
                    changes.push(matched_change(ChangeCategory::Reopened, prev, curr));
                    specific_emitted = true;
                    status_explained = true;
                }
            } else {
                status_explained = true; // no status change at all
            }
        } else if prev.status == curr.status {
            status_explained = true; // both absent
        }

        // becameOverdue / noLongerOverdue — only when both sides carry a due date.
        if let (Some(prev_due), Some(curr_due)) = (&prev.due_date, &curr.due_date) {
            let prev_parsed = parse_due_date(prev_due, "/item/dueDate")?;
            let curr_parsed = parse_due_date(curr_due, "/item/dueDate")?;
            let prev_overdue = is_overdue(prev_parsed, prev_captured)?;
            let curr_overdue = is_overdue(curr_parsed, curr_captured)?;
            if !prev_overdue && curr_overdue {
                changes.push(matched_change(ChangeCategory::BecameOverdue, prev, curr));
                specific_emitted = true;
            } else if prev_overdue && !curr_overdue {
                changes.push(matched_change(ChangeCategory::NoLongerOverdue, prev, curr));
                specific_emitted = true;
            }
            // A due-date value change is explained only when the value is
            // unchanged or its overdue status flipped; any other due-date change
            // stays "modified".
            if prev_due == curr_due || prev_overdue != curr_overdue {
                due_explained = true;
            }
        } else if prev.due_date == curr.due_date {
            due_explained = true; // both absent
        }

        // severityIncreased / severityDecreased — from ranked severity labels.
        if let (Some(prev_sev), Some(curr_sev)) = (&prev.severity, &curr.severity) {
            if prev_sev != curr_sev {
                match (severity_rank(prev_sev), severity_rank(curr_sev)) {
                    (Some(p), Some(c)) if c > p => {
                        changes.push(matched_change(
                            ChangeCategory::SeverityIncreased,
                            prev,
                            curr,
                        ));
                        specific_emitted = true;
                        severity_explained = true;
                    }
                    (Some(p), Some(c)) if c < p => {
                        changes.push(matched_change(
                            ChangeCategory::SeverityDecreased,
                            prev,
                            curr,
                        ));
                        specific_emitted = true;
                        severity_explained = true;
                    }
                    _ => {
                        // Unknown-label severity change is "modified" only.
                    }
                }
            } else {
                severity_explained = true;
            }
        } else if prev.severity == curr.severity {
            severity_explained = true;
        }

        // fresh / stale — item evidence-freshness transition.
        let prev_age =
            item_evidence_age(prev, &prev_index, prev_captured, &input.staleness_policy)?;
        let curr_age =
            item_evidence_age(curr, &curr_index, curr_captured, &input.staleness_policy)?;
        if let (Some(prev_age), Some(curr_age)) = (prev_age, curr_age) {
            let threshold = input.staleness_policy.evidence_stale_after_seconds;
            let prev_stale = prev_age > threshold;
            let curr_stale = curr_age > threshold;
            if prev_stale && !curr_stale {
                changes.push(matched_change(ChangeCategory::Fresh, prev, curr));
                specific_emitted = true;
            } else if !prev_stale && curr_stale {
                changes.push(matched_change(ChangeCategory::Stale, prev, curr));
                specific_emitted = true;
            }
        }

        // evidenceChanged — refs or source-equivalent content fingerprint changed.
        let evidence_diff = evidence_changed(prev, curr, &prev_index, &curr_index);
        if evidence_diff {
            changes.push(matched_change(ChangeCategory::EvidenceChanged, prev, curr));
            specific_emitted = true;
        }

        // modified — only for field changes not fully explained above.
        let other_field_changed = prev.title != curr.title
            || prev.owner != curr.owner
            || prev.priority != curr.priority
            || prev.metadata != curr.metadata
            || (prev.status != curr.status && !status_explained)
            || (prev.severity != curr.severity && !severity_explained)
            || (prev.due_date != curr.due_date && !due_explained);
        if other_field_changed {
            changes.push(matched_change(ChangeCategory::Modified, prev, curr));
        } else if !specific_emitted {
            // No specific category and no other field change: emit nothing.
        }
    }

    if changes.len() > super::limits::MAX_CHANGES {
        return Err(ProjectBrainError::new(
            super::error::OMP_K_PB_LIMIT_EXCEEDED,
            "change count exceeds the maximum permitted",
        ));
    }

    // Final ordering: (item-kind rank, item id, category rank).
    changes.sort_by(|a, b| {
        state_item_kind_rank(&a.item_kind)
            .cmp(&state_item_kind_rank(&b.item_kind))
            .then_with(|| a.item_id.cmp(&b.item_id))
            .then_with(|| category_rank(&a.category).cmp(&category_rank(&b.category)))
    });

    let _ = compared_at; // parsed for validation; comparedAt string is echoed.

    Ok(ChangeSet {
        project_id,
        previous_snapshot_id: previous.snapshot_id,
        current_snapshot_id: current.snapshot_id,
        compared_at: input.compared_at,
        changes,
        schema_version: SCHEMA_VERSION,
    })
}
