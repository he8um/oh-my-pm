// v0.3 Phase 5 — the read-only runner for the `project_changes` MCP tool.
//
// It validates input defensively, resolves the STANDARD application-data root
// (the same one the Project Memory adapter uses — the agent supplies no path),
// constructs the existing Node Project Memory adapter, runs the existing Phase 3
// Project Brain compare (Phase 4.1 capture chronology), and projects the result
// to the bounded strict public shape. It performs NO write, lock, migration,
// export, delete, provider call, project-file read, token read, or network
// request. Inert observation/deriver ports fail closed if the compare path ever
// tried to use them (it never does for compare).

import type { ChangeSet } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createProjectBrainRuntime, PROJECT_BRAIN_RUNTIME_ERROR_CODES } from "@oh-my-pm/runtime";
import type {
  CompareProjectResult,
  ProjectBrainKernelPort,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectStateDeriver,
} from "@oh-my-pm/runtime";
import {
  DEFAULT_CHANGES_LIMIT,
  DEFAULT_STALE_AFTER_SECONDS,
  MAX_CHANGES_LIMIT,
  MAX_PROJECT_ID_BYTES,
  MAX_SNAPSHOT_ID_BYTES,
  MAX_STALE_AFTER_SECONDS,
  MIN_CHANGES_LIMIT,
  MIN_STALE_AFTER_SECONDS,
  noHistoryResult,
  projectComparedResult,
  safeRequiredId,
} from "./project-changes-projector.js";
import type {
  McpProjectChangesExecution,
  McpProjectChangesFailureCode,
  McpProjectChangesInput,
} from "./project-changes-types.js";

/** A safe future-skew default used by compare staleness (one day, seconds). */
const MAX_FUTURE_SKEW_SECONDS = 86_400;

/**
 * The read-only store surface the runner needs. Structurally a subset of the
 * Phase 2/4.1 `ProjectMemoryStore`: the compare reads plus `inspect` (used to
 * classify the store version state without throwing).
 */
export type ProjectChangesStore = ProjectMemoryPort & {
  inspect(projectId: string): Promise<{
    exists: boolean;
    versionState:
      | "noPriorMemory"
      | "supported"
      | "unsupportedNewer"
      | "migrationRequired"
      | "incompatibleSchema";
  }>;
};

/** Options for the runner (production leaves these unset; tests inject them). */
export type ProjectChangesRunnerOptions = {
  /**
   * Injected read-only store factory (tests). When set it takes precedence and
   * no dynamic import of the Node adapter happens. Production leaves this unset
   * so the Node adapter loads lazily on this path only.
   */
  readonly storeFactory?: () => ProjectChangesStore | Promise<ProjectChangesStore>;
  /** Injected Kernel port (tests). Production uses the WASM binding. */
  readonly kernel?: ProjectBrainKernelPort;
  /**
   * Caller clock, read exactly once per invocation (never while listing tools).
   * Tests inject a fixed RFC3339 value; the process boundary supplies the real
   * clock. Defaults to a fixed sentinel so no clock is read here by default.
   */
  readonly clock?: () => string;
  /** Unique planted secret sentinels the projector must scrub (tests only). */
  readonly secretSentinels?: readonly string[];
};

/** Inert observation port: compare never observes; fail closed if it ever did. */
const INERT_OBSERVATION: ProjectObservationPort = {
  async observe() {
    throw new Error("project_changes is read-only and performs no observation");
  },
};

/** Inert deriver: compare never derives; fail closed if it ever did. */
const INERT_DERIVER: ProjectStateDeriver = {
  derive() {
    throw new Error("project_changes is read-only and performs no derivation");
  },
};

const DEFAULT_CLOCK_SENTINEL = "2026-01-01T00:00:00.000Z";

function fail(code: McpProjectChangesFailureCode, message: string): McpProjectChangesExecution {
  return { ok: false, code, message };
}

