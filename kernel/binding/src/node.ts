// Node-loadable Kernel boundary backed by the generated WASM binding.
// The generated CommonJS glue is build output (see tools/build-kernel-wasm.mjs)
// and is loaded lazily so this module can be imported before a build.

import { createRequire } from "node:module";

import type {
  JsonValue,
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "./index.js";
import type {
  DeriveFreshnessInput,
  DeriveProjectTimelineInput,
  DiffProjectSnapshotsInput,
  FingerprintContentInput,
  ProjectBrainKernelApi,
  ProjectBrainKernelResult,
  ProjectIdentitySeedInput,
} from "./projectbrain.js";
import type { ChangeSet, EvidenceRecord, Freshness, ProjectIdentity, ProjectSnapshot, ProjectState, TimelineResult } from "@oh-my-pm/contracts";
import type { BindingMarkers } from "./status.js";
import { WASM_MODE } from "./status.js";

// Resolved relative to this file, which sits next to generated-node/ both in
// src/ (tests) and dist/ (builds).
const GENERATED_MODULE = "../generated-node/oh_my_pm_kernel.js";

const requireGenerated = createRequire(import.meta.url);

type WasmKernelModule = {
  kernelVersion(): string;
  validateJson(target: string, payloadJson: string): string;
  checkUpdatePlan(planJson: string): string;
  decideTransition(inputJson: string): string;
  // Project Brain binding exports (v0.3 Phase 3). Each returns a serialized
  // `{ ok, value }` / `{ ok: false, error }` envelope.
  deriveProjectIdentity(seedJson: string): string;
  fingerprintMinimizedContent(inputJson: string): string;
  deriveEvidenceId(recordJson: string): string;
  deriveFreshness(inputJson: string): string;
  finalizeProjectState(stateJson: string): string;
  finalizeProjectSnapshot(snapshotJson: string): string;
  diffProjectSnapshots(inputJson: string): string;
  // Project Timeline binding export (v0.4).
  deriveProjectTimeline(inputJson: string): string;
};

function loadWasmKernelModule(): WasmKernelModule | null {
  try {
    requireGenerated.resolve(GENERATED_MODULE);
  } catch {
    return null;
  }
  return requireGenerated(GENERATED_MODULE) as WasmKernelModule;
}

/** Whether the generated WASM binding exists and can be loaded. */
export function isNodeWasmKernelAvailable(): boolean {
  try {
    requireGenerated.resolve(GENERATED_MODULE);
    return true;
  } catch {
    return false;
  }
}

function parseWasmResult<T>(operation: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Kernel WASM binding returned corrupt JSON from ${operation}`);
  }
}

/**
 * Create a KernelApi backed by the real Rust Kernel compiled to WASM.
 * Throws when the generated binding has not been built.
 */
export function createNodeWasmKernelApi(): KernelApi {
  const wasm = loadWasmKernelModule();
  if (wasm === null) {
    throw new Error(
      "Kernel WASM binding is not built. Run pnpm --filter @oh-my-pm/kernel build.",
    );
  }

  const api: KernelApi & BindingMarkers = {
    version(): string {
      return wasm.kernelVersion();
    },
    validateJson(target: ValidationTarget, payload: JsonValue): ValidationReport {
      return parseWasmResult(
        "validateJson",
        wasm.validateJson(target, JSON.stringify(payload)),
      );
    },
    checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision {
      return parseWasmResult("checkUpdatePlan", wasm.checkUpdatePlan(JSON.stringify(plan)));
    },
    decideTransition(input: StateTransitionInput): StateTransitionDecision {
      return parseWasmResult("decideTransition", wasm.decideTransition(JSON.stringify(input)));
    },
  };
  api[WASM_MODE] = true;
  return api;
}

/**
 * Create a ProjectBrainKernelApi backed by the real Rust Kernel compiled to
 * WASM. Each method serializes its typed input to JSON, invokes the pure Phase 1
 * function through the WASM boundary, and parses the deterministic result
 * envelope. Throws only when the generated binding has not been built.
 */
export function createNodeWasmProjectBrainKernelApi(): ProjectBrainKernelApi {
  const wasm = loadWasmKernelModule();
  if (wasm === null) {
    throw new Error(
      "Kernel WASM binding is not built. Run pnpm --filter @oh-my-pm/kernel build.",
    );
  }
  const call = <T>(operation: string, raw: string): ProjectBrainKernelResult<T> =>
    parseWasmResult<ProjectBrainKernelResult<T>>(operation, raw);
  return {
    deriveProjectIdentity(seed: ProjectIdentitySeedInput): ProjectBrainKernelResult<ProjectIdentity> {
      return call("deriveProjectIdentity", wasm.deriveProjectIdentity(JSON.stringify(seed)));
    },
    fingerprintMinimizedContent(
      input: FingerprintContentInput,
    ): ProjectBrainKernelResult<string> {
      return call(
        "fingerprintMinimizedContent",
        wasm.fingerprintMinimizedContent(JSON.stringify(input)),
      );
    },
    deriveEvidenceId(record: EvidenceRecord): ProjectBrainKernelResult<string> {
      return call("deriveEvidenceId", wasm.deriveEvidenceId(JSON.stringify(record)));
    },
    deriveFreshness(input: DeriveFreshnessInput): ProjectBrainKernelResult<Freshness> {
      return call("deriveFreshness", wasm.deriveFreshness(JSON.stringify(input)));
    },
    finalizeProjectState(state: ProjectState): ProjectBrainKernelResult<ProjectState> {
      return call("finalizeProjectState", wasm.finalizeProjectState(JSON.stringify(state)));
    },
    finalizeProjectSnapshot(
      snapshot: ProjectSnapshot,
    ): ProjectBrainKernelResult<ProjectSnapshot> {
      return call(
        "finalizeProjectSnapshot",
        wasm.finalizeProjectSnapshot(JSON.stringify(snapshot)),
      );
    },
    diffProjectSnapshots(input: DiffProjectSnapshotsInput): ProjectBrainKernelResult<ChangeSet> {
      return call("diffProjectSnapshots", wasm.diffProjectSnapshots(JSON.stringify(input)));
    },
    deriveProjectTimeline(
      input: DeriveProjectTimelineInput,
    ): ProjectBrainKernelResult<TimelineResult> {
      return call("deriveProjectTimeline", wasm.deriveProjectTimeline(JSON.stringify(input)));
    },
  };
}
