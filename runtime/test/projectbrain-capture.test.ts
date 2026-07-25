import { describe, expect, it } from "vitest";

import {
  createProjectBrainRuntime,
  PROJECT_BRAIN_RUNTIME_ERROR_CODES,
} from "../src/projectbrain/index.js";
import type { ProjectObservationRequest } from "../src/projectbrain/index.js";
import {
  captureInput,
  githubIssueItem,
  inMemoryMemoryPort,
  markdownItem,
  markdownObservation,
  realDeriver,
  realKernel,
  scriptedObservationPort,
} from "./projectbrain-fixtures.js";
import type { ScriptedObservation } from "./projectbrain-fixtures.js";

const kernel = realKernel();

function runtimeWith(
  script: ReadonlyMap<string, ScriptedObservation>,
  memory = inMemoryMemoryPort(),
) {
  const observation = scriptedObservationPort(script);
  const runtime = createProjectBrainRuntime({ kernel, memory, observation, deriver: realDeriver });
  return { runtime, memory, observation };
}

const STATUS_DOC = markdownItem(
  "docs/status.md",
  ["# Project", "## Objective", "Ship v1.", "## Next steps", "- Wire the API", "## Risks", "- Timeline is tight"].join("\n"),
);

describe("capture — success path", () => {
  it("captures a snapshot and commits exactly one bundle", async () => {
    const { runtime, memory } = runtimeWith(
      new Map([["o1", { ok: true, items: [STATUS_DOC] }]]),
    );
    const result = await runtime.capture(captureInput([markdownObservation("o1", "docs/status.md")]));
    expect(result.ok).toBe(true);
    expect(result.projectId).toBe("proj-1");
    expect(result.snapshotId).toMatch(/^snapshot:/);
    expect(result.stateFingerprint).toMatch(/^sha256:/);
    expect(result.snapshotFingerprint).toMatch(/^sha256:/);
    expect(result.itemCount).toBeGreaterThan(0);
    expect(memory.commits).toHaveLength(1);
    expect(result.coverageComplete).toBe(true);
  });

  it("produces deep-equal results for identical inputs and timestamps", async () => {
    const script = new Map<string, ScriptedObservation>([["o1", { ok: true, items: [STATUS_DOC] }]]);
    const a = await runtimeWith(script).runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md")]),
    );
    const b = await runtimeWith(script).runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md")]),
    );
    // The trace and coverage are deterministic; compare the sanitized result.
    expect(a).toEqual(b);
  });

  it("surfaces idempotency on a repeat capture into the same store", async () => {
    const memory = inMemoryMemoryPort();
    const script = new Map<string, ScriptedObservation>([["o1", { ok: true, items: [STATUS_DOC] }]]);
    const input = captureInput([markdownObservation("o1", "docs/status.md")]);
    await createProjectBrainRuntime({
      kernel,
      memory,
      observation: scriptedObservationPort(script),
      deriver: realDeriver,
    }).capture(input);
    const again = await createProjectBrainRuntime({
      kernel,
      memory,
      observation: scriptedObservationPort(script),
      deriver: realDeriver,
    }).capture(input);
    expect(again.idempotent).toBe(true);
    expect(memory.commits).toHaveLength(2); // both attempts commit; store dedupes
  });

  it("executes observations sequentially in input order", async () => {
    const { runtime, observation } = runtimeWith(
      new Map([
        ["o1", { ok: true, items: [markdownItem("a.md", "# A\n## Next\n- t")] }],
        ["o2", { ok: true, items: [markdownItem("b.md", "# B\n## Risks\n- r")] }],
      ]),
    );
    await runtime.capture(
      captureInput([
        markdownObservation("o1", "a.md"),
        markdownObservation("o2", "b.md"),
      ]),
    );
    expect(observation.executionOrder).toEqual(["o1", "o2"]);
  });
});