/** Validate the strict input defensively and normalize the optional fields. */
function validateInput(input: McpProjectChangesInput):
  | {
      ok: true;
      projectId: string;
      previousSnapshotId?: string;
      currentSnapshotId?: string;
      staleAfterSeconds: number;
      limit: number;
    }
  | { ok: false; message: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, message: "input must be an object" };
  }
  const projectId = validateProjectId(input.projectId);
  if (projectId === null) return { ok: false, message: "projectId is missing or invalid" };

  const hasPrev = input.previousSnapshotId !== undefined;
  const hasCurr = input.currentSnapshotId !== undefined;
  if (hasPrev !== hasCurr) {
    return {
      ok: false,
      message: "previousSnapshotId and currentSnapshotId must be supplied together",
    };
  }
  let previousSnapshotId: string | undefined;
  let currentSnapshotId: string | undefined;
  if (hasPrev && hasCurr) {
    const prev = safeRequiredId(input.previousSnapshotId, MAX_SNAPSHOT_ID_BYTES);
    const curr = safeRequiredId(input.currentSnapshotId, MAX_SNAPSHOT_ID_BYTES);
    if (prev === null || curr === null) {
      return { ok: false, message: "an explicit snapshot id is invalid" };
    }
    if (prev === curr) {
      return { ok: false, message: "previousSnapshotId and currentSnapshotId must differ" };
    }
    previousSnapshotId = prev;
    currentSnapshotId = curr;
  }

  const staleAfterSeconds = validateBoundedInt(
    input.staleAfterSeconds,
    DEFAULT_STALE_AFTER_SECONDS,
    MIN_STALE_AFTER_SECONDS,
    MAX_STALE_AFTER_SECONDS,
  );
  if (staleAfterSeconds === null)
    return { ok: false, message: "staleAfterSeconds is out of range" };
  const limit = validateBoundedInt(
    input.limit,
    DEFAULT_CHANGES_LIMIT,
    MIN_CHANGES_LIMIT,
    MAX_CHANGES_LIMIT,
  );
  if (limit === null) return { ok: false, message: "limit is out of range" };

  return {
    ok: true,
    projectId,
    ...(previousSnapshotId !== undefined ? { previousSnapshotId } : {}),
    ...(currentSnapshotId !== undefined ? { currentSnapshotId } : {}),
    staleAfterSeconds,
    limit,
  };
}

/** A strict project-id validator, self-contained (no I/O, no CLI coupling). */
function validateProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "." || trimmed === "..") return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  // Absolute-path-like values are rejected outright.
  if (/^[A-Za-z]:/.test(trimmed)) return null;
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  if (byteLength(trimmed) > MAX_PROJECT_ID_BYTES) return null;
  return trimmed;
}

function byteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** A bounded integer with a default; returns null when out of range/non-integer. */
function validateBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Map a compare failure code / store version state to a public failure code. */
function mapCompareFailure(code: string): McpProjectChangesFailureCode {
  switch (code) {
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.storedRecordReadFailed:
      return "project_changes_read_failed";
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.kernelFailed:
      return "project_changes_kernel_unavailable";
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput:
      return "project_changes_invalid_input";
    default:
      return "project_changes_compare_failed";
  }
}

/**
 * Run one read-only `project_changes` request. Returns a sanitized execution;
 * never throws an uncontrolled error to the caller.
 */
