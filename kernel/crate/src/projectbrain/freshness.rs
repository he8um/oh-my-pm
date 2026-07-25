//! Pure freshness derivation from injected timestamps.
//!
//! The four freshness dimensions are derived from caller-provided timestamps
//! and a caller-provided reference instant. No clock is read. A dimension is
//! `unknown` when no contributing timestamp is available — never guessed.

use super::error::ProjectBrainError;
use super::normalize::normalize_display_text;
use super::time::{age_seconds, parse_rfc3339};

use crate::contracts::projectbrain::{Freshness, FreshnessDimension, FreshnessStatus};

const SCHEMA_VERSION: i64 = 1;

/// Internal, non-contract input to freshness derivation.
#[derive(Debug, Clone, Default)]
pub struct FreshnessInput {
    /// The observation timestamp (RFC3339). Drives observation freshness.
    pub observation_at: String,
    /// Source-reported update timestamps (RFC3339), each optionally unknown.
    pub source_updated_ats: Vec<Option<String>>,
    /// Evidence content-change timestamps (RFC3339), each optionally unknown.
    pub evidence_changed_ats: Vec<Option<String>>,
    /// The reference instant (RFC3339) all ages are measured against.
    pub reference_at: String,
    /// Explicit descriptors of unobserved sources/scopes.
    pub coverage_gaps: Vec<String>,
}

/// Policy for freshness derivation. Only the future-skew tolerance matters here.
#[derive(Debug, Clone, Copy)]
pub struct FreshnessPolicy {
    /// Maximum future skew (seconds) tolerated before a timestamp is rejected.
    pub max_future_skew_seconds: i64,
}

/// Policy for evidence-freshness transition classification in the diff.
#[derive(Debug, Clone, Copy)]
pub struct StalenessPolicy {
    /// Age (seconds) beyond which an item's evidence is considered stale.
    pub evidence_stale_after_seconds: i64,
    /// Maximum future skew tolerated when computing item evidence ages.
    pub max_future_skew_seconds: i64,
}

impl StalenessPolicy {
    /// Validate the policy: neither threshold may be negative.
    pub fn validate(&self) -> Result<(), ProjectBrainError> {
        if self.evidence_stale_after_seconds < 0 || self.max_future_skew_seconds < 0 {
            return Err(ProjectBrainError::new(
                super::error::OMP_K_PB_INVALID_FIELD,
                "staleness policy thresholds must not be negative",
            ));
        }
        Ok(())
    }
}

fn known(age: i64, reference_timestamp: &str) -> FreshnessDimension {
    FreshnessDimension {
        status: FreshnessStatus::Known,
        age_seconds: Some(age),
        reference_timestamp: Some(reference_timestamp.to_string()),
    }
}

fn unknown() -> FreshnessDimension {
    FreshnessDimension {
        status: FreshnessStatus::Unknown,
        age_seconds: None,
        reference_timestamp: None,
    }
}

/// The maximum known age across a set of optional timestamps, or `None` when
/// none are known. Maximum age = oldest contributing timestamp.
fn max_known_age(
    timestamps: &[Option<String>],
    reference: super::time::Instant,
    policy: &FreshnessPolicy,
    field_path: &str,
) -> Result<Option<i64>, ProjectBrainError> {
    let mut max_age: Option<i64> = None;
    for ts in timestamps.iter().flatten() {
        let instant = parse_rfc3339(ts, field_path)?;
        let age = age_seconds(
            reference,
            instant,
            policy.max_future_skew_seconds,
            field_path,
        )?;
        max_age = Some(max_age.map_or(age, |m: i64| m.max(age)));
    }
    Ok(max_age)
}

/// Derive the four freshness dimensions plus coverage from injected timestamps.
pub fn derive_freshness(
    input: FreshnessInput,
    policy: FreshnessPolicy,
) -> Result<Freshness, ProjectBrainError> {
    if policy.max_future_skew_seconds < 0 {
        return Err(ProjectBrainError::new(
            super::error::OMP_K_PB_INVALID_FIELD,
            "future skew must not be negative",
        ));
    }
    let reference = parse_rfc3339(&input.reference_at, "/freshness/referenceAt")?;

    // observationFreshness: age of the observation.
    let observation_at = parse_rfc3339(&input.observation_at, "/freshness/observationAt")?;
    let observation_age = age_seconds(
        reference,
        observation_at,
        policy.max_future_skew_seconds,
        "/freshness/observationAt",
    )?;
    let observation_freshness = known(observation_age, &input.reference_at);

    // sourceFreshness: max age across known source timestamps, else unknown.
    let source_age = max_known_age(
        &input.source_updated_ats,
        reference,
        &policy,
        "/freshness/sourceUpdatedAt",
    )?;
    let source_freshness = match source_age {
        Some(age) => known(age, &input.reference_at),
        None => unknown(),
    };

    // evidenceFreshness: max age across known evidence timestamps, else unknown.
    let evidence_age = max_known_age(
        &input.evidence_changed_ats,
        reference,
        &policy,
        "/freshness/evidenceChangedAt",
    )?;
    let evidence_freshness = match evidence_age {
        Some(age) => known(age, &input.reference_at),
        None => unknown(),
    };

    // derivedStateFreshness: known only when observation and evidence are known.
    let derived_state_freshness = match evidence_age {
        Some(evidence) => known(observation_age.max(evidence), &input.reference_at),
        None => unknown(),
    };

    // coverageGaps: normalized, sorted, deduplicated. coverageComplete = empty.
    let mut gaps: Vec<String> = Vec::with_capacity(input.coverage_gaps.len());
    if input.coverage_gaps.len() > super::limits::MAX_COVERAGE_GAPS {
        return Err(ProjectBrainError::new(
            super::error::OMP_K_PB_LIMIT_EXCEEDED,
            "coverage gaps exceed the maximum permitted count",
        ));
    }
    for gap in &input.coverage_gaps {
        let normalized = normalize_display_text(gap);
        if !normalized.is_empty() {
            gaps.push(normalized);
        }
    }
    gaps.sort();
    gaps.dedup();
    let coverage_complete = gaps.is_empty();

    Ok(Freshness {
        observation_freshness,
        source_freshness,
        evidence_freshness,
        derived_state_freshness,
        coverage_complete,
        coverage_gaps: gaps,
        schema_version: SCHEMA_VERSION,
    })
}
