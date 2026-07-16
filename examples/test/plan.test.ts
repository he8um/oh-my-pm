import { describe, expect, it } from "vitest";
import {
  runPlanBriefExample,
  runPlanJsonExample,
  runPlanMarkdownExample,
  runProviderBackedPlanJsonExample,
} from "../src/index.js";

describe("plan examples", () => {
  it("brief plan succeeds", () => {
    const result = runPlanBriefExample();
    expect(result.exitCode).toBe(0);
    // The example plans a risk review with no provider items, so the risk
    // formatter reports a deterministic empty result.
    expect(result.stdout).toBe("OH MY PM risks: 0\nno risks detected\n");
  });

  it("markdown plan renders the handoff heading", () => {
    // The example plans "create handoff", which routes to the createHandoff
    // skill and now renders as a strict project handoff.
    const result = runPlanMarkdownExample();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Project Handoff");
    expect(result.stdout).toContain("## Summary");
    expect(result.stdout).toContain("## Decisions");
  });

  it("json plan returns the full response", () => {
    const result = runPlanJsonExample();
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.trace)).toBe(true);
    expect(parsed.data.output).toBeDefined();
  });

  it("provider-backed plan reads the local provider end-to-end", () => {
    const result = runProviderBackedPlanJsonExample();
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.providerResponses.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.providerResponses[0].items[0].id).toBe("risk-1");
    const steps = parsed.trace.map((entry: { step: string }) => entry.step);
    expect(steps).toContain("provider.execute");
    expect(parsed.data.output).toBeDefined();
    expect(parsed.data.output.risks.length).toBeGreaterThanOrEqual(1);
  });
});
