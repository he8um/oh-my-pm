//! Content, evidence, state, and snapshot fingerprints, plus the normalization
//! that must precede every fingerprint.
//!
//! All fingerprints are domain-separated SHA-256 over a canonical projection.
//! The projections deliberately exclude temporal fields that must not change a
//! semantic fingerprint (see the documented reasons at each projection).

use std::collections::BTreeMap;

use super::canonical::{fingerprint_hex, fingerprint_hex_bytes, CanonicalValue};
use super::error::{
    ProjectBrainError, OMP_K_PB_DUPLICATE, OMP_K_PB_INVALID_FIELD, OMP_K_PB_INVALID_SCHEMA_VERSION,
    OMP_K_PB_LIMIT_EXCEEDED, OMP_K_PB_MISMATCH, OMP_K_PB_MISSING_EVIDENCE,
    OMP_K_PB_UNSUPPORTED_VALUE,
};
use super::limits::{
    MAX_CANONICAL_BYTES, MAX_EVIDENCE_REFS_PER_ITEM, MAX_ID_BYTES, MAX_ITEMS_PER_COLLECTION,
    MAX_LABEL_BYTES, MAX_SOURCES, MAX_SOURCE_BOUNDARIES, MAX_STATE_EVIDENCE_REFS, MAX_TITLE_BYTES,
};
use super::normalize::{
    normalize_display_text, normalize_id, normalize_int_map, normalize_optional_label,
    normalize_optional_text, normalize_required_text, normalize_source_identity,
    normalize_string_map,
};
use super::time::{parse_due_date, parse_rfc3339};

use crate::contracts::projectbrain::{
    CanonicalStateItem, CoverageState, EvidenceRecord, EvidenceSourceKind, Freshness,
    ProjectSnapshot, ProjectState, RawContentPolicy, SourceBoundary, SourceDescriptor,
    StateItemKind,
};

/// Domain separator for evidence content fingerprints.
pub const EVIDENCE_CONTENT_DOMAIN: &str = "oh-my-pm:projectbrain:v1:evidence-content";
/// Domain separator for evidence id derivation.
pub const EVIDENCE_ID_DOMAIN: &str = "oh-my-pm:projectbrain:v1:evidence-id";
/// Domain separator for state fingerprints.
pub const PROJECT_STATE_DOMAIN: &str = "oh-my-pm:projectbrain:v1:project-state";
/// Domain separator for snapshot fingerprints.
pub const PROJECT_SNAPSHOT_DOMAIN: &str = "oh-my-pm:projectbrain:v1:project-snapshot";

const SCHEMA_VERSION: i64 = 1;

// ---------------------------------------------------------------------------
// Small canonical helpers.
// ---------------------------------------------------------------------------

fn obj(entries: Vec<(&str, CanonicalValue)>) -> CanonicalValue {
    let mut map = BTreeMap::new();
    for (key, value) in entries {
        map.insert(key.to_string(), value);
    }
    CanonicalValue::Object(map)
}

fn opt_str(value: &Option<String>) -> CanonicalValue {
    match value {
        Some(s) => CanonicalValue::str(s),
        None => CanonicalValue::Null,
    }
}

fn str_array(values: &[String]) -> CanonicalValue {
    CanonicalValue::Array(values.iter().map(CanonicalValue::str).collect())
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

/// Fixed rank of each item kind. Governs collection ordering and match keys.
pub fn state_item_kind_rank(kind: &StateItemKind) -> u8 {
    match kind {
        StateItemKind::Milestone => 0,
        StateItemKind::Task => 1,
        StateItemKind::Risk => 2,
        StateItemKind::Decision => 3,
        StateItemKind::Dependency => 4,
        StateItemKind::Blocker => 5,
    }
}

fn coverage_state_wire(state: &CoverageState) -> &'static str {
    match state {
        CoverageState::Complete => "complete",
        CoverageState::Partial => "partial",
        CoverageState::Skipped => "skipped",
    }
}

/// Sort, deduplicate, and bound a list of evidence references.
fn normalize_evidence_refs(
    refs: &[String],
    max: usize,
    field_path: &str,
) -> Result<Vec<String>, ProjectBrainError> {
    if refs.len() > max {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "evidence references exceed the maximum permitted count",
            field_path,
        ));
    }
    let mut normalized = Vec::with_capacity(refs.len());
    for r in refs {
        normalized.push(normalize_id(r, MAX_ID_BYTES, field_path)?);
    }
    normalized.sort();
    normalized.dedup();
    Ok(normalized)
}

