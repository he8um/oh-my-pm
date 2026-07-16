import type { CliOutputMode, RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { Runtime } from "@oh-my-pm/runtime";

export type CliCommand =
  | "status"
  | "doctor"
  | "plan"
  | "brief"
  | "install-preview";

/** Commands dispatched to the Runtime; only install-preview runs locally. */
export type RuntimeCliCommand = Exclude<CliCommand, "install-preview">;

export type CliParseResult =
  | {
      ok: true;
      command: CliCommand;
      outputMode: CliOutputMode;
      input?: string;
    }
  | {
      ok: false;
      code: "OMP-C-3001" | "OMP-C-3002";
      message: string;
    };

export type CliExecutionResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  response?: RuntimeResponse;
};

export type CliDeps = {
  runtime: Runtime;
};

export type RuntimeRequestFactory = (
  command: RuntimeCliCommand,
  input?: string,
) => RuntimeRequest;
