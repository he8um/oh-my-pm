//! Static purity check: the Kernel library sources must not reach for
//! filesystem, network, environment, process, time, or randomness APIs.
//! Reading source files here is allowed only for this static test; the
//! Kernel library itself stays pure.

use std::fs;
use std::path::Path;

const FORBIDDEN: [&str; 7] = [
    "std::fs",
    "std::env",
    "std::process",
    "std::net",
    "SystemTime",
    "Instant::now",
    "rand::",
];

#[test]
fn kernel_sources_contain_no_impure_apis() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut checked = 0;
    for entry in fs::read_dir(&src_dir).expect("src dir readable") {
        let path = entry.expect("dir entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let contents = fs::read_to_string(&path).expect("source readable");
        for forbidden in FORBIDDEN {
            assert!(
                !contents.contains(forbidden),
                "{} contains forbidden API marker {forbidden}",
                path.display()
            );
        }
        checked += 1;
    }
    assert!(checked >= 6, "expected to scan the kernel source files");
}
