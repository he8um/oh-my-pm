import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { baseResponse, makeError } from "../utils/formatting.js";
import { MAX_HANDOFF_WORDS } from "../policy/token-limits.js";

export async function prepareAgentHandoff(context?: string) {
  const root = getProjectRoot();

  const [agentsMd, version, roadmapMd] = await Promise.all([
    safeReadFile(root, "AGENTS.md"),
    safeReadFile(root, "VERSION"),
    safeReadFile(root, "ROADMAP.md"),
  ]);

  if (agentsMd === null) {
    return makeError(
      "not_an_oh_my_pm_project",
      "AGENTS.md not found. Cannot generate handoff without project identity."
    );
  }

  const versionStr = version?.trim() ?? "unknown";
  const nextVersion = extractNextVersion(roadmapMd);

  const handoffLines = [
    `You are the Oh My PM Head of Delivery agent for this project (${versionStr}).`,
    `Behavioral policy: AGENTS.md is the sole source of truth.`,
    nextVersion ? `Next milestone: ${nextVersion}` : null,
    context ? `Current session context: ${context}` : null,
    `Role: Continue delivery leadership. Apply Oh My PM playbooks and templates.`,
    `Token discipline: structured output only — tables, bullets, headings.`,
    `Bilingual: match output language to the user or project. Technical identifiers stay in English.`,
  ].filter(Boolean);

  const handoff = handoffLines.join(" ");
  const wordCount = handoff.split(/\s+/).length;

  return {
    ...baseResponse("ok"),
    handoff: {
      prompt: handoff,
      word_count: wordCount,
      within_limit: wordCount <= MAX_HANDOFF_WORDS,
      limit: MAX_HANDOFF_WORDS,
    },
  };
}

function extractNextVersion(roadmap: string | null): string | null {
  if (!roadmap) return null;
  const match = roadmap.match(/\*\*(v[\d.]+)\*\*[^|]*—[^|]*next/i);
  return match ? match[1] : null;
}
