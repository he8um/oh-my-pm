import { isReadOnlyTool, GITHUB_READ_ONLY_TOOLS } from "../src/policy/read-only";

describe("GitHub read-only policy", () => {
  it("recognises all four GitHub tools as read-only", () => {
    expect(isReadOnlyTool("github_list_issues")).toBe(true);
    expect(isReadOnlyTool("github_summarize_issue")).toBe(true);
    expect(isReadOnlyTool("github_list_milestones")).toBe(true);
    expect(isReadOnlyTool("github_get_repository_context")).toBe(true);
  });

  it("rejects write-style GitHub tool names", () => {
    expect(isReadOnlyTool("github_create_issue")).toBe(false);
    expect(isReadOnlyTool("github_update_issue")).toBe(false);
    expect(isReadOnlyTool("github_close_issue")).toBe(false);
    expect(isReadOnlyTool("github_add_label")).toBe(false);
    expect(isReadOnlyTool("github_create_comment")).toBe(false);
  });

  it("exports a non-empty GITHUB_READ_ONLY_TOOLS set", () => {
    expect(GITHUB_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(GITHUB_READ_ONLY_TOOLS.has("github_list_issues")).toBe(true);
  });
});
