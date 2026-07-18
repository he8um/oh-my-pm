import { describe, expect, it } from "vitest";
import { runDoctorBriefExample, runDoctorMarkdownExample } from "../src/index.js";

describe("doctor examples", () => {
  it("brief doctor succeeds", async () => {
    const result = await runDoctorBriefExample();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM doctor: ok");
  });

  it("markdown doctor renders the heading", async () => {
    const result = await runDoctorMarkdownExample();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Doctor");
  });
});
