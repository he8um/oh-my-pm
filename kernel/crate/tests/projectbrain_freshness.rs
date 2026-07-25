//! Freshness derivation tests.

mod common;

use common::read_fixture;
use oh_my_pm_kernel::contracts::projectbrain::{Freshness, FreshnessStatus};
use oh_my_pm_kernel::projectbrain::freshness::{derive_freshness, FreshnessInput, FreshnessPolicy};

#[derive(serde::Deserialize)]
struct FixtureInput {
    #[serde(rename = "observationAt")]
    observation_at: String,
    #[serde(rename = "sourceUpdatedAts")]
    source_updated_ats: Vec<Option<String>>,
    #[serde(rename = "evidenceChangedAts")]
    evidence_changed_ats: Vec<Option<String>>,
    #[serde(rename = "referenceAt")]
    reference_at: String,
    #[serde(rename = "coverageGaps")]
    coverage_gaps: Vec<String>,
}

#[derive(serde::Deserialize)]
struct FixturePolicy {
    #[serde(rename = "maxFutureSkewSeconds")]
    max_future_skew_seconds: i64,
}

#[derive(serde::Deserialize)]
struct FreshnessFixture {
    input: FixtureInput,
    policy: FixturePolicy,
    expected: Freshness,
}

fn run_fixture(name: &str) {
    let fixture: FreshnessFixture = serde_json::from_str(&read_fixture(name)).unwrap();
    let input = FreshnessInput {
        observation_at: fixture.input.observation_at,
        source_updated_ats: fixture.input.source_updated_ats,
        evidence_changed_ats: fixture.input.evidence_changed_ats,
        reference_at: fixture.input.reference_at,
        coverage_gaps: fixture.input.coverage_gaps,
    };
    let policy = FreshnessPolicy {
        max_future_skew_seconds: fixture.policy.max_future_skew_seconds,
    };
    let out = derive_freshness(input, policy).unwrap();
    assert_eq!(out, fixture.expected, "fixture {name} mismatch");
}

#[test]
fn golden_freshness_all_known() {
    run_fixture("freshness-known.json");
}

#[test]
fn golden_freshness_unknown_dimensions_and_persian_gaps() {
    // Also proves coverage gaps are normalized, sorted, deduplicated (incl. Persian).
    run_fixture("freshness-unknown.json");
}

fn input(
    observation: &str,
    sources: Vec<Option<&str>>,
    evidence: Vec<Option<&str>>,
    reference: &str,
) -> FreshnessInput {
    FreshnessInput {
        observation_at: observation.to_string(),
        source_updated_ats: sources.into_iter().map(|o| o.map(str::to_string)).collect(),
        evidence_changed_ats: evidence
            .into_iter()
            .map(|o| o.map(str::to_string))
            .collect(),
        reference_at: reference.to_string(),
        coverage_gaps: vec![],
    }
}

fn policy(skew: i64) -> FreshnessPolicy {
    FreshnessPolicy {
        max_future_skew_seconds: skew,
    }
}

#[test]
fn source_unknown_when_no_timestamps_known() {
    let out = derive_freshness(
        input(
            "2026-03-01T00:00:00Z",
            vec![None, None],
            vec![Some("2026-02-28T00:00:00Z")],
            "2026-03-01T00:00:00Z",
        ),
        policy(0),
    )
    .unwrap();
    assert_eq!(out.source_freshness.status, FreshnessStatus::Unknown);
    assert_eq!(out.evidence_freshness.status, FreshnessStatus::Known);
}

#[test]
fn evidence_and_derived_unknown_when_no_evidence_timestamps() {
    let out = derive_freshness(
        input(
            "2026-03-01T00:00:00Z",
            vec![Some("2026-02-28T00:00:00Z")],
            vec![None],
            "2026-03-01T00:00:00Z",
        ),
        policy(0),
    )
    .unwrap();
    assert_eq!(out.evidence_freshness.status, FreshnessStatus::Unknown);
    assert_eq!(out.derived_state_freshness.status, FreshnessStatus::Unknown);
}

#[test]
fn max_age_is_taken_across_known_timestamps() {
    let out = derive_freshness(
        input(
            "2026-03-01T00:00:00Z",
            vec![Some("2026-02-28T00:00:00Z"), Some("2026-01-01T00:00:00Z")],
            vec![Some("2026-02-01T00:00:00Z")],
            "2026-03-01T00:00:00Z",
        ),
        policy(0),
    )
    .unwrap();
    // The oldest source timestamp (2026-01-01) determines the age.
    assert_eq!(
        out.source_freshness.age_seconds,
        Some((28 + 31) * 86400) // Jan(31) + Feb(28) days back from Mar 1.
    );
}

#[test]
fn future_timestamp_within_skew_clamps_to_zero() {
    let out = derive_freshness(
        input(
            "2026-03-01T00:01:00Z", // 60s in the future
            vec![],
            vec![],
            "2026-03-01T00:00:00Z",
        ),
        policy(300),
    )
    .unwrap();
    assert_eq!(out.observation_freshness.age_seconds, Some(0));
}

#[test]
fn future_timestamp_beyond_skew_is_rejected() {
    let err = derive_freshness(
        input(
            "2026-03-01T01:00:00Z", // 1h in the future
            vec![],
            vec![],
            "2026-03-01T00:00:00Z",
        ),
        policy(300),
    )
    .unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1010");
}

#[test]
fn invalid_timestamp_is_rejected() {
    let err = derive_freshness(
        input("not-a-date", vec![], vec![], "2026-03-01T00:00:00Z"),
        policy(0),
    )
    .unwrap_err();
    assert_eq!(err.code, "OMP-K-PB-1005");
}
