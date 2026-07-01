import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { baseResponse, makeError } from "../utils/formatting.js";

export async function inspectProjectContext() {
  const root = getProjectRoot();

  const [agentsMd, version, readmeMd] = await Promise.all([
    safeReadFile(root, "AGENTS.md"),
    safeReadFile(root, "VERSION"),
    safeReadFile(root, "README.md"),
  ]);

  if (agentsMd === null && version === null) {
    return makeError(
      "project_root_unreadable",
      "AGENTS.md and VERSION not found. Check OH_MY_PM_PROJECT_ROOT."
    );
  }

  const warnings: string[] = [];
  if (agentsMd === null) warnings.push("AGENTS.md not found");
  if (version === null) warnings.push("VERSION not found");
  if (readmeMd === null) warnings.push("README.md not found");

  const versionStr = version?.trim() ?? "unknown";
  const projectName = extractProjectName(readmeMd);

  const base = {
    ...baseResponse(warnings.length > 0 ? "partial" : "ok"),
    project: {
      name: projectName,
      version: versionStr,
      has_agents_md: agentsMd !== null,
      project_root: root,
    },
  };

  return warnings.length > 0 ? { ...base, warnings } : base;
}

function extractProjectName(readme: string | null): string {
  if (!readme) return "unknown";
  const match = readme.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "unknown";
}
