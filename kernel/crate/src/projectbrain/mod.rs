//! Pure, deterministic Project Brain Kernel (v0.3 Phase 1).
//!
//! This module normalizes and validates the Phase 0 Project Brain contracts,
//! derives network-free identifiers, produces byte-stable canonical
//! representations and SHA-256 fingerprints, derives the four freshness
//! dimensions from injected timestamps, and computes a deterministic ChangeSet
//! between two immutable snapshots.
//!
//! It performs **no I/O of any kind**: no filesystem, network, environment,
//! system clock, or randomness. Every timestamp and salt is caller-injected.
//! The same valid input produces deep-equal output and identical fingerprints
//! on Windows, macOS, Linux, native Rust, and WASM-compatible builds.

pub mod canonical;
pub mod diff;
pub mod error;
pub mod fingerprint;
pub mod freshness;
pub mod identifiers;
pub mod limits;
pub mod normalize;
pub mod time;

// Public, pure re-exports for future binding work. No binding surface is added
// in Phase 1; these functions are Rust-only.
pub use diff::{diff_project_snapshots, SnapshotDiffInput};
pub use error::{PbResult, ProjectBrainError};
pub use fingerprint::{
    compute_snapshot_fingerprint, compute_state_fingerprint, derive_evidence_id,
    finalize_project_snapshot, finalize_project_state, fingerprint_minimized_content,
    normalize_project_snapshot, normalize_project_state,
};
pub use freshness::{derive_freshness, FreshnessInput, FreshnessPolicy, StalenessPolicy};
pub use identifiers::{resolve_project_identity, ProjectIdentitySeed};
