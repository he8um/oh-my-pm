import { describe, expect, it } from "vitest";
import { createNodeGitHubHttpTransport } from "../src/index.js";

const ORIGIN = "https://api.github.com";
const VERSION = "9.9.9-test";
const TOKEN = "fixture-token-value";

type Recorded = { url: string; init: RequestInit };

/** A fake fetch returning a fixed JSON body; records the last call. */
function fakeFetch(
  body: unknown,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" },
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("createNodeGitHubHttpTransport", () => {
  it("sends a GET with the exact Accept, API version, and User-Agent headers", async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true });
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await transport.request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 1024,
    });
    expect(calls).toHaveLength(1);
    const init = calls[0]!.init;
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2026-03-10");
    expect(headers["User-Agent"]).toBe(`oh-my-pm/${VERSION}`);
  });

  it("omits Authorization without a token and includes it with a token", async () => {
    const anon = fakeFetch({ ok: true });
    await createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl: anon.fetchImpl }).request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 1024,
    });
    expect((anon.calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();

    const auth = fakeFetch({ ok: true });
    await createNodeGitHubHttpTransport({
      productVersion: VERSION,
      token: TOKEN,
      fetchImpl: auth.fetchImpl,
    }).request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 1024,
    });
    expect((auth.calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("treats an empty/whitespace token as absent", async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true });
    await createNodeGitHubHttpTransport({
      productVersion: VERSION,
      token: "   ",
      fetchImpl,
    }).request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 1024,
    });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("does not leak the token in a thrown transport error", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, token: TOKEN, fetchImpl });
    let caught: unknown;
    try {
      await transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 1024,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).message)).not.toContain(TOKEN);
  });

  it("rejects a non-GET method", async () => {
    const { fetchImpl } = fakeFetch({ ok: true });
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "POST" as "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 1024,
      }),
    ).rejects.toThrow();
  });

  it("rejects a non-api.github.com origin", async () => {
    const { fetchImpl } = fakeFetch({ ok: true });
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: "https://example.com/repos/a/b",
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 1024,
      }),
    ).rejects.toThrow();
  });

  it("aborts when the request exceeds the timeout", async () => {
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }
      })) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 10,
        maxResponseBytes: 1024,
      }),
    ).rejects.toThrow();
  });

  it("rejects a response exceeding the byte ceiling", async () => {
    const big = "x".repeat(5000);
    const { fetchImpl } = fakeFetch(JSON.stringify({ big }));
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid JSON", async () => {
    const { fetchImpl } = fakeFetch("{not valid json");
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 4096,
      }),
    ).rejects.toThrow();
  });

  it("follows a bounded same-origin redirect", async () => {
    let call = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      call += 1;
      if (call === 1) {
        return new Response(null, {
          status: 301,
          headers: { location: `${ORIGIN}/repos/a/b-moved` },
        });
      }
      return new Response(JSON.stringify({ full_name: "a/b-moved" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    const response = await transport.request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    });
    expect(response.status).toBe(200);
    expect(call).toBe(2);
  });

  it("rejects a cross-origin redirect", async () => {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example.com/x" },
      })) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 4096,
      }),
    ).rejects.toThrow();
  });

  it("bounds the redirect count", async () => {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 301,
        headers: { location: `${ORIGIN}/loop` },
      })) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    await expect(
      transport.request({
        method: "GET",
        url: `${ORIGIN}/repos/a/b`,
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 4096,
      }),
    ).rejects.toThrow();
  });

  it("normalizes and filters response headers", async () => {
    const { fetchImpl } = fakeFetch(
      { ok: true },
      200,
      {
        "content-type": "application/json",
        "x-ratelimit-remaining": "42",
        "x-secret-internal": "should-be-dropped",
      },
    );
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    const response = await transport.request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    });
    expect(response.headers["x-ratelimit-remaining"]).toBe("42");
    expect(response.headers["x-secret-internal"]).toBeUndefined();
  });

  it("does not retry on a server error", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const transport = createNodeGitHubHttpTransport({ productVersion: VERSION, fetchImpl });
    const response = await transport.request({
      method: "GET",
      url: `${ORIGIN}/repos/a/b`,
      headers: {},
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    });
    expect(response.status).toBe(500);
    expect(calls).toBe(1);
  });
});
