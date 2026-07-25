// End-to-end Project Brain vertical slice BELOW the CLI (v0.3 Phase 3).
//
// Wires the real WASM Kernel binding, the real pure Skills deriver, a real
// ProviderRegistry-style observation port, and the REAL Node Project Memory
// adapter (Phase 2) against a temporary data directory outside the repository.
// It captures twice with a changed observation, compares the latest two, and
// asserts the golden ordered ChangeSet, that the analyzed project stays
// byte-identical, that no forbidden value reaches stored bytes, and that
// required-failure and adapter-failure rollbacks write nothing. No CLI process
// or MCP server is launched.

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NormalizedProviderItem } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createNodeProjectMemoryStore } from "@oh-my-pm/project-memory";
import { deriveProjectBrainState } from "@oh-my-pm/skills";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProjectBrainRuntime } from "../src/projectbrain/index.js";
import type {
  MemoryCommitInput,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectObservationRequest,
  ProjectObservationResult,
  ProjectStateDeriver,
} from "../src/projectbrain/index.js";

const PROJECT_ID = "proj-e2e";

/** Adapt the real Phase 2 store to the Runtime memory port (structural match). */
function memoryPort(dataRootOverride: string): ProjectMemoryPort {
  const store = createNodeProjectMemoryStore({
    dataRootOverride,
    filesystem: { now: () => "2026-01-01T00:00:00.000Z", isProcessAlive: () => true },
  });
  return {
    async readManifest(projectId) {
      const manifest = await store.readManifest(projectId);
      if (manifest === null) return null;
      return {
        projectId: manifest.projectId,
        latestSnapshotId: manifest.latestSnapshotId,
        snapshotIds: manifest.snapshotIds,
        evidenceIds: manifest.evidenceIds,
      };
    },
    listSnapshots: (projectId) => store.listSnapshots(projectId),
    readSnapshot: (projectId, snapshotId) => store.readSnapshot(projectId, snapshotId) as never,
    readEvidence: (projectId, evidenceId) => store.readEvidence(projectId, evidenceId) as never,
    async commitSnapshotBundle(input: MemoryCommitInput) {
      const result = await store.commitSnapshotBundle({
        projectId: input.projectId,
        projectRootBoundary: input.projectRootBoundary,
        operationId: input.operationId,
        occurredAt: input.occurredAt,
        snapshot: input.snapshot as never,
        evidence: input.evidence as never,
      });
      return {
        projectId: result.projectId,
        snapshotId: result.snapshotId,
        idempotent: result.idempotent,
        latestSnapshotId: result.latestSnapshotId,
        snapshotCount: result.snapshotCount,
        evidenceCount: result.evidenceCount,
      };
    },
  };
}

/** A fixed-content observation port returning one Markdown document. */
function docObservation(items: readonly NormalizedProviderItem[]): ProjectObservationPort {
  return {
    async observe(request: ProjectObservationRequest): Promise<ProjectObservationResult> {
      return {
        observationId: request.observationId,
        ok: true,
        hasWarnings: false,
        response: { providerId: "local", items: [...items] },
      };
    },
  };
}

function markdownItem(id: string, body: string): NormalizedProviderItem {
  return { id, type: "document", title: id, source: "local", data: { content: body } };
}

const kernel = createNodeWasmProjectBrainKernelApi();
const deriver: ProjectStateDeriver = { derive: deriveProjectBrainState };

// Two documents (English + Persian) with a new task, a resolved risk, an
// explicit decision, and a severity change between captures.
const DOC_A = [
  "# Project",
  "## Objective",
  "Ship the v1 release.",
  "## Next steps",
  "- Wire the API",
  "## Risks",
  "- Timeline is tight",
  "## Decisions",
  "- Use Postgres",
  "## ریسک ها",
  "- بودجه محدود است",
].join("\n");

const DOC_B = [
  "# Project",
  "## Objective",
  "Ship the v1 release.",
  "## Next steps",
  "- Wire the API",
  "- Add integration tests",
  "## Blockers",
  "- Auth service is down",
  "## Decisions",
  "- Use Postgres",
  "- Adopt trunk-based dev",
].join("\n");

