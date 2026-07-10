import type {
  ExecutionTraceEntry,
  JsonValue,
  RuntimeRequest,
  RuntimeResponse,
  ValidationReport,
} from "@oh-my-pm/contracts";
import {
  OMP_R_HANDLER_FAILED,
  OMP_R_UNSUPPORTED_REQUEST_KIND,
  OMP_R_VALIDATION_FAILED,
  failureResponse,
} from "./errors.js";
import type { Runtime, RuntimeDeps } from "./types.js";

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function validationErrorCount(report: ValidationReport): number {
  return report.errors.length;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  return {
    handle(request: RuntimeRequest): RuntimeResponse {
      const trace: ExecutionTraceEntry[] = [
        { step: "runtime.receive", status: "ok", message: request.kind },
      ];

      try {
        const validation = deps.kernel.validateJson(
          "systemRequest",
          request as unknown as JsonValue,
        );

        if (!validation.passed) {
          trace.push({
            step: "kernel.validate.systemRequest",
            status: "fail",
            message: `${validationErrorCount(validation)} error(s)`,
          });

          return failureResponse({
            requestId: request.id,
            code: OMP_R_VALIDATION_FAILED,
            message: "request failed kernel validation",
            trace,
            data: {
              code: OMP_R_VALIDATION_FAILED,
              message: "request failed kernel validation",
              validation: toJsonValue(validation),
            },
          });
        }

        trace.push({ step: "kernel.validate.systemRequest", status: "ok" });

        if (request.kind === "status") {
          trace.push({ step: "runtime.status", status: "ok" });
          return {
            id: request.id,
            ok: true,
            data: {
              version: deps.version,
              kernelVersion: deps.kernel.version(),
              healthy: true,
            },
            trace,
          };
        }

        if (request.kind === "doctor") {
          trace.push({ step: "runtime.doctor", status: "ok" });
          return {
            id: request.id,
            ok: true,
            data: {
              checks: [
                {
                  id: "kernel.validation",
                  status: "ok",
                  message: "Kernel validation is available",
                },
              ],
            },
            trace,
          };
        }

        trace.push({
          step: "runtime.dispatch",
          status: "fail",
          message: "unsupported_request_kind",
        });

        return failureResponse({
          requestId: request.id,
          code: OMP_R_UNSUPPORTED_REQUEST_KIND,
          message: `request kind is not implemented in the runtime foundation: ${request.kind}`,
          trace,
        });
      } catch {
        trace.push({
          step: "runtime.handle",
          status: "fail",
          message: "handler_exception",
        });

        return failureResponse({
          requestId: request.id,
          code: OMP_R_HANDLER_FAILED,
          message: "runtime handler failed",
          trace,
        });
      }
    },
  };
}
