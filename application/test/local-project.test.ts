// Local project workflow use cases: orchestration, dependency injection,
// sanitized failures, and determinism.

import { describe, expect, it } from "vitest";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import type { Runtime } from "@oh-my-pm/runtime";
import {
  getLocalProjectBrief,
  getLocalProjectHandoff,
  getLocalProjectNextActions,
  getLocalProjectRisks,
  looksLikeAbsolutePath,
  runLocalProjectWorkflow,
} from "../src/index.js";
import type { ConfiguredDocumentLoad, LocalProjectDeps } from "../src/index.js";

const ITEMS: LocalProviderItemInput[] = [
  {
    id: "task-1",
    type: "task",
    title: "Ship the application boundary",
    data: { status: "open", owner: "PM", tags: ["planning"] },
  },
  {
    id: "risk-1",
    type: "task",
    title: "Blocked on review",
    data: { status: "blocked", owner: "Design", tags: ["blocked", "risk"] },
  },
];

function loadOk(items: LocalProviderItemInput[] = ITEMS): ConfiguredDocumentLoad {
  return {
    ok: true,
    configExists: true,
    configDisplayPath: "fixture/oh-my-pm.config.json",
    documents: {
      ok: true,
      items,
      filesScanned: 5,
      filesMatched: 3,
      filesExcluded: 2,
      filesLoaded: items.length,
      totalBytes: 128,
      warnings: [],
    },
  };
}

/** A stub Runtime so the use-case tests stay offline and Kernel-free. */
function stubRuntime(captured: { requests: unknown[] }): Runtime {
  return {
    handle: async (request: unknown) => {
      captured.requests.push(request);
      return {
        id: (request as { id: string }).id,
        ok: true,
        data: { output: { summary: "ok", items: ITEMS.length } },
        trace: [],
      };
    },
  } as unknown as Runtime;
}

function deps(
  load: ConfiguredDocumentLoad,
  captured: { requests: unknown[] } = { requests: [] },
): LocalProjectDeps {
  return {
    loadDocuments: () => load,
    createRuntime: () => stubRuntime(captured),
    version: "0.5.1",
  };
}

