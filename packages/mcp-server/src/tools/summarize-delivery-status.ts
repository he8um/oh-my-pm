import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { baseResponse, makeError } from "../utils/formatting.js";

export async function summarizeDeliveryStatus() {
  const root = getProjectRoot();

  const [version, roadmapMd, changelogMd] = await Promise.all([
    safeReadFile(root, "VERSION"),
    safeReadFile(root, "ROADMAP.md"),
    safeReadFile(root, "CHANGELOG.md"),
  ]);

  if (version === null && roadmapMd === null) {
    return makeError(
      "insufficient_context",
      "VERSION and ROADMAP.md both missing. Cannot summarize delivery status."
    );
  }

  const warnings: string[] = [];
  if (roadmapMd === null) warnings.push("ROADMAP.md not found — milestone data unavailable");
  if (changelogMd === null) warnings.push("CHANGELOG.md not found — recent changes unavailable");

  const currentVersion = version?.trim() ?? "unknown";
  const releasedVersions = extractReleasedVersions(roadmapMd);
  const nextMilestone = extractNextMilestone(roadmapMd);
  const recentRelease = extractRecentRelease(changelogMd);

  const base = {
    ...baseResponse(warnings.length > 0 ? "partial" : "ok"),
    delivery_status: {
      current_version: currentVersion,
      released_milestones: releasedVersions,
      next_milestone: nextMilestone,
      recent_release: recentRelease,
      open_decisions: [],
      note: "v0.7.0 alpha: status from local files only. Connect a project tool for live task and risk data.",
    },
  };

  return warnings.length > 0 ? { ...base, warnings } : base;
}

function extractReleasedVersions(roadmap: string | null): string[] {
  if (!roadmap) return [];
  const re = /\*\*(v[\d.]+(?:-[\w.]+)?)\*\*[^|\n]*released/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(roadmap)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function extractNextMilestone(roadmap: string | null): string | null {
  if (!roadmap) return null;
  const match = roadmap.match(/\*\*(v[\d.]+)\*\*[^|\n]*—[^|\n]*next/i);
  return match ? match[1] : null;
}

function extractRecentRelease(changelog: string | null): string | null {
  if (!changelog) return null;
  const match = changelog.match(/^## \[(v[\d.]+(?:-[\w.]+)?)\]/m);
  return match ? match[1] : null;
}
