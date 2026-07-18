import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createLocalProvider, createProviderRegistry } from "../src/index.js";
import type { Provider, ProviderResult } from "../src/index.js";

const context = { requestId: "req-async" };
const listRequest: ProviderRequest = { providerId: "local", action: "list", query: "" };

describe("async provider contract", () => {
  it("createLocalProvider().execute returns a Promise", () => {
    const provider = createLocalProvider({ items: [{ id: "a", title: "A" }] });
    const returned = provider.execute(listRequest, context);
    expect(typeof (returned as Promise<ProviderResult>).then).toBe("function");
    return returned; // settle to avoid an unhandled promise
  });

  it("the registry awaits provider execution and returns the resolved result", async () => {
    const registry = createProviderRegistry([createLocalProvider({ items: [{ id: "a", title: "A" }] })]);
    const result = await registry.execute(listRequest, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("a rejecting provider surfaces as a rejected promise, not an unhandled rejection", async () => {
    const rejecting: Provider = {
      descriptor: {
        id: "local",
        name: "Rejecting",
        readOnly: true,
        capabilities: [{ action: "list", readOnly: true }],
      },
      async execute(): Promise<ProviderResult> {
        throw new Error("provider blew up");
      },
    };
    const registry = createProviderRegistry([rejecting]);
    await expect(registry.execute(listRequest, context)).rejects.toThrow("provider blew up");
  });
});
