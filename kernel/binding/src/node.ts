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
