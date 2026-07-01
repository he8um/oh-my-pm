import { isReadOnlyTool } from "../src/policy/read-only.js";

describe("read-only policy", () => {
  it("recognises all four v0.7.0 tools as read-only", () => {
    expect(isReadOnlyTool("inspect_project_context")).toBe(true);
    expect(isReadOnlyTool("diagnose_project")).toBe(true);
    expect(isReadOnlyTool("prepare_agent_handoff")).toBe(true);
    expect(isReadOnlyTool("summarize_delivery_status")).toBe(true);
  });

  it("rejects unknown tool names", () => {
    expect(isReadOnlyTool("create_task")).toBe(false);
    expect(isReadOnlyTool("update_status")).toBe(false);
    expect(isReadOnlyTool("delete_issue")).toBe(false);
    expect(isReadOnlyTool("")).toBe(false);
  });
});
