import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createLocalProvider, createProviderRegistry } from "../src/index.js";
import type { Provider } from "../src/index.js";

const context = { requestId: "req-test" };

const localProvider = createLocalProvider({
  items: [{ id: "task-1", title: "Fix login flow" }],
});

const duplicateLocal: Provider = {
  descriptor: {
    id: "local",
    name: "Local Duplicate",
    readOnly: true,
    capabilities: [{ action: "list", readOnly: true }],
  },
  async execute() {
    throw new Error("duplicate provider must never be reached");
  },
};

const listRequest: ProviderRequest = {
  providerId: "local",
  action: "list",
  query: "",
};

describe("provider registry", () => {
  it("lists descriptors in registration order", () => {
    const registry = createProviderRegistry([localProvider]);
    expect(registry.list().map((d) => d.id)).toEqual(["local"]);
  });

  it("returns providers by id", () => {
    const registry = createProviderRegistry([localProvider]);
    expect(registry.get("local")).toBe(localProvider);
    expect(registry.get("github")).toBeUndefined();
  });

  it("keeps the first provider on duplicate ids", () => {
    const registry = createProviderRegistry([localProvider, duplicateLocal]);
    expect(registry.get("local")).toBe(localProvider);
    expect(registry.list().map((d) => d.name)).toEqual(["Local"]);
  });

  it("delegates execution to the matching provider", async () => {
    const registry = createProviderRegistry([localProvider]);
    const result = await registry.execute(listRequest, context);
    expect(result.ok).toBe(true);
    expect(result.response.items.map((i) => i.id)).toEqual(["task-1"]);
  });

  it("fails closed for an unknown provider", async () => {
    const registry = createProviderRegistry([localProvider]);
    const result = await registry.execute({ ...listRequest, providerId: "github" }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OMP-P-4001");
      expect(result.response.providerId).toBe("github");
      expect(result.response.items).toEqual([]);
      expect(result.response.warnings?.[0]?.code).toBe("OMP-P-4001");
    }
  });
});
