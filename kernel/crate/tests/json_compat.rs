use oh_my_pm_kernel::contracts::kernel::{
    ReleaseState, UpdateGuardDecision, ValidationReport, ValidationTarget,
};
use oh_my_pm_kernel::errors::{blocking_finding, validation_report};
use serde_json::json;

#[test]
fn release_state_round_trips_as_camel_case_string() {
    let serialized = serde_json::to_value(ReleaseState::Validation).unwrap();
    assert_eq!(serialized, json!("validation"));
    let parsed: ReleaseState = serde_json::from_value(json!("published")).unwrap();
    assert_eq!(parsed, ReleaseState::Published);
}

#[test]
fn validation_report_round_trips_with_camel_case_fields() {
    let report = validation_report(
        ValidationTarget::VersionRegistry,
        vec![blocking_finding("OMP-K-1004", "missing", "/components")],
        Vec::new(),
    );
    let value = serde_json::to_value(&report).unwrap();
    assert_eq!(value["target"], json!("versionRegistry"));
    assert_eq!(value["passed"], json!(false));
    assert_eq!(value["errors"][0]["blocking"], json!(true));
    assert_eq!(value["errors"][0]["path"], json!("/components"));

    let parsed: ValidationReport = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, report);
}

#[test]
fn update_guard_decision_uses_status_tag_and_camel_case() {
    let decision = UpdateGuardDecision::Allowed {
        plan_id: "plan-1".to_string(),
        plan_hash: "plan:plan-1:a:b:1".to_string(),
        reasons: Vec::new(),
    };
    let value = serde_json::to_value(&decision).unwrap();
    assert_eq!(value["status"], json!("allowed"));
    assert_eq!(value["planId"], json!("plan-1"));
    assert_eq!(value["planHash"], json!("plan:plan-1:a:b:1"));

    let parsed: UpdateGuardDecision = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, decision);

    let blocked: UpdateGuardDecision = serde_json::from_value(json!({
        "status": "blocked",
        "planId": "plan-2",
        "planHash": "plan:plan-2:a:a:0",
        "reasons": ["same_version"]
    }))
    .unwrap();
    assert!(matches!(blocked, UpdateGuardDecision::Blocked { .. }));
}
