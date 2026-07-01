import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { baseResponse, makeError } from "../utils/formatting.js";

export async function diagnoseProject(focus?: string) {
  const root = getProjectRoot();

  const [roadmapMd, changelogMd, agentsMd] = await Promise.all([
    safeReadFile(root, "ROADMAP.md"),
    safeReadFile(root, "CHANGELOG.md"),
    safeReadFile(root, "AGENTS.md"),
  ]);

  if (agentsMd === null) {
    return makeError(
      "not_an_oh_my_pm_project",
      "AGENTS.md not found. This does not appear to be an Oh My PM project."
    );
  }

  const warnings: string[] = [];
  if (roadmapMd === null) warnings.push("ROADMAP.md not found — milestone data unavailable");
  if (changelogMd === null) warnings.push("CHANGELOG.md not found — change history unavailable");

  const milestones = extractMilestones(roadmapMd);
  const recentChanges = extractRecentChanges(changelogMd);

  const base = {
    ...baseResponse(warnings.length > 0 ? "partial" : "ok"),
    diagnosis: {
      rag_status: "amber" as const,
      rag_rationale: "Manual review required — diagnosis based on local docs only. Connect live data for full accuracy.",
      focus: focus ?? null,
      milestones,
      recent_changes: recentChanges,
      open_risks: [],
      note: "v0.7.0 alpha: diagnosis uses local repo files only. Connect a project tool for live issue and risk data.",
    },
  };

  return warnings.length > 0 ? { ...base, warnings } : base;
}

function extractMilestones(roadmap: string | null): string[] {
  if (!roadmap) return [];
  const lines = roadmap.split("\n");
  return lines
    .filter((l) => l.includes("|") && (l.includes("next") || l.includes("in progress") || l.includes("released")))
    .slice(0, 5)
    .map((l) => l.replace(/\|/g, "").trim());
}

function extractRecentChanges(changelog: string | null): string[] {
  if (!changelog) return [];
  const lines = changelog.split("\n");
  const changeLines: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## [")) {
      if (inSection) break;
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("- ")) {
      changeLines.push(line.slice(2).trim());
      if (changeLines.length >= 5) break;
    }
  }
  return changeLines;
}
