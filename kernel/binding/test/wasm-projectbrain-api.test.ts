// Proves the Project Brain Kernel binding reaches the real Rust Phase 1 Kernel
// through the generated WASM binding, that the four existing exports and their
// KernelApi methods are untouched, and that the boundary fails closed on invalid
// input and when unavailable. Requires the binding build to have run first.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceRecord, ProjectState, TimelineResult } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  createNodeWasmKernelApi,
  createNodeWasmProjectBrainKernelApi,
  createUnavailableProjectBrainKernelApi,
} from "../src/index.js";

// The canonical version is read from the single source of truth so a version
// promotion needs no test edit.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CANONICAL_VERSION: string = JSON.parse(
  readFileSync(join(repoRoot, "version.json"), "utf8"),
).version;

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
  it("exposes exactly the eight approved operations", () => {
    const api = createNodeWasmProjectBrainKernelApi();
    expect(Object.keys(api).sort()).toEqual(
      [
        "deriveEvidenceId",
        "deriveFreshness",
        "deriveProjectIdentity",
        // v0.4: the pure Project Timeline derivation.
        "deriveProjectTimeline",
        "diffProjectSnapshots",
        "finalizeProjectSnapshot",
        "finalizeProjectState",
        "fingerprintMinimizedContent",
      ].sort(),
    );
  });

  it("keeps the four existing KernelApi methods intact", () => {
    const api = createNodeWasmKernelApi();
    expect(api.version()).toBe(CANONICAL_VERSION);
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

  // --- v0.4 Project Timeline derivation through the WASM boundary ----------

  it("derives an empty valid timeline when there is no adjacent pair", () => {
    const r = createNodeWasmProjectBrainKernelApi().deriveProjectTimeline({
      captures: [],
      query: { projectId: "proj-1" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        projectId: "proj-1",
        eventCount: 0,
        hasMore: false,
        events: [],
      });
    }
  });

  it("reproduces the committed golden timeline fixture exactly", () => {
    // The SAME fixture is asserted natively in
    // kernel/crate/tests/projectbrain_timeline.rs, so any divergence between
    // the Rust and WASM paths fails one of the two tests.
    const fixture = JSON.parse(
      readFileSync(
        join(repoRoot, "examples", "fixtures", "project-brain", "timeline-expected.json"),
        "utf8",
      ),
    ) as {
      input: Parameters<
        ReturnType<typeof createNodeWasmProjectBrainKernelApi>["deriveProjectTimeline"]
      >[0];
      expected: TimelineResult;
    };
    const r = createNodeWasmProjectBrainKernelApi().deriveProjectTimeline(fixture.input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(fixture.expected);
      // Byte-stable across repeated derivations.
      const again = createNodeWasmProjectBrainKernelApi().deriveProjectTimeline(fixture.input);
      expect(again.ok && JSON.stringify(again.value)).toBe(JSON.stringify(r.value));
    }
  });

  it("rejects an out-of-range timeline limit with a typed failure", () => {
    const r = createNodeWasmProjectBrainKernelApi().deriveProjectTimeline({
      captures: [],
      query: { projectId: "proj-1", limit: 101 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("OMP-K-PB-1002");
      expect(r.error.path).toBe("/timelineQuery/limit");
    }
  });

  it("returns a typed failure envelope for invalid JSON input", () => {
    // A ProjectState missing required fields fails Kernel validation, not a throw.
    const r = createNodeWasmProjectBrainKernelApi().finalizeProjectState({
      identity: { id: "x" },
    } as unknown as ProjectState);
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
      api.deriveProjectTimeline({ captures: [], query: { projectId: "proj-1" } }),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toContain("test_reason");
    }
  });
});
