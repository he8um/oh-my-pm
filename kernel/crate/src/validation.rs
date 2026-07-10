//! Validation shell: structural checks plus target-specific semantic checks.

use std::collections::{BTreeMap, BTreeSet};

use crate::contracts::installer::InstallManifest;
use crate::contracts::kernel::{
    UpdateGuardDecision, UpdatePlan, ValidationFinding, ValidationReport, ValidationTarget,
    VersionRegistryManifest,
};
use crate::contracts::planner::TaskGraph;
use crate::contracts::providers::NormalizedProviderResponse;
use crate::contracts::runtime::RuntimeRequest;
use crate::contracts::skills::{SkillInputEnvelope, SkillOutputEnvelope};
use crate::errors::{
    blocking_finding, validation_report, OMP_K_INVALID_PAYLOAD, OMP_K_INVALID_TASK_GRAPH,
    OMP_K_INVALID_UPDATE_PLAN,
};
use crate::{registry, update_guard};

/// Validate a JSON payload against the schema and rules for `target`.
pub fn validate_json(target: ValidationTarget, payload: serde_json::Value) -> ValidationReport {
    match target {
        ValidationTarget::SystemRequest => structural::<RuntimeRequest>(target, payload),
        ValidationTarget::ProviderResponse => {
            structural::<NormalizedProviderResponse>(target, payload)
        }
        ValidationTarget::SkillInput => structural::<SkillInputEnvelope>(target, payload),
        ValidationTarget::SkillOutput => structural::<SkillOutputEnvelope>(target, payload),
        ValidationTarget::InstallManifest => structural::<InstallManifest>(target, payload),
        ValidationTarget::VersionRegistry => {
            match serde_json::from_value::<VersionRegistryManifest>(payload) {
                Ok(manifest) => validation_report(
                    target,
                    registry::validate_version_registry(&manifest),
                    Vec::new(),
                ),
                Err(error) => deserialization_failure(target, &error),
            }
        }
        ValidationTarget::UpdatePlan => match serde_json::from_value::<UpdatePlan>(payload) {
            Ok(plan) => {
                let errors = match update_guard::check_update_plan(&plan) {
                    UpdateGuardDecision::Allowed { .. } => Vec::new(),
                    UpdateGuardDecision::Blocked { reasons, .. } => reasons
                        .iter()
                        .map(|reason| {
                            blocking_finding(
                                OMP_K_INVALID_UPDATE_PLAN,
                                format!("update plan blocked: {reason}"),
                                "",
                            )
                        })
                        .collect(),
                };
                validation_report(target, errors, Vec::new())
            }
            Err(error) => deserialization_failure(target, &error),
        },
        ValidationTarget::TaskGraph => match serde_json::from_value::<TaskGraph>(payload) {
            Ok(graph) => validation_report(target, validate_task_graph(&graph), Vec::new()),
            Err(error) => deserialization_failure(target, &error),
        },
    }
}

fn structural<T: serde::de::DeserializeOwned>(
    target: ValidationTarget,
    payload: serde_json::Value,
) -> ValidationReport {
    match serde_json::from_value::<T>(payload) {
        Ok(_) => validation_report(target, Vec::new(), Vec::new()),
        Err(error) => deserialization_failure(target, &error),
    }
}

fn deserialization_failure(
    target: ValidationTarget,
    error: &serde_json::Error,
) -> ValidationReport {
    validation_report(
        target,
        vec![blocking_finding(
            OMP_K_INVALID_PAYLOAD,
            format!("payload does not match the contract: {error}"),
            "",
        )],
        Vec::new(),
    )
}

