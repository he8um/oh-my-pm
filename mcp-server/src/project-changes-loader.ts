import type { McpProjectChangesExecutor } from "./types.js";

export type OptionalProjectChangesLoaderOptions = {
  injectedExecutor?: McpProjectChangesExecutor;
  clock: () => string;
  dataRootOverride?: string;
};

function isOptionalMemoryAbsence(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
    String((error as { message?: unknown }).message).includes("@oh-my-pm/project-memory")
  );
}

export async function loadOptionalProjectChangesExecutor(
  options: OptionalProjectChangesLoaderOptions,
): Promise<McpProjectChangesExecutor | undefined> {
  if (options.injectedExecutor !== undefined) return options.injectedExecutor;
  try {
    const { createProjectChangesExecutor } = await import("./project-changes-runner.js");
    return createProjectChangesExecutor({
      clock: options.clock,
      ...(options.dataRootOverride !== undefined
        ? { dataRootOverride: options.dataRootOverride }
        : {}),
    });
  } catch (error) {
    if (isOptionalMemoryAbsence(error)) return undefined;
    throw error;
  }
}
