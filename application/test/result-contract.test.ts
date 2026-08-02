// Tests for the v0.5.4 shared result contract, taxonomy, and redaction rules.
//
// These assert the PROPERTIES the contract promises -- deterministic
// serialization, totality of the code classification, and that no secret or
// resolved absolute path can be carried -- rather than restating the tables.
// A table restated in a test is a copy, not a check.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPLICATION_RESULT_SCHEMA_VERSION,
  CODE_CATEGORIES,
  DIAGNOSTIC_SEVERITIES,
  ERROR_CATEGORIES,
  EXIT_INVOCATION_OR_PRECONDITION,
  EXIT_RUNTIME_FAILED,
  SOURCE_KINDS,
  applicationResult,
  applicationResultToJson,
  assertSafeSourceDescriptor,
  categoryContract,
  categoryOfCode,
  diagnosticForCode,
  exitCodeForCode,
  mcpIsErrorForCode,
  orderedResult,
  unsafeValueReason,
} from "../src/index.js";
import type { ApplicationResult, SourceDescriptor } from "../src/index.js";

const applicationSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const localSource: SourceDescriptor = { kind: "local-project", reference: "./my-project" };

describe("ApplicationResult envelope", () => {
  it("stamps the schema version and defaults the collections", () => {
    const result = applicationResult({
      operation: "project.brief",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: localSource,
      data: { headline: "ok" },
    });
    expect(result.schemaVersion).toBe(APPLICATION_RESULT_SCHEMA_VERSION);
    expect(result.diagnostics).toEqual([]);
    expect(result.provenance).toEqual([]);
  });

  it("serializes with deterministic key order regardless of build order", () => {
    // The same logical result assembled with keys in a different order must
    // serialize identically -- that is the whole point of orderedResult.
    const canonical = applicationResult({
      operation: "project.risks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { kind: "github-issues", reference: "he8um/oh-my-pm", selection: { a: 1, z: 2 } },
      data: { items: [1, 2] },
      diagnostics: [{ code: "x_warn", severity: "warning", message: "careful" }],
    });
    const shuffled = {
      provenance: canonical.provenance,
      diagnostics: canonical.diagnostics,
      data: canonical.data,
      source: {
        selection: { z: 2, a: 1 },
        reference: "he8um/oh-my-pm",
        kind: "github-issues",
      },
      generatedAt: canonical.generatedAt,
      operation: canonical.operation,
      schemaVersion: canonical.schemaVersion,
    } as unknown as ApplicationResult<{ items: number[] }>;

    expect(applicationResultToJson(shuffled)).toBe(applicationResultToJson(canonical));
  });

  it("omits absent optional fields rather than emitting null", () => {
    const json = JSON.parse(
      applicationResultToJson(
        applicationResult({
          operation: "project.next",
          generatedAt: "2026-01-01T00:00:00.000Z",
          source: localSource,
          data: null,
        }),
      ),
    ) as Record<string, unknown>;
    const source = json.source as Record<string, unknown>;
    expect(Object.hasOwn(source, "identifier")).toBe(false);
    expect(Object.hasOwn(source, "selection")).toBe(false);
  });

  it("is stable across repeated serialization", () => {
    const result = applicationResult({
      operation: "project.handoff",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: localSource,
      data: { a: 1 },
    });
    expect(applicationResultToJson(result)).toBe(applicationResultToJson(result));
  });

  it("carries no process-specific object through orderedResult", () => {
    const ordered = orderedResult(
      applicationResult({
        operation: "project.brief",
        generatedAt: "2026-01-01T00:00:00.000Z",
        source: localSource,
        data: { ok: true },
      }),
    );
    // Every key must survive a JSON round trip: no functions, no symbols, no
    // class instances that would serialize to {} and silently lose data.
    expect(JSON.parse(JSON.stringify(ordered))).toEqual(ordered);
  });
});

