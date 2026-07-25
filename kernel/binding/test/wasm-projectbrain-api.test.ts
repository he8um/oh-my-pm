// Proves the Project Brain Kernel binding reaches the real Rust Phase 1 Kernel
// through the generated WASM binding, that the four existing exports and their
// KernelApi methods are untouched, and that the boundary fails closed on invalid
// input and when unavailable. Requires the binding build to have run first.

import type { EvidenceRecord, ProjectState } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  createNodeWasmKernelApi,
  createNodeWasmProjectBrainKernelApi,
  createUnavailableProjectBrainKernelApi,
} from "../src/index.js";

function baseState(): ProjectState {
  return {
    identity: { id: "proj-1", kind: "explicit", schemaVersion: 1 },
    observedAt: "2026-01-01T00:00:00Z",
    sources: [],
    statusSummary: {},
    evidenceRefs: [],
    schemaVersion: 1,
    stateFingerprint: "",
    freshness: {
      observationFreshness: {
        status: "known",
        ageSeconds: 0,
        referenceTimestamp: "2026-01-01T00:00:00Z",
      },
      sourceFreshness: { status: "unknown" },
      evidenceFreshness: { status: "unknown" },
      derivedStateFreshness: { status: "unknown" },
      coverageComplete: true,
      coverageGaps: [],
      schemaVersion: 1,
    },
  };
}

function baseEvidence(): EvidenceRecord {
  return {
    evidenceId: "placeholder",
    projectId: "proj-1",
    sourceKind: "markdown",
    sourceIdentity: "docs/status.md#L1",
    observedAt: "2026-01-01T00:00:00Z",
    provenance: { line: "1" },
    rawContentPolicy: "minimized",
    retentionState: "active",
    schemaVersion: 1,
    contentFingerprint: `sha256:${"a".repeat(64)}`,
  };
}

describe("project brain kernel binding (wasm)", () => {
  it("exposes exactly the seven approved operations", () => {
    const api = createNodeWasmProjectBrainKernelApi();
    expect(Object.keys(api).sort()).toEqual(
      [
        "deriveEvidenceId",
        "deriveFreshness",
        "deriveProjectIdentity",
        "diffProjectSnapshots",
        "finalizeProjectSnapshot",
        "finalizeProjectState",
        "fingerprintMinimizedContent",
      ].sort(),
    );
  });

  it("keeps the four existing KernelApi methods intact", () => {
    const api = createNodeWasmKernelApi();
    expect(api.version()).toBe("0.2.0");
    expect(api.decideTransition({ from: "idea", to: "source" }).allowed).toBe(true);
    expect(typeof api.validateJson).toBe("function");
    expect(typeof api.checkUpdatePlan).toBe("function");
    // The Project Brain methods are NOT added to KernelApi.
    expect("deriveProjectIdentity" in api).toBe(false);
  });

  it("resolves an explicit project identity", () => {
    const result = createNodeWasmProjectBrainKernelApi().deriveProjectIdentity({
      explicitId: "proj-1",
      displayName: "Demo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("proj-1");
      expect(result.value.kind).toBe("explicit");
    }
  });

  it("derives a deterministic derived identity from a salted root token", () => {
    const api = createNodeWasmProjectBrainKernelApi();
    const a = api.deriveProjectIdentity({ normalizedRootToken: "root", localSalt: "salt" });
    const b = api.deriveProjectIdentity({ normalizedRootToken: "root", localSalt: "salt" });
    expect(a).toEqual(b);
    if (a.ok) {
      expect(a.value.kind).toBe("derived");
      // The derived id never leaks the raw root token.
      expect(a.value.id).not.toContain("root");
    }
  });

  it("fingerprints minimized content deterministically", () => {
    const api = createNodeWasmProjectBrainKernelApi();
    const r = api.fingerprintMinimizedContent({ content: "hello world" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("derives an evidence id from a minimized record", () => {
    const r = createNodeWasmProjectBrainKernelApi().deriveEvidenceId(baseEvidence());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBeGreaterThan(0);
  });

  it("derives freshness from injected timestamps", () => {
    const r = createNodeWasmProjectBrainKernelApi().deriveFreshness({
      observationAt: "2026-01-01T00:00:00Z",
      referenceAt: "2026-01-02T00:00:00Z",
      maxFutureSkewSeconds: 60,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.observationFreshness.status).toBe("known");
      expect(r.value.observationFreshness.ageSeconds).toBe(86_400);
    }
  });

  it("finalizes a project state and stamps a fingerprint", () => {
    const r = createNodeWasmProjectBrainKernelApi().finalizeProjectState(baseState());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stateFingerprint).toMatch(/^sha256:/);
  });

  it("returns a typed failure envelope for invalid JSON input", () => {
    // A ProjectState missing required fields fails Kernel validation, not a throw.
    const r = createNodeWasmProjectBrainKernelApi().finalizeProjectState(
      { identity: { id: "x" } } as unknown as ProjectState,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toMatch(/^OMP-K-PB-/);
      expect(typeof r.error.message).toBe("string");
    }
  });

  it("the unavailable binding fails closed for every operation", () => {
    const api = createUnavailableProjectBrainKernelApi("test_reason");
    const results = [
      api.deriveProjectIdentity({ explicitId: "x" }),
      api.fingerprintMinimizedContent({ content: "x" }),
      api.deriveEvidenceId(baseEvidence()),
      api.deriveFreshness({
        observationAt: "2026-01-01T00:00:00Z",
        referenceAt: "2026-01-01T00:00:00Z",
        maxFutureSkewSeconds: 0,
      }),
      api.finalizeProjectState(baseState()),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toContain("test_reason");
    }
  });
});
