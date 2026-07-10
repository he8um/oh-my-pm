//! Release state machine decisions driven by the generated transition table.

use crate::contracts::kernel::{
    allowed_transitions, ReleaseState, StateTransitionDecision, StateTransitionInput,
};

/// Wire name of a release state, matching the generated transition table keys.
fn release_state_key(state: &ReleaseState) -> &'static str {
    match state {
        ReleaseState::Idea => "idea",
        ReleaseState::Source => "source",
        ReleaseState::Validation => "validation",
        ReleaseState::Ready => "ready",
        ReleaseState::Released => "released",
        ReleaseState::Published => "published",
        ReleaseState::Frozen => "frozen",
    }
}

/// States reachable from `from` in one allowed transition.
pub fn allowed_next_states(from: &ReleaseState) -> Vec<ReleaseState> {
    allowed_transitions()
        .remove(release_state_key(from))
        .unwrap_or_default()
}

/// Whether `from -> to` is an allowed transition.
pub fn can_transition(from: &ReleaseState, to: &ReleaseState) -> bool {
    allowed_next_states(from).contains(to)
}

/// Decide a requested transition.
pub fn decide_transition(input: StateTransitionInput) -> StateTransitionDecision {
    let allowed = can_transition(&input.from, &input.to);
    StateTransitionDecision {
        from: input.from,
        to: input.to,
        allowed,
        reason: if allowed { "allowed" } else { "transition_not_allowed" }.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALLOWED_EDGES: [(ReleaseState, ReleaseState); 7] = [
        (ReleaseState::Idea, ReleaseState::Source),
        (ReleaseState::Source, ReleaseState::Validation),
        (ReleaseState::Validation, ReleaseState::Ready),
        (ReleaseState::Validation, ReleaseState::Source),
        (ReleaseState::Ready, ReleaseState::Released),
        (ReleaseState::Released, ReleaseState::Published),
        (ReleaseState::Published, ReleaseState::Frozen),
    ];

    #[test]
    fn every_allowed_edge_is_accepted() {
        for (from, to) in ALLOWED_EDGES {
            assert!(can_transition(&from, &to), "{from:?} -> {to:?} should be allowed");
        }
    }

    #[test]
    fn blocked_edges_are_rejected() {
        for (from, to) in [
            (ReleaseState::Idea, ReleaseState::Released),
            (ReleaseState::Source, ReleaseState::Ready),
            (ReleaseState::Frozen, ReleaseState::Source),
        ] {
            assert!(!can_transition(&from, &to), "{from:?} -> {to:?} should be blocked");
        }
    }

    #[test]
    fn decisions_carry_reasons() {
        let allowed = decide_transition(StateTransitionInput {
            from: ReleaseState::Idea,
            to: ReleaseState::Source,
        });
        assert!(allowed.allowed);
        assert_eq!(allowed.reason, "allowed");

        let blocked = decide_transition(StateTransitionInput {
            from: ReleaseState::Frozen,
            to: ReleaseState::Source,
        });
        assert!(!blocked.allowed);
        assert_eq!(blocked.reason, "transition_not_allowed");
    }
}
