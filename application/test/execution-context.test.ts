// The minimal execution context and the boundary envelope it enables.
//
// Covers the guarantees v0.6.1 adds: a `generatedAt` that comes only from an
// injected clock, source descriptors that carry no secret or resolved path, a
// cancellation path that can never report partial data as success, and
// deterministic serialization of the envelope.

import { describe, expect, it } from "vitest";
import {
  FIXED_LOCAL_INSTANT,
  OperationCancelledError,
  applicationResultToJson,
  assertSafeSourceDescriptor,
  categoryOfCode,
  exitCodeForCode,
  executionContext,
  fixedExecutionContext,
  generatedAt,
  isCancelled,
  mcpIsErrorForCode,
  runGitHubProjectApplication,
  runLocalProjectApplication,
  throwIfCancelled,
} from "../src/index.js";
import type { ExecutionContext } from "../src/index.js";

/** A context whose clock advances by one second per read. */
function tickingContext(operationId = "test"): ExecutionContext {
  let tick = 0;
  return {
    operationId,
    now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, tick++)),
  };
}

describe("the execution context stays minimal", () => {
  it("carries only an id, a clock, and an optional signal", () => {
    const context = executionContext({ operationId: "op-1", now: () => new Date(0) });
    expect(Object.keys(context).sort()).toEqual(["now", "operationId"]);
  });

  it("includes the signal only when one was supplied", () => {
    const controller = new AbortController();
    const context = executionContext({
      operationId: "op-1",
      now: () => new Date(0),
      signal: controller.signal,
    });
    expect(Object.keys(context).sort()).toEqual(["now", "operationId", "signal"]);
  });

  it("exposes no logger or redactor", () => {
    // Deliberate: neither has a consumer, and sanitization already happens
    // where results are constructed. Adding unused surface would oblige every
    // future caller to keep it working.
    const context = executionContext({ operationId: "op-1", now: () => new Date(0) });
    expect("logger" in context).toBe(false);
    expect("redactor" in context).toBe(false);
  });
});

describe("the injected clock is the only source of generatedAt", () => {
  it("returns the fixed local instant for the deterministic pipeline", () => {
    const context = fixedExecutionContext("op-1");
    expect(generatedAt(context)).toBe(FIXED_LOCAL_INSTANT);
  });

  it("gives the same answer on every read of a fixed context", () => {
    const context = fixedExecutionContext("op-1");
    expect(generatedAt(context)).toBe(generatedAt(context));
  });

  it("cannot be mutated through the Date it hands back", () => {
    // A shared Date instance would let a caller move the context's clock by
    // mutating the object it received.
    const context = fixedExecutionContext("op-1");
    const first = context.now();
    first.setFullYear(1999);
    expect(generatedAt(context)).toBe(FIXED_LOCAL_INSTANT);
  });

  it("advances when the injected clock advances", () => {
    const context = tickingContext();
    const a = generatedAt(context);
    const b = generatedAt(context);
    expect(a).not.toBe(b);
  });
});

describe("cancellation is explicit and controlled", () => {
  it("reports an un-aborted context as not cancelled", () => {
    expect(isCancelled(fixedExecutionContext("op-1"))).toBe(false);
  });

  it("treats an absent context as not cancelled", () => {
    expect(isCancelled(undefined)).toBe(false);
  });

  it("detects an aborted signal", () => {
    const controller = new AbortController();
    const context = executionContext({
      operationId: "op-1",
      now: () => new Date(0),
      signal: controller.signal,
    });
    expect(isCancelled(context)).toBe(false);
    controller.abort();
    expect(isCancelled(context)).toBe(true);
  });

  it("detects an abort that happens after an await", async () => {
    // The regression this guards: `AbortSignal.aborted` is a readonly boolean,
    // so a naive second check gets narrowed to `false` by the compiler after an
    // earlier check -- exactly the case where the value can genuinely flip.
    const controller = new AbortController();
    const context = executionContext({
      operationId: "op-1",
      now: () => new Date(0),
      signal: controller.signal,
    });
    expect(isCancelled(context)).toBe(false);
    await Promise.resolve().then(() => controller.abort());
    expect(isCancelled(context)).toBe(true);
  });

  it("throws a typed error carrying the operation id", () => {
    const controller = new AbortController();
    controller.abort();
    const context = executionContext({
      operationId: "op-42",
      now: () => new Date(0),
      signal: controller.signal,
    });
    expect(() => throwIfCancelled(context)).toThrow(OperationCancelledError);
    try {
      throwIfCancelled(context);
    } catch (error) {
      expect((error as OperationCancelledError).operationId).toBe("op-42");
      // No provider payload, path, or token in the message.
      expect((error as Error).message).toBe("operation was cancelled");
    }
  });

  it("classifies the cancellation code across every surface", () => {
    expect(categoryOfCode("github_cancelled")).toBe("cancelled");
    // Not our defect and not a bad request: it shares the precondition exit
    // code rather than claiming a runtime failure.
    expect(exitCodeForCode("github_cancelled")).toBe(2);
    // A cancellation the caller asked for is an expected outcome, so MCP
    // reports it as a structured result rather than a protocol error.
    expect(mcpIsErrorForCode("github_cancelled")).toBe(false);
  });
});

