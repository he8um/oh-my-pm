use oh_my_pm_kernel::contracts::kernel::{ReleaseState, StateTransitionInput};
use oh_my_pm_kernel::{allowed_next_states, can_transition, decide_transition};

#[test]
fn all_allowed_edges_are_accepted() {
    let edges = [
        (ReleaseState::Idea, ReleaseState::Source),
        (ReleaseState::Source, ReleaseState::Validation),
        (ReleaseState::Validation, ReleaseState::Ready),
        (ReleaseState::Validation, ReleaseState::Source),
        (ReleaseState::Ready, ReleaseState::Released),
        (ReleaseState::Released, ReleaseState::Published),
        (ReleaseState::Published, ReleaseState::Frozen),
    ];
    for (from, to) in edges {
        assert!(can_transition(&from, &to), "{from:?} -> {to:?} should be allowed");
    }
}

#[test]
fn blocked_edges_are_rejected_with_reason() {
    let edges = [
        (ReleaseState::Idea, ReleaseState::Released),
        (ReleaseState::Source, ReleaseState::Ready),
        (ReleaseState::Frozen, ReleaseState::Source),
    ];
    for (from, to) in edges {
        let decision = decide_transition(StateTransitionInput { from, to });
        assert!(!decision.allowed);
        assert_eq!(decision.reason, "transition_not_allowed");
    }
}

#[test]
fn frozen_is_terminal() {
    assert!(allowed_next_states(&ReleaseState::Frozen).is_empty());
}

#[test]
fn validation_has_two_next_states() {
    assert_eq!(
        allowed_next_states(&ReleaseState::Validation),
        vec![ReleaseState::Ready, ReleaseState::Source]
    );
}
