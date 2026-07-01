import { isReadOnlyTool, NOTION_READ_ONLY_TOOLS } from "../src/policy/read-only";
import { readFileSync } from "fs";
import { join } from "path";

describe("Notion read-only policy", () => {
  it("recognises all five Notion tools as read-only", () => {
    expect(isReadOnlyTool("notion_search_pages")).toBe(true);
    expect(isReadOnlyTool("notion_summarize_page")).toBe(true);
    expect(isReadOnlyTool("notion_query_database")).toBe(true);
    expect(isReadOnlyTool("notion_summarize_database")).toBe(true);
    expect(isReadOnlyTool("notion_get_page_context")).toBe(true);
  });

  it("rejects write-style Notion tool names", () => {
    expect(isReadOnlyTool("notion_create_page")).toBe(false);
    expect(isReadOnlyTool("notion_update_page")).toBe(false);
    expect(isReadOnlyTool("notion_delete_page")).toBe(false);
    expect(isReadOnlyTool("notion_append_block")).toBe(false);
    expect(isReadOnlyTool("notion_create_comment")).toBe(false);
  });

  it("exports a non-empty NOTION_READ_ONLY_TOOLS set", () => {
    expect(NOTION_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    expect(NOTION_READ_ONLY_TOOLS.has("notion_query_database")).toBe(true);
  });

  it("client only exposes GET and the two documented read-only POST paths", () => {
    const clientContent = readFileSync(
      join(__dirname, "..", "src", "connectors", "notion", "client.ts"),
      "utf-8"
    );
    // The client must not expose a generic write method name.
    expect(clientContent).not.toMatch(/\b(post|put|patch|del)(Page|Block|Database)\b/i);
    expect(clientContent).toContain("postQuery");
  });

  it("connector source never calls a page/block/database write endpoint", () => {
    const connectorDir = join(__dirname, "..", "src", "connectors", "notion");
    for (const file of ["pages.ts", "databases.ts", "blocks.ts", "search.ts"]) {
      const content = readFileSync(join(connectorDir, file), "utf-8");
      expect(content).not.toMatch(/\/pages(?!\/\$\{)/); // no bare POST /pages (create)
      expect(content).not.toContain("/children\", \"POST\"");
    }
  });
});
