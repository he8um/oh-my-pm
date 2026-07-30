#[test]
fn kernel_crate_test_harness_is_available() {
    // The expected version comes from the crate manifest, which
    // check-version-consistency pins to version.json, so a version promotion
    // needs no test edit.
    assert_eq!(
        oh_my_pm_kernel::kernel_scaffold_version(),
        env!("CARGO_PKG_VERSION")
    );
}

#[test]
fn generated_contract_types_are_available() {
    let warning = oh_my_pm_kernel::contracts::core::KernelWarning {
        code: "OMP-TEST".to_string(),
        message: "test".to_string(),
    };

    assert_eq!(warning.code, "OMP-TEST");
}

#[test]
fn allowed_transitions_include_validation_paths() {
    use oh_my_pm_kernel::contracts::kernel::{allowed_transitions, ReleaseState};

    let transitions = allowed_transitions();
    assert_eq!(
        transitions.get("validation"),
        Some(&vec![ReleaseState::Ready, ReleaseState::Source])
    );
}
