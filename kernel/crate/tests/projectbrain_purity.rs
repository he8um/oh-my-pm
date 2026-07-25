//! Purity guard: statically prove the Project Brain module reads no clock,
//! filesystem, network, environment, or randomness, and behaviorally prove
//! repeated runs are deep-equal.

mod common;

use std::fs;
use std::path::PathBuf;

use common::{item, load_fixture, state_with_tasks};
use oh_my_pm_kernel::contracts::projectbrain::{EvidenceRecord, ProjectSnapshot, StateItemKind};
use oh_my_pm_kernel::projectbrain::diff::{diff_project_snapshots, SnapshotDiffInput};
use oh_my_pm_kernel::projectbrain::fingerprint::finalize_project_state;
use oh_my_pm_kernel::projectbrain::freshness::StalenessPolicy;

fn module_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/projectbrain")
}

fn module_sources() -> Vec<(String, String)> {
    let mut out = Vec::new();
    for entry in fs::read_dir(module_dir()).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            out.push((name, fs::read_to_string(&path).unwrap()));
        }
    }
    out.sort();
    assert!(!out.is_empty(), "expected projectbrain source files");
    out
}

/// Return only the executable code lines of a source file: doc comments (`///`,
/// `//!`) and ordinary comments (`//`) are dropped, so a comment that documents
/// what the code does NOT do (e.g. "never calls now_utc") is not counted as an
/// impurity. Block comments are not used in this module.
fn code_lines(source: &str) -> String {
    source
        .lines()
        .filter(|line| {
            let t = line.trim_start();
            !(t.starts_with("//") || t.starts_with('*') || t.starts_with("/*"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The module's executable code must contain no impurity markers: no
/// filesystem, network, environment, clock, randomness, or WASM host import.
#[test]
fn module_code_contains_no_impurity_markers() {
    let forbidden = [
        "std::fs",
        "std::net",
        "std::env",
        "env::var",
        "env!(",
        "SystemTime",
        "now_utc",
        "UtcDateTime::now",
        "Instant::now",
        "Date::now",
        "thread::sleep",
        "std::process",
        "Command::new",
        "rand::",
        "thread_rng",
        "getrandom",
        "Math::random",
        "reqwest",
        "tokio",
        "wasm_bindgen",
        "js_sys",
        "web_sys",
        "extern \"C\"",
    ];
    for (name, source) in module_sources() {
        let code = code_lines(&source);
        for marker in forbidden {
            assert!(
                !code.contains(marker),
                "{name} contains forbidden impurity marker {marker:?} in executable code"
            );
        }
    }
}

/// Behavioral purity: the full pipeline is deep-equal across repeated runs.
#[test]
fn repeated_pipeline_runs_are_deep_equal() {
    let state = state_with_tasks("p1", vec![item(StateItemKind::Task, "t", "Title")]);
    let a = finalize_project_state(state.clone()).unwrap();
    let b = finalize_project_state(state).unwrap();
    assert_eq!(a, b);

    let input = || SnapshotDiffInput {
        previous: load_fixture::<ProjectSnapshot>("snapshot-previous.json"),
        current: load_fixture::<ProjectSnapshot>("snapshot-current.json"),
        previous_evidence: load_fixture::<Vec<EvidenceRecord>>("evidence-previous.json"),
        current_evidence: load_fixture::<Vec<EvidenceRecord>>("evidence-current.json"),
        compared_at: "2026-03-25T12:00:00Z".to_string(),
        staleness_policy: StalenessPolicy {
            evidence_stale_after_seconds: 432000,
            max_future_skew_seconds: 300,
        },
    };
    assert_eq!(
        diff_project_snapshots(input()).unwrap(),
        diff_project_snapshots(input()).unwrap()
    );
}