describe("source descriptors", () => {
  it("covers every source the product can read from", () => {
    // A closed set: adding a kind is a deliberate contract change.
    expect([...SOURCE_KINDS]).toEqual([
      "local-project",
      "github-repository",
      "github-issues",
      "github-pull-requests",
      "github-item",
      "github-search",
      "project-memory-snapshot",
      "project-timeline",
    ]);
  });

  it("accepts a caller-supplied relative root", () => {
    expect(() =>
      assertSafeSourceDescriptor({ kind: "local-project", reference: "./x" }),
    ).not.toThrow();
  });

  it("rejects a resolved absolute path", () => {
    for (const reference of ["/Users/someone/project", "C:\\Users\\someone\\project"]) {
      expect(() => assertSafeSourceDescriptor({ kind: "local-project", reference })).toThrow(
        /absolute path/,
      );
    }
  });

  it("rejects a token or authorization header in any field", () => {
    expect(() =>
      assertSafeSourceDescriptor({
        kind: "github-repository",
        reference: "he8um/oh-my-pm",
        identifier: "ghp_0123456789abcdefghij",
      }),
    ).toThrow(/secret marker/);
    expect(() =>
      assertSafeSourceDescriptor({
        kind: "github-repository",
        reference: "he8um/oh-my-pm",
        selection: { header: "Authorization: Bearer abc" },
      }),
    ).toThrow(/secret marker/);
  });

  it("flags the token shapes GitHub actually issues", () => {
    for (const token of [
      "ghp_aaaaaaaaaaaaaaaaaaaa",
      "gho_aaaaaaaaaaaaaaaaaaaa",
      "ghs_aaaaaaaaaaaaaaaaaaaa",
      "github_pat_aaaaaaaaaaaa",
    ]) {
      expect(unsafeValueReason(token)).not.toBeNull();
    }
  });
});