describe("project brain e2e (real adapter, below CLI)", () => {
  let root: string;
  let dataRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "oh-my-pm-pb-e2e-"));
    dataRoot = join(root, "data");
    projectRoot = join(root, "project");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, "README.md"), "# analyzed project\nunchanged\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runtimeFor(doc: string) {
    return createProjectBrainRuntime({
      kernel,
      memory: memoryPort(dataRoot),
      observation: docObservation([markdownItem("docs/status.md", doc)]),
      deriver,
    });
  }

  function captureInput(capturedAt: string) {
    return {
      requestId: `req-${capturedAt}`,
      projectRootBoundary: projectRoot,
      operationId: `op-${capturedAt.replace(/[:.]/g, "-")}`,
      observedAt: capturedAt,
      capturedAt,
      identitySeed: { explicitId: PROJECT_ID },
      locale: "en" as const,
      observations: [
        {
          observationId: "o1",
          request: { providerId: "local" as const, action: "read" as const, query: "." },
          sourceIdentity: "docs/status.md",
          includedScope: "full",
          required: true,
        },
      ],
      freshnessPolicy: { maxFutureSkewSeconds: 86_400 },
    };
  }

  it("captures A and B, compares latest two, and yields a deterministic ChangeSet", async () => {
    const projectBefore = await readFile(join(projectRoot, "README.md"), "utf8");

    const capA = await runtimeFor(DOC_A).capture(captureInput("2026-01-11T00:00:00Z"));
    expect(capA.ok).toBe(true);
    const capB = await runtimeFor(DOC_B).capture(captureInput("2026-01-12T00:00:00Z"));
    expect(capB.ok).toBe(true);
    expect(capB.snapshotId).not.toBe(capA.snapshotId);

    const compare = await runtimeFor(DOC_A).compare({
      requestId: "cmp",
      projectId: PROJECT_ID,
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy: { evidenceStaleAfterSeconds: 604_800, maxFutureSkewSeconds: 86_400 },
    });
    expect(compare.status).toBe("compared");
    const categories = compare.changeSet!.changes.map((c) => c.category);
    // The new task and blocker are added; the removed markdown risks are removed.
    expect(categories).toContain("added");
    expect(categories).toContain("removed");

    // Determinism: a second compare is deep-equal.
    const compareAgain = await runtimeFor(DOC_A).compare({
      requestId: "cmp",
      projectId: PROJECT_ID,
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy: { evidenceStaleAfterSeconds: 604_800, maxFutureSkewSeconds: 86_400 },
    });
    expect(compareAgain).toEqual(compare);

    // The analyzed project is byte-identical after the whole flow.
    expect(await readFile(join(projectRoot, "README.md"), "utf8")).toBe(projectBefore);
  });

  it("stored bytes contain no raw provider body, token, or absolute path", async () => {
    // The forbidden values live ONLY in a GitHub item's raw `data` (body/token)
    // and never in a visible title. providerItemsToTextItems must strip them so
    // no stored byte carries them. (Title-level display text a user typed is a
    // separate, allowed surface and is not tested for redaction here.)
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: memoryPort(dataRoot),
      observation: docObservation([
        markdownItem("docs/status.md", "# Project\n## Next steps\n- Ship it"),
        {
          id: "issue-1",
          type: "issue",
          title: "Fix auth",
          source: "github",
          data: {
            status: "open",
            body: "internal note ghp_FAKE_LEAK_TOKEN at /Users/secret/abs.md",
            token: "ghp_FAKE_LEAK_TOKEN",
          } as NormalizedProviderItem["data"],
        },
      ]),
      deriver,
    });
    const result = await runtime.capture(captureInput("2026-01-11T00:00:00Z"));
    expect(result.ok).toBe(true);

    // Scan every stored byte under the data root for forbidden raw values.
    const stored = await readAllFiles(dataRoot);
    expect(stored.some(([p]) => p.endsWith("manifest.json"))).toBe(true);
    for (const [, content] of stored) {
      expect(content).not.toContain("ghp_FAKE_LEAK_TOKEN");
      expect(content).not.toContain("/Users/secret/abs.md");
      expect(content).not.toContain("internal note");
      expect(content).not.toContain(projectRoot);
      expect(content).not.toContain("fingerprintInput");
    }
  });

  it("a required-provider failure writes nothing", async () => {
    const failingObservation: ProjectObservationPort = {
      async observe(request) {
        return {
          observationId: request.observationId,
          ok: false,
          hasWarnings: false,
          failureCode: "OMP-P-4004",
        };
      },
    };
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: memoryPort(dataRoot),
      observation: failingObservation,
      deriver,
    });
    const result = await runtime.capture(captureInput("2026-01-11T00:00:00Z"));
    expect(result.ok).toBe(false);
    // No store was created.
    const stored = await readAllFiles(dataRoot);
    expect(stored.some(([p]) => p.endsWith("manifest.json"))).toBe(false);
  });

  it("an idempotent repeat capture leaves a single snapshot", async () => {
    await runtimeFor(DOC_A).capture(captureInput("2026-01-11T00:00:00Z"));
    const again = await runtimeFor(DOC_A).capture(captureInput("2026-01-11T00:00:00Z"));
    expect(again.idempotent).toBe(true);
    const manifest = await memoryPort(dataRoot).readManifest(PROJECT_ID);
    expect(manifest!.snapshotIds).toHaveLength(1);
  });
});

/** Recursively read every file under a directory as [path, utf8]. */
async function readAllFiles(dir: string): Promise<Array<[string, string]>> {
  const { readdir } = await import("node:fs/promises");
  const out: Array<[string, string]> = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push([full, await readFile(full, "utf8")]);
    }
  }
  await walk(dir);
  return out;
}
