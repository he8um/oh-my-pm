import type { CliOutputMode, RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { Runtime } from "@oh-my-pm/runtime";

export type CliCommand =
  | "status"
  | "doctor"
  | "plan"
  | "brief"
  | "risks"
  | "next"
  | "handoff"
  | "install-preview"
  | "github";

/** Commands dispatched to the Runtime; only install-preview runs locally. */
export type RuntimeCliCommand = Exclude<CliCommand, "install-preview" | "github">;

/** GitHub-backed workflow operations. */
export type GitHubCliOperation = "brief" | "risks" | "next" | "handoff";

export type CliParseResult =
  | {
      ok: true;
      command: Exclude<CliCommand, "github">;
      outputMode: CliOutputMode;
      input?: string;
    }
  | {
      ok: true;
      command: "github";
      operation: GitHubCliOperation;
      repository: string;
      limit: number;
      outputMode: CliOutputMode;
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
