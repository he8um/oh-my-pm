//! WASM exports exposing Kernel operations to JavaScript hosts.
//!
//! Complex values cross the boundary as JSON strings. Every export delegates
//! to the existing Kernel modules; no Kernel logic is duplicated here.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::contracts::kernel::{
    ReleaseState, StateTransitionDecision, StateTransitionInput, UpdateGuardDecision, UpdatePlan,
    ValidationTarget,
};
use crate::contracts::projectbrain::{
    ChangeSet, EvidenceRecord, ProjectSnapshot, ProjectState, TimelineQuery,
};
use crate::errors::{blocking_finding, validation_report, OMP_K_INVALID_PAYLOAD};
use crate::projectbrain::{
    derive_evidence_id, derive_freshness, derive_project_timeline, diff_project_snapshots,
    finalize_project_snapshot, finalize_project_state, fingerprint_minimized_content,
    resolve_project_identity, FreshnessInput, FreshnessPolicy, ProjectBrainError,
    ProjectIdentitySeed, SnapshotDiffInput, StalenessPolicy, TimelineCapture,
    TimelineDerivationInput,
};
use crate::{state, update_guard, validation};

fn to_json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("contract types serialize to JSON")
}

// --- Project Brain binding envelope (v0.3 Phase 3) -------------------------
//
// The Project Brain Kernel functions are fallible (`Result<T, ProjectBrainError>`)
// and their input structs are internal (not serde contracts). Each binding
// export parses a typed JSON input, invokes the existing Phase 1 function, and
// serializes a deterministic result envelope. Invalid JSON or a Kernel error is
// returned as a serialized `{ ok: false, error }` value — never a WASM throw —
// so the boundary stays fail-closed and deterministic.

/// Serializable mirror of `ProjectBrainError` for the binding boundary.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PbErrorEnvelope {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

impl From<ProjectBrainError> for PbErrorEnvelope {
    fn from(err: ProjectBrainError) -> Self {
        PbErrorEnvelope {
            code: err.code.to_string(),
            message: err.message,
            path: err.path,
        }
    }
}

/// The tagged result envelope returned by every Project Brain binding export.
#[derive(Serialize)]
#[serde(untagged)]
enum PbResultEnvelope<T: Serialize> {
    Ok { ok: bool, value: T },
    Err { ok: bool, error: PbErrorEnvelope },
}

/// Serialize a `Result<T, ProjectBrainError>` as a tagged envelope string.
fn pb_envelope<T: Serialize>(result: Result<T, ProjectBrainError>) -> String {
    match result {
        Ok(value) => to_json(&PbResultEnvelope::Ok { ok: true, value }),
        Err(err) => to_json::<PbResultEnvelope<T>>(&PbResultEnvelope::Err {
            ok: false,
            error: err.into(),
        }),
    }
}

/// A binding-only invalid-input error (returned when JSON fails to parse).
fn pb_invalid_input(message: &str) -> String {
    to_json::<PbResultEnvelope<serde_json::Value>>(&PbResultEnvelope::Err {
        ok: false,
        error: PbErrorEnvelope {
            code: "OMP-K-PB-1002".to_string(),
            message: message.to_string(),
            path: None,
        },
    })
}

// --- Serde input wrappers for the non-contract Kernel input structs --------

/// JSON-deserializable seed for `resolve_project_identity`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectIdentitySeedInputJson {
    #[serde(default)]
    explicit_id: Option<String>,
    #[serde(default)]
    normalized_root_token: Option<String>,
    #[serde(default)]
    local_salt: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    root_hint: Option<String>,
}

impl From<ProjectIdentitySeedInputJson> for ProjectIdentitySeed {
    fn from(j: ProjectIdentitySeedInputJson) -> Self {
        ProjectIdentitySeed {
            explicit_id: j.explicit_id,
            normalized_root_token: j.normalized_root_token,
            local_salt: j.local_salt,
            display_name: j.display_name,
            root_hint: j.root_hint,
        }
    }
}

/// JSON-deserializable input for `fingerprintMinimizedContent`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FingerprintContentInputJson {
    content: String,
}

/// JSON-deserializable input for `deriveFreshness` (input + policy together).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FreshnessInputJson {
    observation_at: String,
    #[serde(default)]
    source_updated_ats: Vec<Option<String>>,
    #[serde(default)]
    evidence_changed_ats: Vec<Option<String>>,
    reference_at: String,
    #[serde(default)]
    coverage_gaps: Vec<String>,
    max_future_skew_seconds: i64,
}

