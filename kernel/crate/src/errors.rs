//! Deterministic constructors for Kernel errors, results, and findings.

use crate::contracts::core::{JsonValue, KernelError, KernelResult};
use crate::contracts::kernel::{ValidationFinding, ValidationReport, ValidationTarget};

pub const OMP_K_INVALID_STATE_TRANSITION: &str = "OMP-K-1001";
pub const OMP_K_INVALID_PAYLOAD: &str = "OMP-K-1002";
pub const OMP_K_DUPLICATE_COMPONENT: &str = "OMP-K-1003";
pub const OMP_K_MISSING_COMPONENT: &str = "OMP-K-1004";
pub const OMP_K_INVALID_UPDATE_PLAN: &str = "OMP-K-1005";
pub const OMP_K_INVALID_TASK_GRAPH: &str = "OMP-K-1006";

/// Build a blocking `KernelError` with a registered code.
pub fn kernel_error(code: &str, message: impl Into<String>, path: Option<String>) -> KernelError {
    KernelError {
        code: code.to_string(),
        message: message.into(),
        path,
        blocking: true,
        details: None,
    }
}

/// Build a successful `KernelResult` with no warnings.
pub fn result_ok(data: JsonValue) -> KernelResult {
    KernelResult::Ok {
        data,
        warnings: Vec::new(),
    }
}

/// Build a failed `KernelResult` with no warnings.
pub fn result_error(error: KernelError) -> KernelResult {
    KernelResult::Error {
        error,
        warnings: Vec::new(),
    }
}

/// Build a blocking `ValidationFinding`.
pub fn blocking_finding(
    code: &str,
    message: impl Into<String>,
    path: impl Into<String>,
) -> ValidationFinding {
    ValidationFinding {
        code: code.to_string(),
        message: message.into(),
        path: path.into(),
        blocking: true,
    }
}

/// Build a `ValidationReport`; it passes only when there are no errors.
pub fn validation_report(
    target: ValidationTarget,
    errors: Vec<ValidationFinding>,
    warnings: Vec<ValidationFinding>,
) -> ValidationReport {
    ValidationReport {
        target,
        passed: errors.is_empty(),
        errors,
        warnings,
    }
}