describe("the local envelope describes the shared use case", () => {
  const deps = {
    loadDocuments: () => ({
      ok: false as const,
      configDisplayPath: ".oh-my-pm/project.json",
      code: "project_root_not_found",
    }),
    version: "0.0.0-test",
  };

  it("carries a safe source descriptor for a failure", async () => {
    const context = fixedExecutionContext("op-1");
    const result = await runLocalProjectApplication("brief", "./nowhere", deps, context);

    expect(result.operation).toBe("project.brief");
    expect(result.generatedAt).toBe(FIXED_LOCAL_INSTANT);
    expect(result.source.kind).toBe("local-project");
    // The caller-supplied root, echoed unresolved.
    expect(result.source.reference).toBe("./nowhere");
    expect(result.data).toBeNull();
    expect(() => assertSafeSourceDescriptor(result.source)).not.toThrow();
  });

  it("carries the failure as a diagnostic with a stable public code", async () => {
    const context = fixedExecutionContext("op-1");
    const result = await runLocalProjectApplication("brief", "./nowhere", deps, context);

    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    // An unreadable config is a CONFIG failure, distinct from a missing root:
    // `deps` above fails the config load, which the shared classifier maps to
    // project_config_invalid.
    expect(diagnostic?.code).toBe("project_config_invalid");
    expect(diagnostic?.severity).toBe("error");
  });

  it("distinguishes a missing root from an unreadable config", async () => {
    // The other branch of the same classifier: the config read succeeded, but
    // the documents scan found no root. Both must keep their own public code,
    // because the CLI maps them to the same exit status while an MCP client
    // branches on the code.
    const missingRootDeps = {
      loadDocuments: () => ({
        ok: true as const,
        configExists: false,
        configDisplayPath: ".oh-my-pm/project.json",
        documents: {
          ok: false,
          items: [],
          filesScanned: 0,
          filesMatched: 0,
          filesExcluded: 0,
          filesLoaded: 0,
          totalBytes: 0,
          warnings: [],
        },
      }),
      version: "0.0.0-test",
    };
    const context = fixedExecutionContext("op-1");
    const result = await runLocalProjectApplication("brief", "./nowhere", missingRootDeps, context);
    expect(result.diagnostics[0]?.code).toBe("project_root_not_found");
  });

  it("serializes deterministically", async () => {
    const context = fixedExecutionContext("op-1");
    const a = await runLocalProjectApplication("brief", "./nowhere", deps, context);
    const b = await runLocalProjectApplication("brief", "./nowhere", deps, context);
    expect(applicationResultToJson(a)).toBe(applicationResultToJson(b));
  });

  it("rejects a source descriptor holding a resolved absolute path", () => {
    // The guarantee that keeps a result safe to serialize on both surfaces.
    expect(() =>
      assertSafeSourceDescriptor({ kind: "local-project", reference: "/Users/someone/project" }),
    ).toThrow(/absolute path/u);
  });

  it("rejects a source descriptor holding a token", () => {
    expect(() =>
      assertSafeSourceDescriptor({ kind: "local-project", reference: "ghp_secretvalue" }),
    ).toThrow(/secret marker/u);
  });
});

describe("the GitHub envelope refuses to report cancelled work as success", () => {
  const baseDeps = {
    caller: "cli" as const,
    resolveProviderConfig: () => ({ config: null, message: "provider configuration is invalid" }),
    createTransport: () => {
      throw new Error("transport must not be constructed on a controlled failure");
    },
    now: () => "2026-03-01T00:00:00.000Z",
    version: "0.0.0-test",
  };

  it("wraps a controlled failure without building a transport", async () => {
    const context = fixedExecutionContext("op-1");
    const result = await runGitHubProjectApplication(
      "brief",
      { repository: "o/r" },
      baseDeps,
      context,
    );

    expect(result.operation).toBe("github.brief");
    expect(result.data).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("github_invalid_config");
    expect(result.source.reference).toBe("o/r");
  });

  it("uses the context clock for generatedAt, not the workflow clock", async () => {
    // The two answer different questions: the workflow `now` is the instant
    // overdue classification ran against, `generatedAt` is when the envelope
    // was built. Conflating them would make determinism tests pin the wrong
    // value.
    const context = fixedExecutionContext("op-1");
    const result = await runGitHubProjectApplication(
      "brief",
      { repository: "o/r" },
      baseDeps,
      context,
    );
    expect(result.generatedAt).toBe(FIXED_LOCAL_INSTANT);
    expect(result.generatedAt).not.toBe("2026-03-01T00:00:00.000Z");
  });
});
