import { describe, expect, it } from "vitest";

import {
  PROJECT_BRAIN_SCHEMA_VERSION,
  type ChangeSet,
  type EvidenceRecord,
  type Freshness,
  type ProjectIdentity,
  type ProjectSnapshot,
  type ProjectState,
} from "../src/index.js";

// The Project Brain schema version is a fixed constant in Phase 0.
const V = PROJECT_BRAIN_SCHEMA_VERSION;

// A complete minimal identity: derived kind, no absolute path, schema-versioned.
const identity: ProjectIdentity = {
  id: "pb_derived_0001",
  kind: "derived",
  schemaVersion: V,
  rootHint: "my-project",
};

// A minimized evidence record: fingerprint-only, no raw body, no credential.
const evidence: EvidenceRecord = {
  evidenceId: "ev_0001",
  projectId: identity.id,
  sourceKind: "markdown",
  sourceIdentity: "docs/plan.md#L10-L14",
  observedAt: "2026-07-25T00:00:00Z",
  provenance: { line: "10", range: "10-14" },
  rawContentPolicy: "minimized",
  retentionState: "active",
  schemaVersion: V,
  contentFingerprint: "sha256:abcdef",
  metadata: { severity: "warning" },
};

// A Freshness fixture preserving all four separate dimensions plus coverage.
const freshness: Freshness = {
  observationFreshness: {
    status: "known",
    ageSeconds: 0,
    referenceTimestamp: "2026-07-25T00:00:00Z",
  },
  sourceFreshness: { status: "unknown" },
  evidenceFreshness: {
    status: "known",
    ageSeconds: 3600,
    referenceTimestamp: "2026-07-25T00:00:00Z",
  },
  derivedStateFreshness: {
    status: "known",
    ageSeconds: 3600,
    referenceTimestamp: "2026-07-25T00:00:00Z",
  },
  coverageComplete: false,
  coverageGaps: ["github: request failed"],
  schemaVersion: V,
};

// A minimal state that references evidence for a non-trivial item.
const state: ProjectState = {
  identity,
  observedAt: "2026-07-25T00:00:00Z",
  sources: [{ sourceKind: "markdown", sourceIdentity: "docs/plan.md" }],
  statusSummary: { open: 1, done: 0 },
  evidenceRefs: [evidence.evidenceId],
  freshness,
  schemaVersion: V,
  stateFingerprint: "sha256:state",
  risks: [
    {
      kind: "risk",
      id: "risk_0001",
      title: "Timeline slip",
      evidenceRefs: [evidence.evidenceId],
      severity: "warning",
    },
  ],
};

// A snapshot embedding the state and evidence ids, with explicit boundaries.
const snapshot: ProjectSnapshot = {
  snapshotId: "snap_0001",
  projectId: identity.id,
  capturedAt: "2026-07-25T00:00:00Z",
  sourceBoundaries: [
    { sourceIdentity: "docs/plan.md", includedScope: "all", coverageState: "complete" },
  ],
  state,
  evidenceRefs: [evidence.evidenceId],
  schemaVersion: V,
  fingerprint: "sha256:snapshot",
};

// A change set using exact change categories only.
const changeSet: ChangeSet = {
  projectId: identity.id,
  previousSnapshotId: "snap_0000",
  currentSnapshotId: snapshot.snapshotId,
  comparedAt: "2026-07-25T00:00:00Z",
  changes: [
    {
      category: "added",
      itemKind: "risk",
      itemId: "risk_0001",
      evidenceRefs: [evidence.evidenceId],
      currentValue: state.risks![0]!,
    },
    {
      category: "severityIncreased",
      itemKind: "risk",
      itemId: "risk_0002",
      evidenceRefs: [],
    },
  ],
  schemaVersion: V,
};

// The set of fixtures scanned for privacy guarantees.
const fixtures = { identity, evidence, freshness, state, snapshot, changeSet };

describe("@oh-my-pm/contracts project brain", () => {
  it("exports all six primary contracts and the schema version constant", () => {
    // Compile-time typing above proves the types are exported; assert the constant.
    expect(PROJECT_BRAIN_SCHEMA_VERSION).toBe(1);
  });

  it("represents a complete minimal ProjectIdentity without an absolute path", () => {
    expect(identity.kind).toBe("derived");
    expect(identity.schemaVersion).toBe(1);
    expect(identity.rootHint).toBe("my-project");
  });

  it("represents a minimized EvidenceRecord (fingerprint, no raw body)", () => {
    expect(evidence.rawContentPolicy).toBe("minimized");
    expect(evidence.contentFingerprint).toBe("sha256:abcdef");
    expect(evidence.retentionState).toBe("active");
  });

  it("preserves all four separate Freshness dimensions", () => {
    expect(freshness.observationFreshness.status).toBe("known");
    expect(freshness.sourceFreshness.status).toBe("unknown");
    expect(freshness.evidenceFreshness.status).toBe("known");
    expect(freshness.derivedStateFreshness.status).toBe("known");
    expect(freshness.coverageComplete).toBe(false);
    expect(freshness.coverageGaps).toHaveLength(1);
  });

  it("lets a minimal ProjectState reference evidence for its items", () => {
    expect(state.evidenceRefs).toContain(evidence.evidenceId);
    expect(state.risks![0]!.evidenceRefs).toContain(evidence.evidenceId);
  });

  it("embeds the state and evidence ids in a ProjectSnapshot", () => {
    expect(snapshot.state.identity.id).toBe(identity.id);
    expect(snapshot.evidenceRefs).toEqual([evidence.evidenceId]);
    expect(snapshot.sourceBoundaries[0]!.coverageState).toBe("complete");
  });

  it("represents exact change categories in a ChangeSet", () => {
    expect(changeSet.changes.map((c) => c.category)).toEqual(["added", "severityIncreased"]);
    expect(changeSet.changes[0]!.itemKind).toBe("risk");
  });

  it("round-trips every fixture through JSON stringify/parse", () => {
    for (const fixture of Object.values(fixtures)) {
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
    }
  });

  it("keeps schemaVersion at 1 across the fixtures", () => {
    expect(identity.schemaVersion).toBe(1);
    expect(evidence.schemaVersion).toBe(1);
    expect(freshness.schemaVersion).toBe(1);
    expect(state.schemaVersion).toBe(1);
    expect(snapshot.schemaVersion).toBe(1);
    expect(changeSet.schemaVersion).toBe(1);
  });

  it("contains no absolute paths, credentials, raw bodies, or authorization data", () => {
    const serialized = JSON.stringify(fixtures);
    // No absolute paths.
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    // No credential or raw-body markers.
    for (const forbidden of [
      "authorization",
      "bearer",
      '"token"',
      '"body"',
      "password",
      "secret",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
