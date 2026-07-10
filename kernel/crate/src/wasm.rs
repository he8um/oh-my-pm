//! WASM exports exposing Kernel operations to JavaScript hosts.
//!
//! Complex values cross the boundary as JSON strings. Every export delegates
//! to the existing Kernel modules; no Kernel logic is duplicated here.

use wasm_bindgen::prelude::*;

use crate::contracts::kernel::{
    ReleaseState, StateTransitionDecision, StateTransitionInput, UpdateGuardDecision, UpdatePlan,
    ValidationTarget,
};
use crate::errors::{blocking_finding, validation_report, OMP_K_INVALID_PAYLOAD};
use crate::{state, update_guard, validation};

fn to_json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("contract types serialize to JSON")
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
