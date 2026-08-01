// v0.4 — the read-only runner for the `project_timeline` MCP tool.
//
// It validates input defensively, resolves the STANDARD application-data root
// (the same one the Project Memory adapter uses — the agent supplies no path),
// constructs the existing Node Project Memory adapter, runs the read-only
// Runtime timeline query, and projects the result to the bounded strict public
// shape. It performs NO write, lock, migration, export, delete, provider call,
// project-file read, token read, or network request. Inert observation/deriver
// ports fail closed if the path ever tried to use them (it never does).

import type { TimelineResult } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createProjectBrainRuntime, PROJECT_BRAIN_RUNTIME_ERROR_CODES } from "@oh-my-pm/runtime";
import type {
  ProjectBrainKernelPort,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectStateDeriver,
  TimelineProjectResult,
} from "@oh-my-pm/runtime";
import { DEFAULT_STALE_AFTER_SECONDS } from "./project-changes-projector.js";
import type { McpChangeCategory, McpChangeItemKind } from "./project-changes-types.js";
import {
  DEFAULT_TIMELINE_LIMIT,
  emptyTimelineResult,
  MAX_BEFORE_SEQUENCE,
  MAX_TIMELINE_LIMIT,
  MIN_TIMELINE_LIMIT,
  projectTimelineResult,
  safeProjectId,
} from "./project-timeline-projector.js";
import type {
  McpProjectTimelineExecution,
  McpProjectTimelineFailureCode,
  McpProjectTimelineInput,
} from "./project-timeline-types.js";

/** A safe future-skew default used by the adjacent diffs (one day, seconds). */
const MAX_FUTURE_SKEW_SECONDS = 86_400;

/** The exact accepted category and kind taxonomies (the existing ones). */
const VALID_CATEGORIES: readonly string[] = [
  "added",
  "removed",
  "modified",
  "resolved",
  "reopened",
  "becameOverdue",
  "noLongerOverdue",
  "severityIncreased",
  "severityDecreased",
  "fresh",
  "stale",
  "evidenceChanged",
];
const VALID_KINDS: readonly string[] = [
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
];

/**
 * The read-only store surface the runner needs: the Runtime memory port reads
 * plus `inspect` (used to classify the store version state without throwing).
 */
export type ProjectTimelineStore = ProjectMemoryPort & {
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
export type ProjectTimelineRunnerOptions = {
  /**
   * Injected read-only store factory (tests). When set it takes precedence and
   * no dynamic import of the Node adapter happens. Production leaves this unset
   * so the Node adapter loads lazily on this path only.
   */
  readonly storeFactory?: () => ProjectTimelineStore | Promise<ProjectTimelineStore>;
  /** Injected Kernel port (tests). Production uses the WASM binding. */
  readonly kernel?: ProjectBrainKernelPort;
  /**
   * Caller clock, read exactly once per invocation (never while listing tools).
   * Defaults to a fixed sentinel so no clock is read here by default.
   */
  readonly clock?: () => string;
  /** Unique planted secret sentinels the projector must scrub (tests only). */
  readonly secretSentinels?: readonly string[];
};

/** Inert observation port: the timeline never observes; fail closed if it did. */
const INERT_OBSERVATION: ProjectObservationPort = {
  async observe() {
    throw new Error("project_timeline is read-only and performs no observation");
  },
};

/** Inert deriver: the timeline never derives state; fail closed if it did. */
const INERT_DERIVER: ProjectStateDeriver = {
  derive() {
    throw new Error("project_timeline is read-only and performs no derivation");
  },
};

const DEFAULT_CLOCK_SENTINEL = "2026-01-01T00:00:00.000Z";

function fail(code: McpProjectTimelineFailureCode, message: string): McpProjectTimelineExecution {
  return { ok: false, code, message };
}

/** A bounded integer with a default; null when out of range or non-integer. */
function validateBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Validate the strict input defensively and normalize the optional fields. */
function validateInput(input: McpProjectTimelineInput):
  | {
      ok: true;
      projectId: string;
      limit: number;
      beforeSequence?: number;
      category?: McpChangeCategory;
      kind?: McpChangeItemKind;
    }
  | { ok: false; message: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, message: "input must be an object" };
  }
  const projectId = validateProjectId(input.projectId);
  if (projectId === null) return { ok: false, message: "projectId is missing or invalid" };

  const limit = validateBoundedInt(
    input.limit,
    DEFAULT_TIMELINE_LIMIT,
    MIN_TIMELINE_LIMIT,
    MAX_TIMELINE_LIMIT,
  );
  if (limit === null) return { ok: false, message: "limit is out of range" };

  let beforeSequence: number | undefined;
  if (input.beforeSequence !== undefined) {
    const validated = validateBoundedInt(input.beforeSequence, 0, 0, MAX_BEFORE_SEQUENCE);
    if (validated === null) return { ok: false, message: "beforeSequence is out of range" };
    beforeSequence = validated;
  }

  let category: McpChangeCategory | undefined;
  if (input.category !== undefined) {
    if (typeof input.category !== "string" || !VALID_CATEGORIES.includes(input.category)) {
      return { ok: false, message: "category is not a known change category" };
    }
    category = input.category;
  }

  let kind: McpChangeItemKind | undefined;
  if (input.kind !== undefined) {
    if (typeof input.kind !== "string" || !VALID_KINDS.includes(input.kind)) {
      return { ok: false, message: "kind is not a known item kind" };
    }
    kind = input.kind;
  }

  return {
    ok: true,
    projectId,
    limit,
    ...(beforeSequence !== undefined ? { beforeSequence } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(kind !== undefined ? { kind } : {}),
  };
}