describe("capture — coverage", () => {
  it("optional-source failure records skipped coverage and still commits", async () => {
    const { runtime, memory } = runtimeWith(
      new Map<string, ScriptedObservation>([
        ["o1", { ok: true, items: [STATUS_DOC] }],
        ["o2", { ok: false, failureCode: "OMP-P-4004" }],
      ]),
    );
    const result = await runtime.capture(
      captureInput([
        markdownObservation("o1", "docs/status.md", true),
        markdownObservation("o2", "github/issues", false),
      ]),
    );
    expect(result.ok).toBe(true);
    expect(memory.commits).toHaveLength(1);
    expect(result.coverage.some((c) => c.coverageState === "skipped")).toBe(true);
    expect(result.coverageComplete).toBe(false);
  });

  it("provider warnings mark a source partial", async () => {
    const { runtime } = runtimeWith(
      new Map([["o1", { ok: true, items: [STATUS_DOC], hasWarnings: true }]]),
    );
    const result = await runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md")]),
    );
    expect(result.coverage[0]?.coverageState).toBe("partial");
    expect(result.coverageComplete).toBe(false);
  });

  it("required-source failure writes nothing and returns a controlled error", async () => {
    const { runtime, memory } = runtimeWith(
      new Map<string, ScriptedObservation>([["o1", { ok: false, failureCode: "OMP-P-4004" }]]),
    );
    const result = await runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md", true)]),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.requiredObservationFailed);
    // The raw provider message is never surfaced; only the sanitized code.
    expect(result.error?.message).not.toContain("Error");
    expect(memory.commits).toHaveLength(0);
  });
});

describe("capture — failure isolation", () => {
  it("a memory commit failure returns failure and does not claim success", async () => {
    const memory = inMemoryMemoryPort();
    memory.failNextCommit("disk full");
    const { runtime } = runtimeWith(new Map([["o1", { ok: true, items: [STATUS_DOC] }]]), memory);
    const result = await runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md")]),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.persistenceCommitFailed);
    // The raw underlying message must not leak.
    expect(result.error?.message).not.toContain("disk full");
  });

  it("no write occurs before the single commit (kernel identity failure)", async () => {
    const memory = inMemoryMemoryPort();
    const { runtime } = runtimeWith(new Map([["o1", { ok: true, items: [STATUS_DOC] }]]), memory);
    // An invalid seed (neither explicitId nor token+salt) aborts before observe.
    const result = await runtime.capture(
      captureInput([markdownObservation("o1", "docs/status.md")], { identitySeed: {} }),
    );
    expect(result.ok).toBe(false);
    expect(memory.commits).toHaveLength(0);
  });
});

describe("capture — privacy", () => {
  it("discards raw provider data: no forbidden field reaches the committed bundle", async () => {
    const leaky = githubIssueItem("issue-1", "Fix login", {
      // A raw body and token planted in the provider item data; these must be
      // stripped by providerItemsToTextItems and never persisted.
      body: "secret ghp_FAKE_TOKEN body text",
      token: "ghp_FAKE_TOKEN",
      status: "open",
    });
    const { runtime, memory } = runtimeWith(new Map([["o1", { ok: true, items: [leaky] }]]));
    const result = await runtime.capture(
      captureInput([markdownObservation("o1", "github/issues")]),
    );
    expect(result.ok).toBe(true);
    // Scan the PERSISTED payload (snapshot + evidence records), not the transport
    // input. The projectRootBoundary is passed to the memory port as a
    // write-safety boundary and is never written into a record by Phase 2.
    const commit = memory.commits[0]!;
    const persisted = JSON.stringify({ snapshot: commit.snapshot, evidence: commit.evidence });
    expect(persisted).not.toContain("ghp_FAKE_TOKEN");
    expect(persisted).not.toContain("secret ghp_FAKE_TOKEN body text");
    expect(persisted).not.toContain("fingerprintInput");
    // The project root boundary is never persisted into any record.
    expect(persisted).not.toContain("/work/project");
    // And the boundary the Runtime forwarded to the port is exactly the input;
    // nothing else about the project root is invented.
    expect(commit.projectRootBoundary).toBe("/work/project");
  });
});

describe("capture — input validation", () => {
  it("rejects duplicate observation ids", async () => {
    const { runtime } = runtimeWith(new Map());
    const obs: ProjectObservationRequest = markdownObservation("dup", "a");
    const result = await runtime.capture(captureInput([obs, obs]));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput);
  });
});
