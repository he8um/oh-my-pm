// Provider-independent observation orchestration (v0.3 Phase 3).
//
// Executes an ordered set of read-only observations sequentially, classifies
// each source's coverage, and collects the normalized items from successful
// sources. A required-source failure aborts capture (no memory write); an
// optional-source failure records skipped coverage and continues. Provider
// warnings mark a source partial. No raw provider error message or failed
// response payload is retained — only stable sanitized coverage codes.

import type {
  NormalizedProviderItem,
  ProviderRequest,
} from "@oh-my-pm/contracts";
import type { ProviderRegistry } from "@oh-my-pm/providers";
import { requiredObservationFailedError } from "./errors.js";
import type {
  CaptureCoverageEntry,
  ProjectObservationPort,
  ProjectObservationRequest,
  ProjectObservationResult,
} from "./types.js";

/** The collected outcome of running all observations for a capture. */
export interface ObservationRunResult {
  /** Normalized items from every successful source, in observation order. */
  readonly items: readonly NormalizedProviderItem[];
  /** Per-source coverage entries, in observation order. */
  readonly coverage: readonly CaptureCoverageEntry[];
  /** Sanitized coverage gap descriptors (partial/skipped), in order. */
  readonly coverageGaps: readonly string[];
  /** True when every source was observed complete with no gaps. */
  readonly coverageComplete: boolean;
}

/**
 * Execute observations sequentially through the observation port. Throws a
 * required-observation-failed error (aborting capture) when a required source
 * fails; optional failures are recorded as skipped coverage.
 */
export async function runObservations(
  observation: ProjectObservationPort,
  requests: readonly ProjectObservationRequest[],
  context: { readonly requestId: string },
): Promise<ObservationRunResult> {
  const items: NormalizedProviderItem[] = [];
  const coverage: CaptureCoverageEntry[] = [];
  const coverageGaps: string[] = [];
  let coverageComplete = true;

  for (const request of requests) {
    const result: ProjectObservationResult = await observation.observe(request, context);

    if (result.ok && result.response !== undefined) {
      if (result.hasWarnings) {
        coverageComplete = false;
        const gapReason = `partial:${request.sourceIdentity}`;
        coverage.push({
          sourceIdentity: request.sourceIdentity,
          coverageState: "partial",
          gapReason,
        });
        coverageGaps.push(gapReason);
      } else {
        coverage.push({ sourceIdentity: request.sourceIdentity, coverageState: "complete" });
      }
      for (const item of result.response.items) items.push(item);
      continue;
    }

    // Failure.
    if (request.required) {
      throw requiredObservationFailedError(request.sourceIdentity, result.failureCode);
    }
    coverageComplete = false;
    const code = result.failureCode ?? "observation_failed";
    const gapReason = `skipped:${request.sourceIdentity}:${code}`;
    coverage.push({
      sourceIdentity: request.sourceIdentity,
      coverageState: "skipped",
      gapReason,
    });
    coverageGaps.push(gapReason);
  }

  return { items, coverage, coverageGaps, coverageComplete };
}

/**
 * A default observation adapter over the existing read-only ProviderRegistry.
 * It maps a provider result into the sanitized observation result: on success it
 * carries the normalized response and a warnings flag; on failure it carries only
 * a stable failure code (never the raw provider message).
 */
export function createProviderRegistryObservationPort(
  registry: ProviderRegistry,
): ProjectObservationPort {
  return {
    async observe(request, context): Promise<ProjectObservationResult> {
      const providerRequest: ProviderRequest = request.request;
      const result = await registry.execute(providerRequest, { requestId: context.requestId });
      if (result.ok) {
        const warnings = result.response.warnings ?? [];
        return {
          observationId: request.observationId,
          ok: true,
          response: result.response,
          hasWarnings: warnings.length > 0,
        };
      }
      return {
        observationId: request.observationId,
        ok: false,
        hasWarnings: false,
        // Stable provider failure code only; the raw message is discarded here.
        failureCode: result.code,
      };
    },
  };
}
