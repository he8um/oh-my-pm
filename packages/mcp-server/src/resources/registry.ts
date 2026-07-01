import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { now } from "../utils/formatting.js";

export function registerResources(server: McpServer): void {
  const root = getProjectRoot();

  server.resource(
    "project://current",
    "project://current",
    { description: "Current project context: name, version, and milestone state." },
    async (_uri) => {
      const [version, roadmapMd, readmeMd] = await Promise.all([
        safeReadFile(root, "VERSION"),
        safeReadFile(root, "ROADMAP.md"),
        safeReadFile(root, "README.md"),
      ]);
      const content = JSON.stringify(
        {
          read_at: now(),
          version: version?.trim() ?? "unknown",
          roadmap_excerpt: roadmapMd?.split("\n").slice(0, 20).join("\n") ?? null,
          readme_excerpt: readmeMd?.split("\n").slice(0, 10).join("\n") ?? null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://current", text: content }] };
    }
  );

  server.resource(
    "project://risks/open",
    "project://risks/open",
    { description: "Open risk register items from local repository." },
    async (_uri) => {
      const riskMd = await safeReadFile(root, "templates/en/risk-register.md");
      const content = JSON.stringify(
        {
          read_at: now(),
          note: "v0.7.0: risk data from local template only. Connect a project tool for live risks.",
          risk_register_available: riskMd !== null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://risks/open", text: content }] };
    }
  );

  server.resource(
    "project://decisions/open",
    "project://decisions/open",
    { description: "Open decisions with owners from local repository." },
    async (_uri) => {
      const decisionMd = await safeReadFile(root, "templates/en/decision-log.md");
      const content = JSON.stringify(
        {
          read_at: now(),
          note: "v0.7.0: decision data from local template only. Connect a project tool for live decisions.",
          decision_log_available: decisionMd !== null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://decisions/open", text: content }] };
    }
  );
}
