//! OH MY PM Kernel scaffold.
//!
//! Real Kernel logic is implemented after shared contracts are complete.

#[path = "../../../contracts/generated/rust/mod.rs"]
pub mod contracts;

/// Scaffold-only version marker.
pub fn kernel_scaffold_version() -> &'static str {
    "2.0.0-alpha.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_scaffold_version() {
        assert_eq!(kernel_scaffold_version(), "2.0.0-alpha.0");
    }
}