export async function runProjectChanges(
  input: McpProjectChangesInput,
  options?: ProjectChangesRunnerOptions,
): Promise<McpProjectChangesExecution> {
  try {
    const validated = validateInput(input);
    if (!validated.ok) {
      return fail("project_changes_invalid_input", validated.message);
    }
    const now = (options?.clock ?? (() => DEFAULT_CLOCK_SENTINEL))();

    // Construct the read-only store. Production lazily imports the Node adapter;
    // tests inject a store factory. A failure to load the capability is a
    // controlled memory-unavailable error, never a leaked cause.
    let store: ProjectChangesStore;
    try {
      store = options?.storeFactory ? await options.storeFactory() : await loadDefaultStore();
    } catch {
      return fail("project_changes_memory_unavailable", "project memory capability is unavailable");
    }

    // Classify the store version state first so migration/version conditions map
    // to precise public codes. inspect() never migrates, writes, or throws for a
    // present store.
    let inspection: Awaited<ReturnType<ProjectChangesStore["inspect"]>>;
    try {
      inspection = await store.inspect(validated.projectId);
    } catch {
      return fail("project_changes_read_failed", "reading local memory failed");
    }
    if (inspection.exists) {
      switch (inspection.versionState) {
        case "migrationRequired":
          return fail(
            "project_changes_migration_required",
            "the local memory store requires an explicit CLI migration (memory capture --migrate-store)",
          );
        case "unsupportedNewer":
          return fail(
            "project_changes_unsupported_store",
            "the local memory store is newer than this build supports; upgrade OH MY PM",
          );
        case "incompatibleSchema":
          return fail(
            "project_changes_incompatible_schema",
            "the local memory store uses an incompatible Project Brain schema",
          );
        default:
          break;
      }
    }

    const kernel = options?.kernel ?? createNodeWasmProjectBrainKernelApi();
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: store,
      observation: INERT_OBSERVATION,
      deriver: INERT_DERIVER,
    });

    let compare: CompareProjectResult;
    try {
      compare = await runtime.compare({
        requestId: "mcp-project-changes",
        projectId: validated.projectId,
        comparedAt: now,
        ...(validated.previousSnapshotId !== undefined
          ? { previousSnapshotId: validated.previousSnapshotId }
          : {}),
        ...(validated.currentSnapshotId !== undefined
          ? { currentSnapshotId: validated.currentSnapshotId }
          : {}),
        stalenessPolicy: {
          evidenceStaleAfterSeconds: validated.staleAfterSeconds,
          maxFutureSkewSeconds: MAX_FUTURE_SKEW_SECONDS,
        },
      });
    } catch {
      return fail("project_changes_compare_failed", "comparing local snapshots failed");
    }

    const sentinels = options?.secretSentinels ?? [];

    if (compare.status === "noPriorMemory") {
      return { ok: true, result: noHistoryResult("noPriorMemory", validated.projectId) };
    }
    if (compare.status === "insufficientHistory") {
      return { ok: true, result: noHistoryResult("insufficientHistory", validated.projectId) };
    }
    if (compare.status === "failed") {
      const code = compare.error?.code ?? PROJECT_BRAIN_RUNTIME_ERROR_CODES.compareFailed;
      // A store read failure surfaced by compare may be corruption; keep the
      // public code stable and the message sanitized.
      return fail(mapCompareFailure(code), "comparing local snapshots failed");
    }

    // status === "compared"
    const changeSet = compare.changeSet as ChangeSet | undefined;
    const previousSnapshotId = compare.previousSnapshotId;
    const currentSnapshotId = compare.currentSnapshotId;
    if (
      changeSet === undefined ||
      previousSnapshotId === undefined ||
      currentSnapshotId === undefined
    ) {
      return fail("project_changes_compare_failed", "comparing local snapshots failed");
    }
    const result = projectComparedResult(
      changeSet,
      validated.projectId,
      previousSnapshotId,
      currentSnapshotId,
      validated.limit,
      sentinels,
    );
    return { ok: true, result };
  } catch {
    // Unexpected programmer error: one generic, sanitized failure.
    return fail("project_changes_compare_failed", "comparing local snapshots failed");
  }
}

/**
 * Lazily load the Node Project Memory adapter and adapt it to the read-only
 * store surface. The adapter resolves the STANDARD application-data root
 * internally (the agent supplies no path). Dynamic import keeps @oh-my-pm/
 * project-memory off the static MCP startup path so the legacy v0.2 bundle,
 * which excludes the package, still starts with the existing ten tools.
 */
async function loadDefaultStore(): Promise<ProjectChangesStore> {
  const memory = await import("@oh-my-pm/project-memory");
  const store = memory.createNodeProjectMemoryStore();
  return store as unknown as ProjectChangesStore;
}