// ---------------------------------------------------------------------------
// Evidence content and id fingerprints.
// ---------------------------------------------------------------------------

/// Fingerprint minimized evidence content.
///
/// Content canonicalization:
/// - CRLF/CR fold to LF.
/// - Trailing Unicode whitespace is stripped from each line.
/// - Leading/trailing blank lines are removed.
/// - Case and meaningful internal whitespace are preserved.
/// - The byte size is bounded.
///
/// Returns `sha256:<64 lowercase hex>`.
pub fn fingerprint_minimized_content(content: &str) -> Result<String, ProjectBrainError> {
    if content.len() > MAX_CANONICAL_BYTES {
        return Err(ProjectBrainError::new(
            super::error::OMP_K_PB_INVALID_FINGERPRINT_INPUT,
            "content exceeds the maximum permitted size",
        ));
    }
    let folded = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines: Vec<&str> = folded
        .split('\n')
        .map(|line| line.trim_end_matches(|c: char| c.is_whitespace()))
        .collect();
    // Remove leading/trailing blank lines.
    while lines.first().map(|l| l.is_empty()).unwrap_or(false) {
        lines.remove(0);
    }
    while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    let canonical = lines.join("\n");
    let hex = fingerprint_hex_bytes(EVIDENCE_CONTENT_DOMAIN, canonical.as_bytes());
    Ok(format!("sha256:{hex}"))
}

/// Derive a deterministic evidence id from an evidence record.
///
/// The id projection includes: projectId, sourceKind, normalized sourceIdentity,
/// contentFingerprint (when present), observedAt (only when contentFingerprint is
/// absent), and schemaVersion. The record is never mutated or persisted.
///
/// Returns `evidence:sha256:<64 lowercase hex>`.
pub fn derive_evidence_id(record: &EvidenceRecord) -> Result<String, ProjectBrainError> {
    validate_evidence_record(record)?;
    let project_id = normalize_id(&record.project_id, MAX_ID_BYTES, "/evidence/projectId")?;
    let source_identity =
        normalize_source_identity(&record.source_identity, "/evidence/sourceIdentity")?;

    let mut entries: Vec<(&str, CanonicalValue)> = vec![
        ("projectId", CanonicalValue::str(project_id)),
        (
            "sourceKind",
            CanonicalValue::str(source_kind_wire(&record.source_kind)),
        ),
        ("sourceIdentity", CanonicalValue::str(source_identity)),
        ("schemaVersion", CanonicalValue::Int(SCHEMA_VERSION)),
    ];
    match &record.content_fingerprint {
        Some(fp) => entries.push(("contentFingerprint", CanonicalValue::str(fp))),
        None => {
            // With no content fingerprint, the observation time distinguishes records.
            parse_rfc3339(&record.observed_at, "/evidence/observedAt")?;
            entries.push(("observedAt", CanonicalValue::str(&record.observed_at)));
        }
    }
    let hex = fingerprint_hex(EVIDENCE_ID_DOMAIN, &obj(entries))?;
    Ok(format!("evidence:sha256:{hex}"))
}

