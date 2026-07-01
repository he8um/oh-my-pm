import { isReadOnlyTool, CLICKUP_READ_ONLY_TOOLS } from "../src/policy/read-only";

describe("ClickUp read-only policy", () => {
  it("recognises all seven ClickUp tools as read-only", () => {
    expect(isReadOnlyTool("clickup_list_tasks")).toBe(true);
    expect(isReadOnlyTool("clickup_summarize_task")).toBe(true);
    expect(isReadOnlyTool("clickup_summarize_list_status")).toBe(true);
    expect(isReadOnlyTool("clickup_list_spaces")).toBe(true);
    expect(isReadOnlyTool("clickup_list_folders")).toBe(true);
    expect(isReadOnlyTool("clickup_list_lists")).toBe(true);
    expect(isReadOnlyTool("clickup_get_workspace_context")).toBe(true);
  });

  it("rejects write-style ClickUp tool names", () => {
    expect(isReadOnlyTool("clickup_create_task")).toBe(false);
    expect(isReadOnlyTool("clickup_update_task")).toBe(false);
    expect(isReadOnlyTool("clickup_delete_task")).toBe(false);
    expect(isReadOnlyTool("clickup_create_comment")).toBe(false);
    expect(isReadOnlyTool("clickup_change_status")).toBe(false);
    expect(isReadOnlyTool("clickup_assign_user")).toBe(false);
  });

  it("exports a non-empty CLICKUP_READ_ONLY_TOOLS set", () => {
    expect(CLICKUP_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(CLICKUP_READ_ONLY_TOOLS.has("clickup_list_tasks")).toBe(true);
  });
});
