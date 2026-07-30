//! Bounded, deterministic validation limits for Phase 1.
//!
//! Every collection and value the Kernel accepts has an explicit upper bound.
//! Oversized inputs are rejected (never truncated), so a hostile or corrupt
//! contract cannot force unbounded work or unbounded output.

/// Maximum byte length of an opaque identifier.
pub const MAX_ID_BYTES: usize = 256;
/// Maximum byte length of a title / objective / display-name / gap-reason.
pub const MAX_TITLE_BYTES: usize = 1024;
/// Maximum byte length of a normalized classification label.
pub const MAX_LABEL_BYTES: usize = 256;
/// Maximum number of entries in a metadata / provenance / status-summary map.
pub const MAX_METADATA_ENTRIES: usize = 64;
/// Maximum byte length of a metadata / provenance map key.
pub const MAX_METADATA_KEY_BYTES: usize = 128;
/// Maximum byte length of a metadata / provenance map value.
pub const MAX_METADATA_VALUE_BYTES: usize = 1024;
/// Maximum number of evidence references on a single item.
pub const MAX_EVIDENCE_REFS_PER_ITEM: usize = 256;
/// Maximum number of evidence references on a state or snapshot.
pub const MAX_STATE_EVIDENCE_REFS: usize = 10_000;
/// Maximum number of items in a single state collection.
pub const MAX_ITEMS_PER_COLLECTION: usize = 10_000;
/// Maximum number of source descriptors on a state.
pub const MAX_SOURCES: usize = 1_000;
/// Maximum number of source boundaries on a snapshot.
pub const MAX_SOURCE_BOUNDARIES: usize = 1_000;
/// Maximum number of coverage gaps recorded in freshness.
pub const MAX_COVERAGE_GAPS: usize = 1_000;
/// Maximum number of changes emitted in a single ChangeSet.
pub const MAX_CHANGES: usize = 50_000;
/// Maximum byte length of any canonical serialization the Kernel will hash.
pub const MAX_CANONICAL_BYTES: usize = 32 * 1024 * 1024;
/// Maximum number of adjacent snapshot comparisons a single timeline derivation
/// will consume (v0.4). A store with more captures still works: the Runtime
/// reads a bounded window of the chronology rather than the whole history.
pub const MAX_TIMELINE_CAPTURES: usize = 1_000;
