import type { CliOutputMode, RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type {
  GitHubSearchKind,
  GitHubSourceMode,
  GitHubSourceSelection,
  GitHubSourceState,
} from "@oh-my-pm/providers";
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
  | "github"
  | "providers";

/** Commands dispatched to the Runtime; local/github/providers run separately. */
export type RuntimeCliCommand = Exclude<
  CliCommand,
  "install-preview" | "github" | "providers"
>;

/** GitHub-backed workflow operations. */
export type GitHubCliOperation = "brief" | "risks" | "next" | "handoff";

/** Provider inspection subcommands. */
export type ProvidersSubcommand = "status" | "doctor";

export type CliParseResult =
  | {
      ok: true;
      command: Exclude<CliCommand, "github" | "providers">;
      outputMode: CliOutputMode;
      input?: string;
    }
  | {
      ok: true;
      command: "github";
      operation: GitHubCliOperation;
      // Repository, limit, and source options are optional at parse time:
      // provider configuration may supply defaults. Presence records whether the
      // value was explicit so config never overrides an explicit choice.
      repository?: string;
      source?: GitHubSourceMode;
      state?: GitHubSourceState;
      number?: number;
      query?: string;
      kind?: GitHubSearchKind;
      limit?: number;
      includeComments?: boolean;
      commentLimit?: number;
      providerConfigPath?: string;
      outputMode: CliOutputMode;
    }
  | {
      ok: true;
      command: "providers";
      subcommand: "status";
      providerConfigPath?: string;
      outputMode: CliOutputMode;
    }
  | {
      ok: true;
      command: "providers";
      subcommand: "doctor";
      provider?: "github";
      repository?: string;
      providerConfigPath?: string;
      confirmNetwork: boolean;
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
  /**
   * Resolved GitHub repository/limit for the github command. The process layer
   * resolves these from explicit CLI values and provider configuration before
   * constructing the runtime, so runCli never resolves configuration itself.
   */
  github?: {
    repository: string;
    selection: GitHubSourceSelection;
  };
};

export type RuntimeRequestFactory = (
  command: RuntimeCliCommand,
  input?: string,
) => RuntimeRequest;
