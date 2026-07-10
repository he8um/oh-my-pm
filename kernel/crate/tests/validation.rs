use oh_my_pm_kernel::contracts::kernel::ValidationTarget;
use oh_my_pm_kernel::validate_json;
use serde_json::json;

fn registry_components() -> serde_json::Value {
    json!([
        { "id": "contracts", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "kernel", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "runtime", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "planner", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "providers", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "skills", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "cli", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "installer", "version": "2.0.0-alpha.0", "state": "source" },
        { "id": "validation", "version": "2.0.0-alpha.0", "state": "source" }
    ])
}

fn task_node(id: &str, deps: &[&str]) -> serde_json::Value {
    json!({
        "id": id,
        "kind": "skillExecution",
        "title": format!("node {id}"),
        "dependsOn": deps,
        "payload": {}
    })
}

#[test]
fn invalid_shapes_fail_with_invalid_payload_code() {
    let targets = [
        ValidationTarget::SystemRequest,
        ValidationTarget::TaskGraph,
        ValidationTarget::ProviderResponse,
        ValidationTarget::SkillInput,
        ValidationTarget::SkillOutput,
        ValidationTarget::VersionRegistry,
        ValidationTarget::UpdatePlan,
        ValidationTarget::InstallManifest,
    ];
    for target in targets {
        let report = validate_json(target.clone(), json!({ "unexpected": true }));
        assert!(!report.passed, "{target:?} should fail on wrong shape");
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].code, "OMP-K-1002");
        assert_eq!(report.errors[0].path, "");
    }
}

#[test]
fn valid_version_registry_passes() {
    let report = validate_json(
        ValidationTarget::VersionRegistry,
        json!({
            "schemaVersion": "1",
            "systemVersion": "2.0.0-alpha.0",
            "components": registry_components()
        }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn incomplete_version_registry_fails() {
    let report = validate_json(
        ValidationTarget::VersionRegistry,
        json!({
            "schemaVersion": "1",
            "systemVersion": "2.0.0-alpha.0",
            "components": [
                { "id": "kernel", "version": "2.0.0-alpha.0", "state": "source" }
            ]
        }),
    );
    assert!(!report.passed);
    assert!(report.errors.iter().all(|f| f.code == "OMP-K-1004"));
    assert_eq!(report.errors.len(), 8);
}

#[test]
fn valid_update_plan_passes() {
    let report = validate_json(
        ValidationTarget::UpdatePlan,
        json!({
            "id": "plan-1",
            "fromVersion": "2.0.0-alpha.0",
            "toVersion": "2.0.0-alpha.1",
            "steps": [{ "kind": "replace", "path": "bin/omp" }],
            "rollback": { "id": "rb-1", "createdAt": "caller-supplied", "paths": ["bin"] }
        }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn blocked_update_plan_fails_with_reasons() {
    let report = validate_json(
        ValidationTarget::UpdatePlan,
        json!({
            "id": "plan-1",
            "fromVersion": "2.0.0-alpha.0",
            "toVersion": "2.0.0-alpha.0",
            "steps": [],
            "rollback": { "id": "rb-1", "createdAt": "caller-supplied", "paths": ["bin"] }
        }),
    );
    assert!(!report.passed);
    assert_eq!(report.errors.len(), 2);
    assert!(report.errors.iter().all(|f| f.code == "OMP-K-1005"));
}

#[test]
fn valid_task_graph_passes() {
    let report = validate_json(
        ValidationTarget::TaskGraph,
        json!({ "nodes": [task_node("read", &[]), task_node("summarize", &["read"])] }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn duplicate_task_node_id_fails() {
    let report = validate_json(
        ValidationTarget::TaskGraph,
        json!({ "nodes": [task_node("a", &[]), task_node("a", &[])] }),
    );
    assert!(!report.passed);
    assert!(report.errors.iter().any(|f| f.message.contains("duplicate")));
}

#[test]
fn unknown_dependency_fails() {
    let report = validate_json(
        ValidationTarget::TaskGraph,
        json!({ "nodes": [task_node("a", &["ghost"])] }),
    );
    assert!(!report.passed);
    assert!(report.errors.iter().any(|f| f.message.contains("unknown node ghost")));
}

#[test]
fn task_graph_cycle_fails() {
    let report = validate_json(
        ValidationTarget::TaskGraph,
        json!({
            "nodes": [task_node("a", &["b"]), task_node("b", &["c"]), task_node("c", &["a"])]
        }),
    );
    assert!(!report.passed);
    assert!(report.errors.iter().any(|f| f.message.contains("cycle")));
}

#[test]
fn valid_provider_response_passes() {
    let report = validate_json(
        ValidationTarget::ProviderResponse,
        json!({
            "providerId": "github",
            "items": [{
                "id": "42",
                "type": "issue",
                "title": "Fix login",
                "source": "github",
                "data": {}
            }]
        }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn valid_skill_envelopes_pass() {
    let input = validate_json(
        ValidationTarget::SkillInput,
        json!({
            "skillId": "summarizeStatus",
            "context": { "locale": "en", "now": "caller-supplied" },
            "input": {}
        }),
    );
    assert!(input.passed, "{:?}", input.errors);

    let output = validate_json(
        ValidationTarget::SkillOutput,
        json!({
            "skillId": "summarizeStatus",
            "ok": true,
            "output": { "summary": "all good" }
        }),
    );
    assert!(output.passed, "{:?}", output.errors);
}

#[test]
fn valid_runtime_request_passes() {
    let report = validate_json(
        ValidationTarget::SystemRequest,
        json!({ "id": "req-1", "kind": "status", "locale": "en", "payload": {} }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn valid_install_manifest_passes() {
    let report = validate_json(
        ValidationTarget::InstallManifest,
        json!({
            "schemaVersion": "1",
            "version": "2.0.0-alpha.0",
            "installedAt": "caller-supplied",
            "root": "~/.oh-my-pm"
        }),
    );
    assert!(report.passed, "{:?}", report.errors);
}

#[test]
fn reports_are_deterministic() {
    let payload = json!({ "nodes": [task_node("a", &["b"]), task_node("b", &["a"])] });
    let first = validate_json(ValidationTarget::TaskGraph, payload.clone());
    let second = validate_json(ValidationTarget::TaskGraph, payload);
    assert_eq!(
        serde_json::to_string(&first).unwrap(),
        serde_json::to_string(&second).unwrap()
    );
}