/// Validate an evidence record's content policy and privacy invariants.
pub fn validate_evidence_record(record: &EvidenceRecord) -> Result<(), ProjectBrainError> {
    if record.schema_version != SCHEMA_VERSION {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_SCHEMA_VERSION,
            "unsupported evidence schema version",
            "/evidence/schemaVersion",
        ));
    }
    // Absolute-path rejection is enforced by source-identity normalization.
    normalize_source_identity(&record.source_identity, "/evidence/sourceIdentity")?;
    normalize_string_map(&record.provenance, "/evidence/provenance")?;
    if let Some(metadata) = &record.metadata {
        normalize_string_map(metadata, "/evidence/metadata")?;
    }
    match record.raw_content_policy {
        RawContentPolicy::NotStored => {
            // notStored may omit the content fingerprint (and typically does).
        }
        RawContentPolicy::Minimized | RawContentPolicy::StoredOptIn => {
            if record.content_fingerprint.is_none() {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_INVALID_FIELD,
                    "minimized and storedOptIn evidence require a content fingerprint",
                    "/evidence/contentFingerprint",
                ));
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Item normalization.
// ---------------------------------------------------------------------------

/// Normalize a single canonical state item to its `expected_kind` collection.
fn normalize_item(
    item: &CanonicalStateItem,
    expected_kind: &StateItemKind,
    field_path: &str,
) -> Result<CanonicalStateItem, ProjectBrainError> {
    if state_item_kind_rank(&item.kind) != state_item_kind_rank(expected_kind) {
        return Err(ProjectBrainError::at(
            OMP_K_PB_UNSUPPORTED_VALUE,
            "item kind conflicts with its containing collection",
            field_path,
        ));
    }
    let id = normalize_id(&item.id, MAX_ID_BYTES, field_path)?;
    let title = normalize_required_text(&item.title, MAX_TITLE_BYTES, field_path)?;
    let evidence_refs =
        normalize_evidence_refs(&item.evidence_refs, MAX_EVIDENCE_REFS_PER_ITEM, field_path)?;
    let status = normalize_optional_label(item.status.as_deref(), field_path)?;
    let severity = normalize_optional_label(item.severity.as_deref(), field_path)?;
    let owner = normalize_optional_text(item.owner.as_deref(), MAX_LABEL_BYTES, field_path)?;
    let priority = normalize_optional_label(item.priority.as_deref(), field_path)?;
    // A due date, when present, must parse; its normalized form is the trimmed input.
    let due_date = match item.due_date.as_deref() {
        None => None,
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                parse_due_date(trimmed, field_path)?;
                Some(trimmed.to_string())
            }
        }
    };
    let metadata = match &item.metadata {
        None => None,
        Some(map) => {
            let normalized = normalize_string_map(map, field_path)?;
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        }
    };
    Ok(CanonicalStateItem {
        kind: item.kind.clone(),
        id,
        title,
        evidence_refs,
        status,
        severity,
        owner,
        due_date,
        priority,
        metadata,
    })
}

/// The canonical projection of an item, used inside the state fingerprint.
fn item_projection(item: &CanonicalStateItem) -> CanonicalValue {
    obj(vec![
        (
            "kind",
            CanonicalValue::Int(state_item_kind_rank(&item.kind) as i64),
        ),
        ("id", CanonicalValue::str(&item.id)),
        ("title", CanonicalValue::str(&item.title)),
        ("evidenceRefs", str_array(&item.evidence_refs)),
        ("status", opt_str(&item.status)),
        ("severity", opt_str(&item.severity)),
        ("owner", opt_str(&item.owner)),
        ("dueDate", opt_str(&item.due_date)),
        ("priority", opt_str(&item.priority)),
        ("metadata", map_projection(&item.metadata)),
    ])
}

fn map_projection(map: &Option<BTreeMap<String, String>>) -> CanonicalValue {
    match map {
        None => CanonicalValue::Null,
        Some(m) => {
            let mut out = BTreeMap::new();
            for (k, v) in m {
                out.insert(k.clone(), CanonicalValue::str(v));
            }
            CanonicalValue::Object(out)
        }
    }
}

/// Sort a normalized collection by `(kind-rank, id, title)`.
fn sort_collection(items: &mut [CanonicalStateItem]) {
    items.sort_by(|a, b| {
        state_item_kind_rank(&a.kind)
            .cmp(&state_item_kind_rank(&b.kind))
            .then_with(|| a.id.cmp(&b.id))
            .then_with(|| a.title.cmp(&b.title))
    });
}

// ---------------------------------------------------------------------------
// Freshness normalization (shape only; derivation lives in freshness.rs).
// ---------------------------------------------------------------------------

/// Normalize the freshness shape: coverage gaps are normalized, sorted, and
/// deduplicated; `coverageComplete` is recomputed as "no gaps".
fn normalize_freshness(
    freshness: &Freshness,
    field_path: &str,
) -> Result<Freshness, ProjectBrainError> {
    if freshness.schema_version != SCHEMA_VERSION {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_SCHEMA_VERSION,
            "unsupported freshness schema version",
            field_path,
        ));
    }
    let mut gaps: Vec<String> = Vec::with_capacity(freshness.coverage_gaps.len());
    if freshness.coverage_gaps.len() > super::limits::MAX_COVERAGE_GAPS {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "coverage gaps exceed the maximum permitted count",
            field_path,
        ));
    }
    for gap in &freshness.coverage_gaps {
        let normalized = normalize_display_text(gap);
        if !normalized.is_empty() {
            gaps.push(normalized);
        }
    }
    gaps.sort();
    gaps.dedup();
    let coverage_complete = gaps.is_empty();
    Ok(Freshness {
        observation_freshness: freshness.observation_freshness.clone(),
        source_freshness: freshness.source_freshness.clone(),
        evidence_freshness: freshness.evidence_freshness.clone(),
        derived_state_freshness: freshness.derived_state_freshness.clone(),
        coverage_complete,
        coverage_gaps: gaps,
        schema_version: SCHEMA_VERSION,
    })
}

