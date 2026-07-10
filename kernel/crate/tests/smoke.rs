#[test]
fn kernel_crate_test_harness_is_available() {
    assert_eq!(oh_my_pm_kernel::kernel_scaffold_version(), "2.0.0-alpha.0");
}
