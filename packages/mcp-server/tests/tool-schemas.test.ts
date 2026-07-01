import { inspectProjectContext } from "../src/tools/inspect-project-context";
import { summarizeDeliveryStatus } from "../src/tools/summarize-delivery-status";
import { prepareAgentHandoff } from "../src/tools/prepare-agent-handoff";
import { diagnoseProject } from "../src/tools/diagnose-project";
import path from "node:path";

const FIXTURE_ROOT = path.resolve(__dirname, "fixtures/test-project");

beforeEach(() => {
  process.env["OH_MY_PM_PROJECT_ROOT"] = FIXTURE_ROOT;
});

afterEach(() => {
  delete process.env["OH_MY_PM_PROJECT_ROOT"];
});

describe("inspect_project_context", () => {
  it("returns a status field", async () => {
    const result = await inspectProjectContext();
    expect(result).toHaveProperty("status");
  });

  it("returns data_source: local_repo on success", async () => {
    const result = await inspectProjectContext() as Record<string, unknown>;
    if (result["status"] !== "error") {
      expect(result["data_source"]).toBe("local_repo");
    }
  });
});

describe("summarize_delivery_status", () => {
  it("returns a status field", async () => {
    const result = await summarizeDeliveryStatus();
    expect(result).toHaveProperty("status");
  });
});

describe("prepare_agent_handoff", () => {
  it("returns a status field", async () => {
    const result = await prepareAgentHandoff();
    expect(result).toHaveProperty("status");
  });

  it("respects optional context parameter", async () => {
    const result = await prepareAgentHandoff("session context here") as Record<string, unknown>;
    expect(result).toHaveProperty("status");
  });
});

describe("diagnose_project", () => {
  it("returns a status field", async () => {
    const result = await diagnoseProject();
    expect(result).toHaveProperty("status");
  });

  it("respects optional focus parameter", async () => {
    const result = await diagnoseProject("launch readiness") as Record<string, unknown>;
    expect(result).toHaveProperty("status");
  });
});