/// Basic task graph checks: non-empty unique IDs, resolvable dependencies,
/// and no cycles. Deterministic over sorted node IDs.
fn validate_task_graph(graph: &TaskGraph) -> Vec<ValidationFinding> {
    let mut findings = Vec::new();

    let mut ids = BTreeSet::new();
    for (index, node) in graph.nodes.iter().enumerate() {
        if node.id.is_empty() {
            findings.push(blocking_finding(
                OMP_K_INVALID_TASK_GRAPH,
                "task node id must not be empty",
                format!("/nodes/{index}/id"),
            ));
        } else if !ids.insert(node.id.as_str()) {
            findings.push(blocking_finding(
                OMP_K_INVALID_TASK_GRAPH,
                format!("duplicate task node id {}", node.id),
                format!("/nodes/{index}/id"),
            ));
        }
    }

    for (index, node) in graph.nodes.iter().enumerate() {
        for dependency in &node.depends_on {
            if !ids.contains(dependency.as_str()) {
                findings.push(blocking_finding(
                    OMP_K_INVALID_TASK_GRAPH,
                    format!("task node {} depends on unknown node {dependency}", node.id),
                    format!("/nodes/{index}/dependsOn"),
                ));
            }
        }
    }

    findings.extend(find_cycles(graph, &ids));
    findings
}

#[derive(Clone, Copy, PartialEq)]
enum VisitState {
    InProgress,
    Done,
}

/// Deterministic iterative DFS over sorted node IDs; reports each node where
/// a cycle is first detected.
fn find_cycles(graph: &TaskGraph, ids: &BTreeSet<&str>) -> Vec<ValidationFinding> {
    let mut edges: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for node in &graph.nodes {
        let deps = edges.entry(node.id.as_str()).or_default();
        for dependency in &node.depends_on {
            if ids.contains(dependency.as_str()) {
                deps.push(dependency.as_str());
            }
        }
    }

    let mut findings = Vec::new();
    let mut state: BTreeMap<&str, VisitState> = BTreeMap::new();

    for &start in ids {
        if state.contains_key(start) {
            continue;
        }
        // Stack of (node, next dependency index) frames.
        let mut stack: Vec<(&str, usize)> = vec![(start, 0)];
        state.insert(start, VisitState::InProgress);
        while let Some(&mut (node, ref mut next)) = stack.last_mut() {
            let deps = edges.get(node).map(Vec::as_slice).unwrap_or(&[]);
            if *next < deps.len() {
                let dependency = deps[*next];
                *next += 1;
                match state.get(dependency) {
                    Some(VisitState::InProgress) => {
                        findings.push(blocking_finding(
                            OMP_K_INVALID_TASK_GRAPH,
                            format!("task graph cycle detected involving node {dependency}"),
                            "/nodes",
                        ));
                    }
                    Some(VisitState::Done) => {}
                    None => {
                        state.insert(dependency, VisitState::InProgress);
                        stack.push((dependency, 0));
                    }
                }
            } else {
                state.insert(node, VisitState::Done);
                stack.pop();
            }
        }
    }

    findings
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn graph(nodes: serde_json::Value) -> serde_json::Value {
        json!({ "nodes": nodes })
    }

    fn node(id: &str, deps: &[&str]) -> serde_json::Value {
        json!({
            "id": id,
            "kind": "providerRead",
            "title": format!("node {id}"),
            "dependsOn": deps,
            "payload": {}
        })
    }

    #[test]
    fn valid_task_graph_passes() {
        let report = validate_json(
            ValidationTarget::TaskGraph,
            graph(json!([node("a", &[]), node("b", &["a"])])),
        );
        assert!(report.passed, "{:?}", report.errors);
    }

    #[test]
    fn cycle_is_detected() {
        let report = validate_json(
            ValidationTarget::TaskGraph,
            graph(json!([node("a", &["b"]), node("b", &["a"])])),
        );
        assert!(!report.passed);
        assert!(report.errors.iter().any(|f| f.message.contains("cycle")));
    }

    #[test]
    fn self_cycle_is_detected() {
        let report = validate_json(
            ValidationTarget::TaskGraph,
            graph(json!([node("a", &["a"])])),
        );
        assert!(!report.passed);
        assert!(report.errors.iter().any(|f| f.message.contains("cycle")));
    }
}
