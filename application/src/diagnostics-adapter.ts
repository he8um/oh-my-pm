// Bridge from the provider diagnostic reports to the unified Diagnostic model.
//
// Why this is an ADAPTER and not a rewrite
// ----------------------------------------
// `ProviderStatusReport` and `ProviderDoctorReport` are PUBLIC output shapes.
// `buildProviderStatusReport(...)` is returned directly as the result of the
// `provider_status` and `github_provider_diagnostics` MCP tools, and printed by
// the CLI under `--json`. Their `schemaVersion: 1` and their
// `ok | info | warning | fail` status vocabulary are therefore a client-facing
// contract.
//
// Consolidating them by rewriting those types onto `Diagnostic` would change an
// MCP tool's output schema, which v0.5.4 must not do. So the reports keep their
// exact shapes and this module projects them into the unified model for any
// consumer that wants one vocabulary across every use case.
//
// That gives the consolidation where it is safe -- one Diagnostic type to reason
// about, one severity scale, stable codes -- without a compatibility break. The
// per-use-case report types are documented in docs/v0.5/contracts.md as
// deliberately retained public shapes rather than leftovers.
//
// Pure: no filesystem, environment, clock, network, or randomness.

import type { Diagnostic, DiagnosticSeverity } from "./result.js";
import type {
  ProviderDiagnosticCheck,
  ProviderDiagnosticStatus,
  ProviderDoctorReport,
} from "./provider-diagnostics.js";

/**
 * Map the report status vocabulary onto the unified severity scale.
 *
 * The report distinguishes `ok` from `info`; the unified model does not, because
 * a passing check and a neutral note are both informational to a consumer that
 * is looking for problems. Nothing is lost: the original status stays in the
 * report, which is still the authoritative public output.
 */
const SEVERITY_OF_STATUS: Readonly<Record<ProviderDiagnosticStatus, DiagnosticSeverity>> =
  Object.freeze({
    ok: "info",
    info: "info",
    warning: "warning",
    fail: "error",
  });

/** The unified severity for a provider diagnostic status. */
export const severityOfProviderStatus = (status: ProviderDiagnosticStatus): DiagnosticSeverity =>
  SEVERITY_OF_STATUS[status];

/**
 * Project one provider check into a unified diagnostic.
 *
 * The check's `id` becomes the diagnostic `code`: it is already the stable,
 * machine-readable identifier a consumer branches on, so inventing a parallel
 * code space would create exactly the drift this release removes.
 */
export function diagnosticFromProviderCheck(check: ProviderDiagnosticCheck): Diagnostic {
  return {
    code: check.id,
    severity: severityOfProviderStatus(check.status),
    message: check.message,
    // A failing provider check is frequently transient (network, rate limit),
    // while a warning or note describes a settled configuration state.
    retryable: check.status === "fail",
  };
}

/**
 * Project a doctor report's checks into unified diagnostics, in report order.
 *
 * Order is preserved because the report's own order is meaningful -- checks run
 * from configuration through to access -- and reordering would change how a
 * reader interprets the sequence.
 */
export function diagnosticsFromDoctorReport(report: ProviderDoctorReport): readonly Diagnostic[] {
  return report.checks.map(diagnosticFromProviderCheck);
}

/** Whether any projected diagnostic is an error. */
export const hasError = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");
