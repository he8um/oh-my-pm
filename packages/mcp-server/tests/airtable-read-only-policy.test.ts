import { isReadOnlyTool, AIRTABLE_READ_ONLY_TOOLS } from "../src/policy/read-only";

describe("Airtable read-only policy", () => {
  it("recognises all five Airtable tools as read-only", () => {
    expect(isReadOnlyTool("airtable_list_bases")).toBe(true);
    expect(isReadOnlyTool("airtable_list_tables")).toBe(true);
    expect(isReadOnlyTool("airtable_describe_table")).toBe(true);
    expect(isReadOnlyTool("airtable_list_records")).toBe(true);
    expect(isReadOnlyTool("airtable_summarize_base_status")).toBe(true);
  });

  it("rejects write-style Airtable tool names", () => {
    expect(isReadOnlyTool("airtable_create_record")).toBe(false);
    expect(isReadOnlyTool("airtable_update_record")).toBe(false);
    expect(isReadOnlyTool("airtable_delete_record")).toBe(false);
    expect(isReadOnlyTool("airtable_create_table")).toBe(false);
    expect(isReadOnlyTool("airtable_upload_attachment")).toBe(false);
  });

  it("exports a non-empty AIRTABLE_READ_ONLY_TOOLS set", () => {
    expect(AIRTABLE_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(AIRTABLE_READ_ONLY_TOOLS.has("airtable_list_records")).toBe(true);
  });
});