// ---------------------------------------------------------------------------
// ProjectState normalization and fingerprint.
// ---------------------------------------------------------------------------

/// Normalize a [`ProjectState`] into its canonical, sorted, deduplicated form.
///
/// The caller-provided `stateFingerprint` is not trusted and is left as-is here;
/// use [`finalize_project_state`] to compute and stamp the real fingerprint.
pub fn normalize_project_state(state: ProjectState) -> Result<ProjectState, ProjectBrainError> {
    if state.schema_version != SCHEMA_VERSION {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_SCHEMA_VERSION,
            "unsupported state schema version",
            "/state/schemaVersion",
        ));
    }
    // Identity: validate schema version and normalize the opaque id + hints.
    if state.identity.schema_version != SCHEMA_VERSION {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_SCHEMA_VERSION,
            "unsupported identity schema version",
            "/state/identity/schemaVersion",
        ));
    }
    let identity_id = normalize_id(&state.identity.id, MAX_ID_BYTES, "/state/identity/id")?;
    let display_name = normalize_optional_text(
        state.identity.display_name.as_deref(),
        MAX_TITLE_BYTES,
        "/state/identity/displayName",
    )?;
    let root_hint = match state.identity.root_hint.as_deref() {
        None => None,
        Some(raw) => Some(normalize_source_identity(raw, "/state/identity/rootHint")?),
    };
    let mut identity = state.identity.clone();
    identity.id = identity_id;
    identity.display_name = display_name;
    identity.root_hint = root_hint;
    identity.schema_version = SCHEMA_VERSION;

    // observedAt must be a valid RFC3339 timestamp (kept, but excluded from fp).
    parse_rfc3339(&state.observed_at, "/state/observedAt")?;

    // Sources: normalize, sort by (sourceKind, sourceIdentity), dedupe.
    if state.sources.len() > MAX_SOURCES {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "sources exceed the maximum permitted count",
            "/state/sources",
        ));
    }
    let mut sources: Vec<SourceDescriptor> = Vec::with_capacity(state.sources.len());
    for (i, src) in state.sources.iter().enumerate() {
        let identity = normalize_source_identity(
            &src.source_identity,
            &format!("/state/sources/{i}/sourceIdentity"),
        )?;
        sources.push(SourceDescriptor {
            source_kind: src.source_kind.clone(),
            source_identity: identity,
        });
    }
    sources.sort_by(|a, b| {
        source_kind_wire(&a.source_kind)
            .cmp(source_kind_wire(&b.source_kind))
            .then_with(|| a.source_identity.cmp(&b.source_identity))
    });
    let dedup_len = {
        let mut seen = std::collections::BTreeSet::new();
        for s in &sources {
            seen.insert((source_kind_wire(&s.source_kind), s.source_identity.clone()));
        }
        seen.len()
    };
    if dedup_len != sources.len() {
        return Err(ProjectBrainError::at(
            OMP_K_PB_DUPLICATE,
            "duplicate source descriptor after normalization",
            "/state/sources",
        ));
    }

    let status_summary = normalize_int_map(&state.status_summary, "/state/statusSummary")?;
    let state_evidence_refs = normalize_evidence_refs(
        &state.evidence_refs,
        MAX_STATE_EVIDENCE_REFS,
        "/state/evidenceRefs",
    )?;
    let objective = normalize_optional_text(
        state.objective.as_deref(),
        MAX_TITLE_BYTES,
        "/state/objective",
    )?;
    let freshness = normalize_freshness(&state.freshness, "/state/freshness")?;

    // Item collections. Track (kind-rank, id) across ALL collections for global
    // duplicate rejection.
    let mut seen_keys: std::collections::BTreeSet<(u8, String)> = std::collections::BTreeSet::new();
    let normalize_collection = |raw: &Option<Vec<CanonicalStateItem>>,
                                kind: StateItemKind,
                                name: &str,
                                seen: &mut std::collections::BTreeSet<(u8, String)>|
     -> Result<Option<Vec<CanonicalStateItem>>, ProjectBrainError> {
        match raw {
            None => Ok(None),
            Some(items) => {
                if items.len() > MAX_ITEMS_PER_COLLECTION {
                    return Err(ProjectBrainError::at(
                        OMP_K_PB_LIMIT_EXCEEDED,
                        "collection exceeds the maximum permitted item count",
                        format!("/state/{name}"),
                    ));
                }
                let mut normalized = Vec::with_capacity(items.len());
                for (i, item) in items.iter().enumerate() {
                    let path = format!("/state/{name}/{i}");
                    let n = normalize_item(item, &kind, &path)?;
                    let key = (state_item_kind_rank(&n.kind), n.id.clone());
                    if !seen.insert(key) {
                        return Err(ProjectBrainError::at(
                            OMP_K_PB_DUPLICATE,
                            "duplicate (kind, id) item across collections",
                            &path,
                        ));
                    }
                    normalized.push(n);
                }
                sort_collection(&mut normalized);
                Ok(Some(normalized))
            }
        }
    };

    let milestones = normalize_collection(
        &state.milestones,
        StateItemKind::Milestone,
        "milestones",
        &mut seen_keys,
    )?;
    let tasks = normalize_collection(&state.tasks, StateItemKind::Task, "tasks", &mut seen_keys)?;
    let risks = normalize_collection(&state.risks, StateItemKind::Risk, "risks", &mut seen_keys)?;
    let decisions = normalize_collection(
        &state.decisions,
        StateItemKind::Decision,
        "decisions",
        &mut seen_keys,
    )?;
    let dependencies = normalize_collection(
        &state.dependencies,
        StateItemKind::Dependency,
        "dependencies",
        &mut seen_keys,
    )?;
    let blockers = normalize_collection(
        &state.blockers,
        StateItemKind::Blocker,
        "blockers",
        &mut seen_keys,
    )?;

    Ok(ProjectState {
        identity,
        observed_at: state.observed_at,
        sources,
        status_summary,
        evidence_refs: state_evidence_refs,
        freshness,
        schema_version: SCHEMA_VERSION,
        state_fingerprint: state.state_fingerprint,
        objective,
        milestones,
        tasks,
        risks,
        decisions,
        dependencies,
        blockers,
    })
}

