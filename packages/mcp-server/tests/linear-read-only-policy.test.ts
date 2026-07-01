import { isReadOnlyTool, LINEAR_READ_ONLY_TOOLS } from "../src/policy/read-only";
import { readFileSync } from "fs";
import { join } from "path";

describe("Linear read-only policy", () => {
  it("recognises all five Linear tools as read-only", () => {
    expect(isReadOnlyTool("linear_list_issues")).toBe(true);
    expect(isReadOnlyTool("linear_summarize_issue")).toBe(true);
    expect(isReadOnlyTool("linear_summarize_project_status")).toBe(true);
    expect(isReadOnlyTool("linear_list_teams")).toBe(true);
    expect(isReadOnlyTool("linear_list_projects")).toBe(true);
  });

  it("rejects write-style Linear tool names", () => {
    expect(isReadOnlyTool("linear_create_issue")).toBe(false);
    expect(isReadOnlyTool("linear_update_issue")).toBe(false);
    expect(isReadOnlyTool("linear_delete_issue")).toBe(false);
    expect(isReadOnlyTool("linear_create_comment")).toBe(false);
    expect(isReadOnlyTool("linear_change_status")).toBe(false);
  });

  it("exports a non-empty LINEAR_READ_ONLY_TOOLS set", () => {
    expect(LINEAR_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(LINEAR_READ_ONLY_TOOLS.has("linear_list_issues")).toBe(true);
  });

  it("sends no GraphQL query string containing the word mutation", () => {
    const connectorDir = join(__dirname, "..", "src", "connectors", "linear");
    for (const file of ["issues.ts", "teams.ts", "projects.ts"]) {
      const content = readFileSync(join(connectorDir, file), "utf-8");
      expect(content.toLowerCase()).not.toContain("mutation");
    }
  });
});
