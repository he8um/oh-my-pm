import type { CliOutputMode } from "@oh-my-pm/contracts";
import type { CliCommand, CliParseResult } from "./types.js";

export const OMP_C_INVALID_COMMAND = "OMP-C-3001";
export const OMP_C_INVALID_OPTION = "OMP-C-3002";

const COMMANDS: readonly CliCommand[] = ["status", "doctor", "plan"];

const OUTPUT_OPTIONS: Readonly<Record<string, CliOutputMode>> = {
  "--json": "json",
  "--markdown": "markdown",
};

function isCliCommand(value: string): value is CliCommand {
  return (COMMANDS as readonly string[]).includes(value);
}

export function parseCliArgs(args: readonly string[]): CliParseResult {
  let command: CliCommand | null = null;
  let outputMode: CliOutputMode = "brief";
  const planTokens: string[] = [];

  for (const arg of args) {
    const optionMode = OUTPUT_OPTIONS[arg];
    if (optionMode !== undefined) {
      // The last output mode supplied wins; options may appear anywhere.
      outputMode = optionMode;
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported option: ${arg}` };
    }
    if (command === null) {
      if (!isCliCommand(arg)) {
        return { ok: false, code: OMP_C_INVALID_COMMAND, message: `unsupported command: ${arg}` };
      }
      command = arg;
      continue;
    }
    if (command === "plan") {
      planTokens.push(arg);
      continue;
    }
    return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported argument: ${arg}` };
  }

  if (command === null) {
    return { ok: false, code: OMP_C_INVALID_COMMAND, message: "missing command" };
  }

  if (command === "plan") {
    const input = planTokens.join(" ").trim();
    if (input === "") {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: "missing plan request" };
    }
    return { ok: true, command, outputMode, input };
  }

  return { ok: true, command, outputMode };
}