fn collection_projection(items: &Option<Vec<CanonicalStateItem>>) -> CanonicalValue {
    match items {
        None => CanonicalValue::Null,
        Some(list) => CanonicalValue::Array(list.iter().map(item_projection).collect()),
    }
}

/// The semantic projection of a normalized state used for its fingerprint.
///
/// Excludes `observedAt`, `Freshness`, and the existing `stateFingerprint`:
/// capturing the same project at a later time, or with different freshness, must
/// keep the same semantic fingerprint — temporal data belongs to the snapshot.
fn state_projection(state: &ProjectState) -> CanonicalValue {
    let identity = obj(vec![
        ("id", CanonicalValue::str(&state.identity.id)),
        (
            "kind",
            CanonicalValue::str(match state.identity.kind {
                crate::contracts::projectbrain::ProjectIdentityKind::Explicit => "explicit",
                crate::contracts::projectbrain::ProjectIdentityKind::Derived => "derived",
            }),
        ),
        ("displayName", opt_str(&state.identity.display_name)),
        ("rootHint", opt_str(&state.identity.root_hint)),
    ]);
    let sources = CanonicalValue::Array(
        state
            .sources
            .iter()
            .map(|s| {
                obj(vec![
                    (
                        "sourceKind",
                        CanonicalValue::str(source_kind_wire(&s.source_kind)),
                    ),
                    ("sourceIdentity", CanonicalValue::str(&s.source_identity)),
                ])
            })
            .collect(),
    );
    let mut status_summary = BTreeMap::new();
    for (k, v) in &state.status_summary {
        status_summary.insert(k.clone(), CanonicalValue::Int(*v));
    }
    obj(vec![
        ("schemaVersion", CanonicalValue::Int(SCHEMA_VERSION)),
        ("identity", identity),
        ("sources", sources),
        ("statusSummary", CanonicalValue::Object(status_summary)),
        ("objective", opt_str(&state.objective)),
        ("milestones", collection_projection(&state.milestones)),
        ("tasks", collection_projection(&state.tasks)),
        ("risks", collection_projection(&state.risks)),
        ("decisions", collection_projection(&state.decisions)),
        ("dependencies", collection_projection(&state.dependencies)),
        ("blockers", collection_projection(&state.blockers)),
        ("evidenceRefs", str_array(&state.evidence_refs)),
    ])
}

