//! OH MY PM Kernel: pure, deterministic control-plane checks.
//!
//! The Kernel performs no I/O of any kind: no filesystem, network,
//! environment, clock, or randomness. All data arrives as function input.

pub mod errors;
pub mod registry;
pub mod state;
pub mod update_guard;
pub mod validation;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

#[path = "../../../contracts/generated/rust/mod.rs"]
pub mod contracts;

pub use state::{allowed_next_states, can_transition, decide_transition};
pub use update_guard::check_update_plan;
pub use validation::validate_json;

/// Scaffold-only version marker.
pub fn kernel_scaffold_version() -> &'static str {
    "0.1.0"
}

/// Kernel crate version.
pub fn kernel_version() -> &'static str {
    "0.1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_scaffold_version() {
        assert_eq!(kernel_scaffold_version(), "0.1.0");
    }

    #[test]
    fn exposes_kernel_version() {
        assert_eq!(kernel_version(), "0.1.0");
    }
}