/// JSON-deserializable staleness policy for `diffProjectSnapshots`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StalenessPolicyInputJson {
    evidence_stale_after_seconds: i64,
    max_future_skew_seconds: i64,
}

/// JSON-deserializable input for `diffProjectSnapshots`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotDiffInputJson {
    previous: ProjectSnapshot,
    current: ProjectSnapshot,
    #[serde(default)]
    previous_evidence: Vec<EvidenceRecord>,
    #[serde(default)]
    current_evidence: Vec<EvidenceRecord>,
    compared_at: String,
    staleness_policy: StalenessPolicyInputJson,
}

/// JSON-deserializable adjacent comparison for `deriveProjectTimeline` (v0.4).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineCaptureJson {
    snapshot_id: String,
    capture_sequence: i64,
    captured_at: String,
    change_set: ChangeSet,
}

/// JSON-deserializable input for `deriveProjectTimeline` (v0.4).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineDerivationInputJson {
    #[serde(default)]
    captures: Vec<TimelineCaptureJson>,
    query: TimelineQuery,
}

/// Resolve a ProjectIdentity from a caller-supplied seed.
#[wasm_bindgen(js_name = deriveProjectIdentity)]
pub fn derive_project_identity_wasm(seed_json: String) -> String {
    match serde_json::from_str::<ProjectIdentitySeedInputJson>(&seed_json) {
        Ok(seed) => pb_envelope(resolve_project_identity(&seed.into())),
        Err(_) => pb_invalid_input("invalid project identity seed json"),
    }
}

/// Fingerprint minimized content (SHA-256 over a bounded, normalized string).
#[wasm_bindgen(js_name = fingerprintMinimizedContent)]
pub fn fingerprint_minimized_content_wasm(input_json: String) -> String {
    match serde_json::from_str::<FingerprintContentInputJson>(&input_json) {
        Ok(input) => pb_envelope(fingerprint_minimized_content(&input.content)),
        Err(_) => pb_invalid_input("invalid fingerprint content json"),
    }
}

/// Derive the deterministic evidence id for a minimized EvidenceRecord.
#[wasm_bindgen(js_name = deriveEvidenceId)]
pub fn derive_evidence_id_wasm(record_json: String) -> String {
    match serde_json::from_str::<EvidenceRecord>(&record_json) {
        Ok(record) => pb_envelope(derive_evidence_id(&record)),
        Err(_) => pb_invalid_input("invalid evidence record json"),
    }
}

/// Derive the four freshness dimensions from injected timestamps.
#[wasm_bindgen(js_name = deriveFreshness)]
pub fn derive_freshness_wasm(input_json: String) -> String {
    match serde_json::from_str::<FreshnessInputJson>(&input_json) {
        Ok(j) => {
            let policy = FreshnessPolicy {
                max_future_skew_seconds: j.max_future_skew_seconds,
            };
            let input = FreshnessInput {
                observation_at: j.observation_at,
                source_updated_ats: j.source_updated_ats,
                evidence_changed_ats: j.evidence_changed_ats,
                reference_at: j.reference_at,
                coverage_gaps: j.coverage_gaps,
            };
            pb_envelope(derive_freshness(input, policy))
        }
        Err(_) => pb_invalid_input("invalid freshness input json"),
    }
}

/// Normalize and finalize a ProjectState (stamps its stateFingerprint).
#[wasm_bindgen(js_name = finalizeProjectState)]
pub fn finalize_project_state_wasm(state_json: String) -> String {
    match serde_json::from_str::<ProjectState>(&state_json) {
        Ok(state) => pb_envelope(finalize_project_state(state)),
        Err(_) => pb_invalid_input("invalid project state json"),
    }
}

/// Normalize and finalize a ProjectSnapshot (stamps its id and fingerprint).
#[wasm_bindgen(js_name = finalizeProjectSnapshot)]
pub fn finalize_project_snapshot_wasm(snapshot_json: String) -> String {
    match serde_json::from_str::<ProjectSnapshot>(&snapshot_json) {
        Ok(snapshot) => pb_envelope(finalize_project_snapshot(snapshot)),
        Err(_) => pb_invalid_input("invalid project snapshot json"),
    }
}

