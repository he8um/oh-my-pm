import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_DOCUMENT_MAX_FILES, createRuntimeRequest } from "../src/index.js";

describe("cli runtime request factory", () => {
  it("creates a deterministic status request", () => {
    expect(createRuntimeRequest("status")).toEqual({
      id: "cli-status",
      kind: "status",
      locale: "en",
      payload: { source: "cli" },
    });
  });

  it("creates a deterministic doctor request", () => {
    expect(createRuntimeRequest("doctor")).toEqual({
      id: "cli-doctor",
      kind: "doctor",
      locale: "en",
      payload: { source: "cli" },
    });
  });

  it("creates a deterministic plan request with the input text", () => {
    expect(createRuntimeRequest("plan", "review risks")).toEqual({
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: "review risks", context: {} },
    });
  });

  it("creates the exact brief request with local provider list context", () => {
    expect(createRuntimeRequest("brief", "./my-project")).toEqual({
      id: "cli-brief",
      kind: "plan",
      locale: "en",
      payload: {
        source: "cli",
        request: "status brief for the current project",
        context: {
          providerRequests: [
            {
              providerId: "local",
              action: "list",
              query: "",
              limit: DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
            },
          ],
        },
      },
    });
  });

  it("never places the brief root path into the runtime payload", () => {
    const request = createRuntimeRequest("brief", "./secret-project-root");
    expect(JSON.stringify(request)).not.toContain("secret-project-root");
    expect(createRuntimeRequest("brief", "./a")).toEqual(createRuntimeRequest("brief", "./b"));
  });
});
