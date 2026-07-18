import { describe, expect, it } from "vitest";
import { runStatusBriefExample, runStatusJsonExample } from "../src/index.js";

describe("status examples", () => {
  it("brief status succeeds with version details", async () => {
    const result = await runStatusBriefExample();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stdout).toContain("2.0.0-alpha.0-example");
    expect(result.stdout).toContain("kernel");
  });

  it("json status returns valid JSON with ok true", async () => {
    const result = await runStatusJsonExample();
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.version).toBe("2.0.0-alpha.0-example");
  });
});