/// Compute the deterministic ChangeSet between two committed snapshots.
#[wasm_bindgen(js_name = diffProjectSnapshots)]
pub fn diff_project_snapshots_wasm(input_json: String) -> String {
    match serde_json::from_str::<SnapshotDiffInputJson>(&input_json) {
        Ok(j) => {
            let input = SnapshotDiffInput {
                previous: j.previous,
                current: j.current,
                previous_evidence: j.previous_evidence,
                current_evidence: j.current_evidence,
                compared_at: j.compared_at,
                staleness_policy: StalenessPolicy {
                    evidence_stale_after_seconds: j.staleness_policy.evidence_stale_after_seconds,
                    max_future_skew_seconds: j.staleness_policy.max_future_skew_seconds,
                },
            };
            pb_envelope(diff_project_snapshots(input))
        }
        Err(_) => pb_invalid_input("invalid snapshot diff input json"),
    }
}

/// Derive the bounded, deterministic Project Timeline (v0.4).
///
/// Consumes adjacent committed-snapshot comparisons in authoritative capture
/// order plus a validated query, and returns a bounded, filtered, newest-first
/// `TimelineResult`. Pure: no clock, filesystem, environment, network, or
/// randomness is read, and nothing is persisted.
#[wasm_bindgen(js_name = deriveProjectTimeline)]
pub fn derive_project_timeline_wasm(input_json: String) -> String {
    match serde_json::from_str::<TimelineDerivationInputJson>(&input_json) {
        Ok(j) => {
            let input = TimelineDerivationInput {
                captures: j
                    .captures
                    .into_iter()
                    .map(|c| TimelineCapture {
                        snapshot_id: c.snapshot_id,
                        capture_sequence: c.capture_sequence,
                        captured_at: c.captured_at,
                        change_set: c.change_set,
                    })
                    .collect(),
                query: j.query,
            };
            pb_envelope(derive_project_timeline(&input))
        }
        Err(_) => pb_invalid_input("invalid project timeline input json"),
    }
}

/// Kernel crate version.
#[wasm_bindgen(js_name = kernelVersion)]
pub fn kernel_version_wasm() -> String {
    crate::kernel_version().to_string()
}

/// Validate a JSON payload against the rules for `target`.
///
/// Returns a serialized `ValidationReport`. Invalid inputs produce a failed
/// report instead of an exception so the boundary stays deterministic.
#[wasm_bindgen(js_name = validateJson)]
pub fn validate_json_wasm(target: String, payload_json: String) -> String {
    let target =
        match serde_json::from_value::<ValidationTarget>(serde_json::Value::String(target)) {
            Ok(target) => target,
            Err(_) => {
                return to_json(&validation_report(
                    ValidationTarget::SystemRequest,
                    vec![blocking_finding(
                        OMP_K_INVALID_PAYLOAD,
                        "invalid validation target",
                        "",
                    )],
                    Vec::new(),
                ));
            }
        };

    let payload = match serde_json::from_str::<serde_json::Value>(&payload_json) {
        Ok(payload) => payload,
        Err(_) => {
            return to_json(&validation_report(
                target,
                vec![blocking_finding(
                    OMP_K_INVALID_PAYLOAD,
                    "payload is not valid JSON",
                    "",
                )],
                Vec::new(),
            ));
        }
    };

    to_json(&validation::validate_json(target, payload))
}

/// Check an update plan and return the serialized `UpdateGuardDecision`.
#[wasm_bindgen(js_name = checkUpdatePlan)]
pub fn check_update_plan_wasm(plan_json: String) -> String {
    match serde_json::from_str::<UpdatePlan>(&plan_json) {
        Ok(plan) => to_json(&update_guard::check_update_plan(&plan)),
        Err(_) => to_json(&UpdateGuardDecision::Blocked {
            plan_id: String::new(),
            plan_hash: "invalid:updatePlan".to_string(),
            reasons: vec!["invalid_update_plan_json".to_string()],
        }),
    }
}

/// Decide a release state transition and return the serialized decision.
#[wasm_bindgen(js_name = decideTransition)]
pub fn decide_transition_wasm(input_json: String) -> String {
    match serde_json::from_str::<StateTransitionInput>(&input_json) {
        Ok(input) => to_json(&state::decide_transition(input)),
        Err(_) => to_json(&StateTransitionDecision {
            from: ReleaseState::Idea,
            to: ReleaseState::Idea,
            allowed: false,
            reason: "invalid_state_transition_input_json".to_string(),
        }),
    }
}