/** A strict project-id validator, self-contained (no I/O, no CLI coupling). */
function validateProjectId(value: unknown): string | null {
  const safe = safeProjectId(value);
  if (safe === null) return null;
  const trimmed = safe.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "." || trimmed === "..") return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  // Absolute-path-like values are rejected outright.
  if (/^[A-Za-z]:/.test(trimmed)) return null;
  return trimmed;
}

/** Map a Runtime timeline failure code to a public failure code. */
function mapTimelineFailure(code: string): McpProjectTimelineFailureCode {
  switch (code) {
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.storedRecordReadFailed:
      return "project_timeline_read_failed";
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.kernelFailed:
      return "project_timeline_kernel_unavailable";
    case PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput:
      return "project_timeline_invalid_input";
    default:
      return "project_timeline_derive_failed";
  }
}

/**
 * Run one read-only `project_timeline` request. Returns a sanitized execution;
 * never throws an uncontrolled error to the caller and never emits a partial
 * timeline.
 */
export async function runProjectTimeline(
  input: McpProjectTimelineInput,
  options?: ProjectTimelineRunnerOptions,
): Promise<McpProjectTimelineExecution> {
  try {
    const validated = validateInput(input);
    if (!validated.ok) {
      return fail("project_timeline_invalid_input", validated.message);
    }
    const now = (options?.clock ?? (() => DEFAULT_CLOCK_SENTINEL))();

    // Construct the read-only store. Production lazily imports the Node adapter;
    // tests inject a store factory. A failure to load the capability is a
    // controlled memory-unavailable error, never a leaked cause.
    let store: ProjectTimelineStore;
    try {
      store = options?.storeFactory ? await options.storeFactory() : await loadDefaultStore();
    } catch {
      return fail(
        "project_timeline_memory_unavailable",
        "project memory capability is unavailable",
      );
    }

    // Classify the store version state first so migration/version conditions map
    // to precise public codes. inspect() never migrates or writes.
    let inspection: Awaited<ReturnType<ProjectTimelineStore["inspect"]>>;
    try {
      inspection = await store.inspect(validated.projectId);
    } catch {
      return fail("project_timeline_read_failed", "reading local memory failed");
    }
    if (inspection.exists) {
      switch (inspection.versionState) {
        case "migrationRequired":
          return fail(
            "project_timeline_migration_required",
            "the local memory store requires an explicit CLI migration (memory capture --migrate-store)",
          );
        case "unsupportedNewer":
          return fail(
            "project_timeline_unsupported_store",
            "the local memory store is newer than this build supports; upgrade OH MY PM",
          );
        case "incompatibleSchema":
          return fail(
            "project_timeline_incompatible_schema",
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

    let derived: TimelineProjectResult;
    try {
      derived = await runtime.timeline({
        requestId: "mcp-project-timeline",
        projectId: validated.projectId,
        comparedAt: now,
        limit: validated.limit,
        ...(validated.beforeSequence !== undefined
          ? { beforeSequence: validated.beforeSequence }
          : {}),
        ...(validated.category !== undefined ? { category: validated.category } : {}),
        ...(validated.kind !== undefined ? { kind: validated.kind } : {}),
        stalenessPolicy: {
          evidenceStaleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
          maxFutureSkewSeconds: MAX_FUTURE_SKEW_SECONDS,
        },
      });
    } catch {
      return fail("project_timeline_derive_failed", "deriving the local timeline failed");
    }

    const sentinels = options?.secretSentinels ?? [];

    if (derived.status === "failed") {
      const code = derived.error?.code ?? PROJECT_BRAIN_RUNTIME_ERROR_CODES.timelineFailed;
      return fail(mapTimelineFailure(code), "deriving the local timeline failed");
    }
    if (derived.status === "noPriorMemory") {
      return { ok: true, result: emptyTimelineResult(validated.projectId) };
    }

    const timeline: TimelineResult | undefined = derived.result;
    if (timeline === undefined) {
      return fail("project_timeline_derive_failed", "deriving the local timeline failed");
    }
    return {
      ok: true,
      result: projectTimelineResult(timeline, validated.projectId, validated.limit, sentinels),
    };
  } catch {
    // Unexpected programmer error: one generic, sanitized failure.
    return fail("project_timeline_derive_failed", "deriving the local timeline failed");
  }
}

/**
 * Lazily load the Node Project Memory adapter and adapt it to the read-only
 * store surface. The adapter resolves the STANDARD application-data root
 * internally (the agent supplies no path). Dynamic import keeps the persistence
 * package off the static MCP startup path.
 */
async function loadDefaultStore(): Promise<ProjectTimelineStore> {
  const memory = await import("@oh-my-pm/project-memory");
  const store = memory.createNodeProjectMemoryStore();
  return store as unknown as ProjectTimelineStore;
}
