import type { RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";

export type RuntimeDeps = {
  kernel: KernelApi;
  version: string;
};

export type Runtime = {
  handle(request: RuntimeRequest): RuntimeResponse;
};

export type RuntimeFailureInput = {
  requestId: string;
  code: string;
  message: string;
  trace: NonNullable<RuntimeResponse["trace"]>;
  warnings?: RuntimeResponse["warnings"];
  data?: RuntimeResponse["data"];
};
