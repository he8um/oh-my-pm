import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createLocalProvider } from "../src/index.js";
import type { LocalProviderItemInput } from "../src/index.js";

const context = { requestId: "req-test" };

const inputs: LocalProviderItemInput[] = [
  { id: "task-1", title: "Fix login flow", type: "task" },
  { id: "task-2", title: "Write onboarding doc", type: "document" },
  { id: "task-3", title: "Review login audit", type: "task" },
];

function request(overrides: Partial<ProviderRequest>): ProviderRequest {
  return { providerId: "local", action: "list", query: "", ...overrides };
}

describe("local provider", () => {
  it("exposes a read-only descriptor with search/fetch/list", () => {
    const provider = createLocalProvider({ items: inputs });
    expect(provider.descriptor.id).toBe("local");
    expect(provider.descriptor.readOnly).toBe(true);
    expect(provider.descriptor.capabilities.map((c) => c.action)).toEqual([
      "search",
      "fetch",
      "list",
    ]);
    expect(provider.descriptor.capabilities.every((c) => c.readOnly)).toBe(true);
  });

  it("lists all items in input order", () => {
    const result = createLocalProvider({ items: inputs }).execute(request({}), context);
    expect(result.ok).toBe(true);
    expect(result.response.items.map((i) => i.id)).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("respects the list limit", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ limit: 2 }),
      context,
    );
    expect(result.response.items.map((i) => i.id)).toEqual(["task-1", "task-2"]);
  });

  it("searches titles", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ action: "search", query: "LOGIN" }),
      context,
    );
    expect(result.response.items.map((i) => i.id)).toEqual(["task-1", "task-3"]);
  });

  it("searches ids", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ action: "search", query: "task-2" }),
      context,
    );
    expect(result.response.items.map((i) => i.id)).toEqual(["task-2"]);
  });

  it("returns everything for an empty search query", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ action: "search", query: "" }),
      context,
    );
    expect(result.response.items).toHaveLength(3);
  });

  it("fetches an exact id", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ action: "fetch", query: "task-2" }),
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.response.items.map((i) => i.id)).toEqual(["task-2"]);
  });

  it("returns an empty response for a missing fetch id", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ action: "fetch", query: "missing" }),
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.response.items).toEqual([]);
  });

  it("returns no items when limit is zero", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ limit: 0 }),
      context,
    );
    expect(result.response.items).toEqual([]);
  });

  it("fails a request addressed to another provider", () => {
    const result = createLocalProvider({ items: inputs }).execute(
      request({ providerId: "github" }),
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OMP-P-4003");
    }
  });

  it("does not mutate input items", () => {
    const frozen = inputs.map((item) => Object.freeze({ ...item }));
    const provider = createLocalProvider({ items: frozen });
    provider.execute(request({ action: "search", query: "login" }), context);
    provider.execute(request({}), context);
    expect(frozen[0]).toEqual({ id: "task-1", title: "Fix login flow", type: "task" });
  });
});
