import type { CliOutputMode, RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { Runtime } from "@oh-my-pm/runtime";

export type CliCommand = "status" | "doctor" | "plan";

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

export type RuntimeRequestFactory = (command: CliCommand, input?: string) => RuntimeRequest;
