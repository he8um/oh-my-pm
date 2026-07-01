import { isReadOnlyTool, JIRA_READ_ONLY_TOOLS } from "../src/policy/read-only";
import { readFileSync } from "fs";
import { join } from "path";

describe("Jira read-only policy", () => {
  it("recognises all five Jira tools as read-only", () => {
    expect(isReadOnlyTool("jira_list_issues")).toBe(true);
    expect(isReadOnlyTool("jira_summarize_issue")).toBe(true);
    expect(isReadOnlyTool("jira_summarize_project_status")).toBe(true);
    expect(isReadOnlyTool("jira_list_projects")).toBe(true);
    expect(isReadOnlyTool("jira_list_boards")).toBe(true);
  });

  it("rejects write-style Jira tool names", () => {
    expect(isReadOnlyTool("jira_create_issue")).toBe(false);
    expect(isReadOnlyTool("jira_update_issue")).toBe(false);
    expect(isReadOnlyTool("jira_delete_issue")).toBe(false);
    expect(isReadOnlyTool("jira_transition_issue")).toBe(false);
    expect(isReadOnlyTool("jira_create_comment")).toBe(false);
  });

  it("exports a non-empty JIRA_READ_ONLY_TOOLS set", () => {
    expect(JIRA_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(JIRA_READ_ONLY_TOOLS.has("jira_list_issues")).toBe(true);
  });

  it("issues only GET requests from the client module", () => {
    const clientContent = readFileSync(
      join(__dirname, "..", "src", "connectors", "jira", "client.ts"),
      "utf-8"
    );
    expect(clientContent).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
  });
});