/// Compute the state fingerprint over a normalized state.
///
/// Returns `sha256:<64 lowercase hex>`.
pub fn compute_state_fingerprint(state: &ProjectState) -> Result<String, ProjectBrainError> {
    let hex = fingerprint_hex(PROJECT_STATE_DOMAIN, &state_projection(state))?;
    Ok(format!("sha256:{hex}"))
}

/// Normalize a state and stamp its computed `stateFingerprint`.
pub fn finalize_project_state(state: ProjectState) -> Result<ProjectState, ProjectBrainError> {
    let mut normalized = normalize_project_state(state)?;
    let fingerprint = compute_state_fingerprint(&normalized)?;
    normalized.state_fingerprint = fingerprint;
    Ok(normalized)
}

// ---------------------------------------------------------------------------
// ProjectSnapshot normalization and fingerprint.
// ---------------------------------------------------------------------------

/// Normalize a snapshot: finalize the embedded state, normalize/sort boundaries
/// and evidence refs, and verify the project id matches the embedded identity.
///
/// The caller-provided `snapshotId` and `fingerprint` are not trusted.
pub fn normalize_project_snapshot(
    snapshot: ProjectSnapshot,
) -> Result<ProjectSnapshot, ProjectBrainError> {
    if snapshot.schema_version != SCHEMA_VERSION {
        return Err(ProjectBrainError::at(
            OMP_K_PB_INVALID_SCHEMA_VERSION,
            "unsupported snapshot schema version",
            "/snapshot/schemaVersion",
        ));
    }
    let project_id = normalize_id(&snapshot.project_id, MAX_ID_BYTES, "/snapshot/projectId")?;
    let state = finalize_project_state(snapshot.state)?;
    if state.identity.id != project_id {
        return Err(ProjectBrainError::at(
            OMP_K_PB_MISMATCH,
            "snapshot projectId does not match the embedded state identity",
            "/snapshot/projectId",
        ));
    }
    parse_rfc3339(&snapshot.captured_at, "/snapshot/capturedAt")?;

    if snapshot.source_boundaries.len() > MAX_SOURCE_BOUNDARIES {
        return Err(ProjectBrainError::at(
            OMP_K_PB_LIMIT_EXCEEDED,
            "source boundaries exceed the maximum permitted count",
            "/snapshot/sourceBoundaries",
        ));
    }
    let mut boundaries: Vec<SourceBoundary> = Vec::with_capacity(snapshot.source_boundaries.len());
    let mut boundary_keys = std::collections::BTreeSet::new();
    for (i, b) in snapshot.source_boundaries.iter().enumerate() {
        let path = format!("/snapshot/sourceBoundaries/{i}");
        let source_identity =
            normalize_source_identity(&b.source_identity, &format!("{path}/sourceIdentity"))?;
        let included_scope = normalize_required_text(
            &b.included_scope,
            MAX_TITLE_BYTES,
            &format!("{path}/includedScope"),
        )?;
        let gap_reason = normalize_optional_text(
            b.gap_reason.as_deref(),
            MAX_TITLE_BYTES,
            &format!("{path}/gapReason"),
        )?;
        if !boundary_keys.insert((source_identity.clone(), included_scope.clone())) {
            return Err(ProjectBrainError::at(
                OMP_K_PB_DUPLICATE,
                "duplicate boundary identity and scope after normalization",
                &path,
            ));
        }
        boundaries.push(SourceBoundary {
            source_identity,
            included_scope,
            coverage_state: b.coverage_state.clone(),
            gap_reason,
        });
    }
    boundaries.sort_by(|a, b| {
        a.source_identity
            .cmp(&b.source_identity)
            .then_with(|| a.included_scope.cmp(&b.included_scope))
            .then_with(|| {
                coverage_state_wire(&a.coverage_state).cmp(coverage_state_wire(&b.coverage_state))
            })
    });

    let evidence_refs = normalize_evidence_refs(
        &snapshot.evidence_refs,
        MAX_STATE_EVIDENCE_REFS,
        "/snapshot/evidenceRefs",
    )?;

    Ok(ProjectSnapshot {
        snapshot_id: snapshot.snapshot_id,
        project_id,
        captured_at: snapshot.captured_at,
        source_boundaries: boundaries,
        state,
        evidence_refs,
        schema_version: SCHEMA_VERSION,
        fingerprint: snapshot.fingerprint,
    })
}

