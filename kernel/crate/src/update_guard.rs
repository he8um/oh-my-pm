//! Update plan guard: decides whether a supplied plan is safe to apply.
//!
//! The guard never applies updates, reads files, or hashes file contents.

use crate::contracts::kernel::{UpdateGuardDecision, UpdatePlan};

/// Deterministic placeholder hash binding a decision to a plan.
///
/// Real content hashing arrives with the installer phase; until then the hash
/// is derived from stable plan fields only.
pub fn plan_hash(plan: &UpdatePlan) -> String {
    format!(
        "plan:{}:{}:{}:{}",
        plan.id,
        plan.from_version,
        plan.to_version,
        plan.steps.len()
    )
}

/// Check a supplied update plan and return the guard decision with every reason.
pub fn check_update_plan(plan: &UpdatePlan) -> UpdateGuardDecision {
    let mut reasons = Vec::new();

    if plan.id.is_empty() {
        reasons.push("missing_plan_id".to_string());
    }
    if plan.from_version.is_empty() {
        reasons.push("missing_from_version".to_string());
    }
    if plan.to_version.is_empty() {
        reasons.push("missing_to_version".to_string());
    }
    if !plan.from_version.is_empty() && plan.from_version == plan.to_version {
        reasons.push("same_version".to_string());
    }
    if plan.steps.is_empty() {
        reasons.push("missing_steps".to_string());
    }
    if plan.rollback.id.is_empty() {
        reasons.push("missing_rollback_id".to_string());
    }
    if plan.rollback.paths.is_empty() {
        reasons.push("missing_rollback_paths".to_string());
    }

    let plan_id = plan.id.clone();
    let hash = plan_hash(plan);
    if reasons.is_empty() {
        UpdateGuardDecision::Allowed {
            plan_id,
            plan_hash: hash,
            reasons,
        }
    } else {
        UpdateGuardDecision::Blocked {
            plan_id,
            plan_hash: hash,
            reasons,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::kernel::{RollbackPoint, UpdatePlanStep, UpdatePlanStepKind};

    fn valid_plan() -> UpdatePlan {
        UpdatePlan {
            id: "plan-1".to_string(),
            from_version: "2.0.0-alpha.0".to_string(),
            to_version: "2.0.0-alpha.1".to_string(),
            steps: vec![UpdatePlanStep {
                kind: UpdatePlanStepKind::Replace,
                path: "bin/omp".to_string(),
                checksum: None,
            }],
            rollback: RollbackPoint {
                id: "rb-1".to_string(),
                created_at: "caller-supplied".to_string(),
                paths: vec!["bin".to_string()],
            },
        }
    }

    #[test]
    fn valid_plan_is_allowed() {
        assert!(matches!(
            check_update_plan(&valid_plan()),
            UpdateGuardDecision::Allowed { .. }
        ));
    }

    #[test]
    fn missing_steps_blocks() {
        let mut plan = valid_plan();
        plan.steps.clear();
        match check_update_plan(&plan) {
            UpdateGuardDecision::Blocked { reasons, .. } => {
                assert_eq!(reasons, vec!["missing_steps".to_string()]);
            }
            other => panic!("expected blocked, got {other:?}"),
        }
    }

    #[test]
    fn same_version_blocks() {
        let mut plan = valid_plan();
        plan.to_version = plan.from_version.clone();
        match check_update_plan(&plan) {
            UpdateGuardDecision::Blocked { reasons, .. } => {
                assert_eq!(reasons, vec!["same_version".to_string()]);
            }
            other => panic!("expected blocked, got {other:?}"),
        }
    }

    #[test]
    fn multiple_issues_return_multiple_reasons() {
        let mut plan = valid_plan();
        plan.id = String::new();
        plan.steps.clear();
        plan.rollback.paths.clear();
        match check_update_plan(&plan) {
            UpdateGuardDecision::Blocked { reasons, .. } => {
                assert_eq!(
                    reasons,
                    vec![
                        "missing_plan_id".to_string(),
                        "missing_steps".to_string(),
                        "missing_rollback_paths".to_string(),
                    ]
                );
            }
            other => panic!("expected blocked, got {other:?}"),
        }
    }

    #[test]
    fn plan_hash_is_deterministic() {
        let plan = valid_plan();
        assert_eq!(plan_hash(&plan), plan_hash(&plan));
        assert_eq!(plan_hash(&plan), "plan:plan-1:2.0.0-alpha.0:2.0.0-alpha.1:1");
    }
}