describe("local project workflows", () => {
  it("returns a structured success with document counters", async () => {
    const result = await getLocalProjectBrief("fixture", deps(loadOk()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation).toBe("brief");
    expect(result.root).toBe("fixture");
    expect(result.documents).toEqual({
      filesScanned: 5,
      filesMatched: 3,
      filesExcluded: 2,
      filesLoaded: 2,
      totalBytes: 128,
      configExists: true,
    });
    expect(result.output).toBeDefined();
  });

  it("routes each of the four operations to its own request", async () => {
    for (const [run, operation] of [
      [getLocalProjectBrief, "brief"],
      [getLocalProjectRisks, "risks"],
      [getLocalProjectNextActions, "next"],
      [getLocalProjectHandoff, "handoff"],
    ] as const) {
      const captured = { requests: [] as unknown[] };
      const result = await run("fixture", deps(loadOk(), captured));
      expect(result.ok).toBe(true);
      expect(result.operation).toBe(operation);
      expect(captured.requests).toHaveLength(1);
      expect((captured.requests[0] as { id: string }).id).toBe(`cli-${operation}`);
    }
  });

  it("never puts the project root into the runtime payload", async () => {
    const captured = { requests: [] as unknown[] };
    await getLocalProjectBrief("/absolute/secret/project", deps(loadOk(), captured));
    expect(JSON.stringify(captured.requests)).not.toContain("secret");
  });

  it("uses the injected loader rather than the filesystem", async () => {
    let calls = 0;
    const result = await getLocalProjectBrief("anything", {
      loadDocuments: (root) => {
        calls += 1;
        expect(root).toBe("anything");
        return loadOk();
      },
      createRuntime: () => stubRuntime({ requests: [] }),
      version: "0.5.1",
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("is deterministic across repeated runs", async () => {
    const first = await getLocalProjectBrief("fixture", deps(loadOk()));
    const second = await getLocalProjectBrief("fixture", deps(loadOk()));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("local project failures", () => {
  it("rejects an empty root before loading anything", async () => {
    let called = false;
    const result = await runLocalProjectWorkflow("brief", "   ", {
      loadDocuments: () => {
        called = true;
        return loadOk();
      },
      version: "0.5.1",
    });
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("project_root_not_found");
  });

  it("reports an invalid config without leaking config text", async () => {
    const result = await getLocalProjectBrief("fixture", {
      loadDocuments: () => ({
        ok: false,
        configDisplayPath: "fixture/oh-my-pm.config.json",
        code: "project_config_invalid_json",
      }),
      version: "0.5.1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("project_config_invalid");
    expect(result.message).toContain("fixture/oh-my-pm.config.json");
    expect(result.message).not.toContain("{");
  });

  it("distinguishes a missing root from a non-directory root", async () => {
    const missing = await getLocalProjectBrief("nope", {
      loadDocuments: () => ({
        ok: true,
        configExists: false,
        configDisplayPath: "nope/oh-my-pm.config.json",
        documents: {
          ok: false,
          items: [],
          filesScanned: 0,
          filesMatched: 0,
          filesExcluded: 0,
          filesLoaded: 0,
          totalBytes: 0,
          warnings: [{ code: "project_root_not_found" }],
        },
      }),
      version: "0.5.1",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("project_root_not_found");

    const notDir = await getLocalProjectBrief("file.md", {
      loadDocuments: () => ({
        ok: true,
        configExists: false,
        configDisplayPath: "file.md/oh-my-pm.config.json",
        documents: {
          ok: false,
          items: [],
          filesScanned: 0,
          filesMatched: 0,
          filesExcluded: 0,
          filesLoaded: 0,
          totalBytes: 0,
          warnings: [{ code: "project_root_not_directory" }],
        },
      }),
      version: "0.5.1",
    });
    expect(notDir.ok).toBe(false);
    if (!notDir.ok) expect(notDir.code).toBe("project_root_not_directory");
  });

  it("fails when no document matched", async () => {
    const result = await getLocalProjectBrief("empty", {
      loadDocuments: () => ({
        ...loadOk([]),
        documents: { ...loadOk([]).documents, ok: true, filesLoaded: 0, items: [] },
      }),
      version: "0.5.1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("project_documents_empty");
  });

  it("converts a runtime failure into a sanitized structured failure", async () => {
    const result = await getLocalProjectBrief("fixture", {
      loadDocuments: () => loadOk(),
      createRuntime: () =>
        ({
          handle: async () => ({
            id: "cli-brief",
            ok: false,
            error: { code: "OMP-R-1", message: "runtime refused" },
            data: {},
            trace: [],
          }),
        }) as unknown as Runtime,
      version: "0.5.1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("project_runtime_failed");
    expect(result.message).toBe("OMP-R-1: runtime refused");
  });

  it("fails closed when the runtime returns no output", async () => {
    const result = await getLocalProjectBrief("fixture", {
      loadDocuments: () => loadOk(),
      createRuntime: () =>
        ({
          handle: async () => ({ id: "cli-brief", ok: true, data: {}, trace: [] }),
        }) as unknown as Runtime,
      version: "0.5.1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("project_output_invalid");
  });

  it("never leaks a resolved absolute path in a failure message", async () => {
    const result = await getLocalProjectBrief("/Users/someone/private/project", {
      loadDocuments: () => ({
        ok: true,
        configExists: false,
        configDisplayPath: "/Users/someone/private/project/oh-my-pm.config.json",
        documents: {
          ok: false,
          items: [],
          filesScanned: 0,
          filesMatched: 0,
          filesExcluded: 0,
          filesLoaded: 0,
          totalBytes: 0,
          warnings: [{ code: "project_root_not_found" }],
        },
      }),
      version: "0.5.1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The caller-supplied root may be echoed; it is what the caller typed. The
    // point is that nothing MORE resolved than that appears.
    expect(result.message).toBe("project root was not found: /Users/someone/private/project");
    expect(looksLikeAbsolutePath("/Users/someone")).toBe(true);
    expect(looksLikeAbsolutePath("relative/path")).toBe(false);
  });
});