/// The snapshot fingerprint projection: schemaVersion, projectId, capturedAt,
/// normalized boundaries, the finalized state fingerprint, and sorted evidence
/// refs. Excludes snapshotId, the existing fingerprint, and embedded state
/// fields already covered by the state fingerprint.
fn snapshot_projection(snapshot: &ProjectSnapshot) -> CanonicalValue {
    let boundaries = CanonicalValue::Array(
        snapshot
            .source_boundaries
            .iter()
            .map(|b| {
                obj(vec![
                    ("sourceIdentity", CanonicalValue::str(&b.source_identity)),
                    ("includedScope", CanonicalValue::str(&b.included_scope)),
                    (
                        "coverageState",
                        CanonicalValue::str(coverage_state_wire(&b.coverage_state)),
                    ),
                    ("gapReason", opt_str(&b.gap_reason)),
                ])
            })
            .collect(),
    );
    obj(vec![
        ("schemaVersion", CanonicalValue::Int(SCHEMA_VERSION)),
        ("projectId", CanonicalValue::str(&snapshot.project_id)),
        ("capturedAt", CanonicalValue::str(&snapshot.captured_at)),
        ("sourceBoundaries", boundaries),
        (
            "stateFingerprint",
            CanonicalValue::str(&snapshot.state.state_fingerprint),
        ),
        ("evidenceRefs", str_array(&snapshot.evidence_refs)),
    ])
}

/// Compute the snapshot fingerprint over a normalized snapshot.
///
/// Returns `sha256:<64 lowercase hex>`.
pub fn compute_snapshot_fingerprint(
    snapshot: &ProjectSnapshot,
) -> Result<String, ProjectBrainError> {
    let hex = fingerprint_hex(PROJECT_SNAPSHOT_DOMAIN, &snapshot_projection(snapshot))?;
    Ok(format!("sha256:{hex}"))
}

/// Normalize a snapshot and stamp its computed `fingerprint` and `snapshotId`.
///
/// The snapshot id hex payload reuses the snapshot fingerprint hex component:
/// `snapshotId = snapshot:<64 lowercase hex>`.
pub fn finalize_project_snapshot(
    snapshot: ProjectSnapshot,
) -> Result<ProjectSnapshot, ProjectBrainError> {
    let mut normalized = normalize_project_snapshot(snapshot)?;
    let fingerprint = compute_snapshot_fingerprint(&normalized)?;
    // fingerprint is `sha256:<hex>`; reuse the hex for the snapshot id.
    let hex = fingerprint
        .strip_prefix("sha256:")
        .expect("computed fingerprint always carries the sha256: prefix");
    normalized.snapshot_id = format!("snapshot:{hex}");
    normalized.fingerprint = fingerprint;
    Ok(normalized)
}

/// Validate that every evidence reference held by a snapshot's state and items
/// exists in the provided evidence id set. Groundwork for G5 traceability.
pub fn assert_evidence_present(
    snapshot: &ProjectSnapshot,
    available: &std::collections::BTreeSet<String>,
) -> Result<(), ProjectBrainError> {
    let check = |refs: &[String], path: &str| -> Result<(), ProjectBrainError> {
        for r in refs {
            if !available.contains(r) {
                return Err(ProjectBrainError::at(
                    OMP_K_PB_MISSING_EVIDENCE,
                    "referenced evidence id is not present in the provided set",
                    path,
                ));
            }
        }
        Ok(())
    };
    check(
        &snapshot.state.evidence_refs,
        "/snapshot/state/evidenceRefs",
    )?;
    check(&snapshot.evidence_refs, "/snapshot/evidenceRefs")?;
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
            check(&item.evidence_refs, "/snapshot/state/item/evidenceRefs")?;
        }
    }
    Ok(())
}