describe("error taxonomy", () => {
  it("classifies every declared public failure code", () => {
    // Totality is what makes exitCodeForCode/mcpIsErrorForCode trustworthy. The
    // code lists are read from source so a new code cannot be added to a use
    // case without appearing here.
    const declared = new Set<string>();
    for (const file of ["types.ts", "github-project.ts"]) {
      const source = readFileSync(join(applicationSrc, file), "utf8");
      for (const match of source.matchAll(/^\s*\|\s*"([a-z0-9_]+)"/gm)) {
        declared.add(match[1]);
      }
    }
    expect(declared.size).toBeGreaterThan(0);
    for (const code of declared) {
      expect(
        Object.hasOwn(CODE_CATEGORIES, code),
        `${code} is a declared failure code but is not classified in CODE_CATEGORIES`,
      ).toBe(true);
    }
  });

  it("classifies no code that no longer exists", () => {
    const sources = ["types.ts", "github-project.ts"]
      .map((f) => readFileSync(join(applicationSrc, f), "utf8"))
      .join("\n");
    for (const code of Object.keys(CODE_CATEGORIES)) {
      expect(sources.includes(`"${code}"`), `${code} is classified but declared nowhere`).toBe(
        true,
      );
    }
  });

  it("gives every category a complete behavioural contract", () => {
    for (const category of ERROR_CATEGORIES) {
      const contract = categoryContract(category);
      expect(contract.category).toBe(category);
      expect(typeof contract.retryable).toBe("boolean");
      expect([EXIT_RUNTIME_FAILED, EXIT_INVOCATION_OR_PRECONDITION]).toContain(contract.exitCode);
      expect(DIAGNOSTIC_SEVERITIES).toContain(contract.severity);
      expect(typeof contract.mcpIsError).toBe("boolean");
    }
  });

  it("maps an unknown code to our own defect rather than throwing", () => {
    // A presentation adapter must always be able to map a failure.
    expect(categoryOfCode("something_new_and_unmapped")).toBe("internalInvariant");
    expect(exitCodeForCode("something_new_and_unmapped")).toBe(EXIT_RUNTIME_FAILED);
  });

  it("keeps the documented CLI exit-code policy", () => {
    // Caller-fixable preconditions exit 2; failures of our own execution exit 1.
    expect(exitCodeForCode("project_root_not_found")).toBe(EXIT_INVOCATION_OR_PRECONDITION);
    expect(exitCodeForCode("github_invalid_repository")).toBe(EXIT_INVOCATION_OR_PRECONDITION);
    expect(exitCodeForCode("project_config_invalid")).toBe(EXIT_INVOCATION_OR_PRECONDITION);
    expect(exitCodeForCode("project_runtime_failed")).toBe(EXIT_RUNTIME_FAILED);
    expect(exitCodeForCode("project_output_invalid")).toBe(EXIT_RUNTIME_FAILED);
  });

  it("keeps expected validation failures as structured MCP results", () => {
    // An agent must be able to read the code and correct its own call rather
    // than seeing an unstructured crash.
    expect(mcpIsErrorForCode("project_root_not_found")).toBe(false);
    expect(mcpIsErrorForCode("github_invalid_repository")).toBe(false);
    // A genuine upstream or internal failure is an error.
    expect(mcpIsErrorForCode("github_runtime_failed")).toBe(true);
    expect(mcpIsErrorForCode("project_output_invalid")).toBe(true);
  });

  it("marks only genuinely retryable categories retryable", () => {
    expect(categoryContract("provider").retryable).toBe(true);
    expect(categoryContract("rateLimit").retryable).toBe(true);
    expect(categoryContract("validation").retryable).toBe(false);
    expect(categoryContract("invocation").retryable).toBe(false);
    expect(categoryContract("internalInvariant").retryable).toBe(false);
  });

  it("builds a diagnostic carrying the code, severity, and retryability", () => {
    const diagnostic = diagnosticForCode("github_runtime_failed", "the provider request failed", {
      remediation: "retry, or check the repository name",
    });
    expect(diagnostic.code).toBe("github_runtime_failed");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.remediation).toBe("retry, or check the repository name");
    // No cause chain, no stack.
    expect(Object.hasOwn(diagnostic, "details")).toBe(false);
  });

  it("serializes a diagnostic deterministically inside a result", () => {
    const result = applicationResult({
      operation: "github.risks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { kind: "github-issues", reference: "he8um/oh-my-pm" },
      data: null,
      diagnostics: [
        diagnosticForCode("github_invalid_limit", "limit must be between 1 and 100"),
        diagnosticForCode("github_runtime_failed", "the provider request failed"),
      ],
    });
    expect(applicationResultToJson(result)).toBe(applicationResultToJson(result));
    const parsed = JSON.parse(applicationResultToJson(result)) as {
      diagnostics: Array<Record<string, unknown>>;
    };
    // Order within the array is the caller's; key order within each entry is ours.
    expect(Object.keys(parsed.diagnostics[0])).toEqual([
      "code",
      "severity",
      "message",
      "retryable",
    ]);
  });
});

describe("provenance", () => {
  it("carries a traceable origin without an absolute path", () => {
    const result = applicationResult({
      operation: "project.risks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: localSource,
      data: { risks: 1 },
      provenance: [
        {
          source: localSource,
          document: "docs/risks.md",
          line: 12,
          rule: "blocked-status",
        },
      ],
    });
    const parsed = JSON.parse(applicationResultToJson(result)) as {
      provenance: Array<Record<string, unknown>>;
    };
    expect(parsed.provenance[0].document).toBe("docs/risks.md");
    expect(unsafeValueReason(String(parsed.provenance[0].document))).toBeNull();
    expect(Object.keys(parsed.provenance[0])).toEqual(["source", "document", "line", "rule"]);
  });

  it("can record truncation so a bounded read is not mistaken for complete", () => {
    const result = applicationResult({
      operation: "github.brief",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { kind: "github-issues", reference: "he8um/oh-my-pm" },
      data: null,
      provenance: [
        {
          source: { kind: "github-issues", reference: "he8um/oh-my-pm" },
          itemNumber: 42,
          truncated: true,
        },
      ],
    });
    const parsed = JSON.parse(applicationResultToJson(result)) as {
      provenance: Array<{ truncated?: boolean }>;
    };
    expect(parsed.provenance[0].truncated).toBe(true);
  });
});
