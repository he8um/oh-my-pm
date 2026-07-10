use oh_my_pm_kernel::check_update_plan;
use oh_my_pm_kernel::contracts::kernel::{
    RollbackPoint, UpdateGuardDecision, UpdatePlan, UpdatePlanStep, UpdatePlanStepKind,
};
use oh_my_pm_kernel::update_guard::plan_hash;

fn valid_plan() -> UpdatePlan {
    UpdatePlan {
        id: "plan-9".to_string(),
        from_version: "2.0.0-alpha.0".to_string(),
        to_version: "2.0.0-alpha.1".to_string(),
        steps: vec![
            UpdatePlanStep {
                kind: UpdatePlanStepKind::Replace,
                path: "bin/omp".to_string(),
                checksum: Some("abc".to_string()),
            },
            UpdatePlanStep {
                kind: UpdatePlanStepKind::Verify,
                path: "bin/omp".to_string(),
                checksum: Some("abc".to_string()),
            },
        ],
        rollback: RollbackPoint {
            id: "rb-9".to_string(),
            created_at: "caller-supplied".to_string(),
            paths: vec!["bin".to_string()],
        },
    }
}

#[test]
fn valid_plan_is_allowed_and_bound_to_hash() {
    match check_update_plan(&valid_plan()) {
        UpdateGuardDecision::Allowed {
            plan_id,
            plan_hash: hash,
            reasons,
        } => {
            assert_eq!(plan_id, "plan-9");
            assert_eq!(hash, "plan:plan-9:2.0.0-alpha.0:2.0.0-alpha.1:2");
            assert!(reasons.is_empty());
        }
        other => panic!("expected allowed, got {other:?}"),
    }
}

#[test]
fn broken_plan_reports_every_reason() {
    let mut plan = valid_plan();
    plan.from_version = plan.to_version.clone();
    plan.steps.clear();
    plan.rollback.id.clear();
    match check_update_plan(&plan) {
        UpdateGuardDecision::Blocked { reasons, .. } => {
            assert_eq!(
                reasons,
                vec![
                    "same_version".to_string(),
                    "missing_steps".to_string(),
                    "missing_rollback_id".to_string(),
                ]
            );
        }
        other => panic!("expected blocked, got {other:?}"),
    }
}

#[test]
fn hash_is_deterministic_across_calls() {
    let plan = valid_plan();
    assert_eq!(plan_hash(&plan), plan_hash(&plan));
}
