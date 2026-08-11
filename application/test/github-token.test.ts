import { describe, expect, it } from "vitest";
import { GITHUB_TOKEN_ENV, readGitHubTokenFromEnvironment } from "../src/node/index.js";

describe("readGitHubTokenFromEnvironment", () => {
  it("reads the token from the exact env variable name", () => {
    expect(GITHUB_TOKEN_ENV).toBe("OH_MY_PM_GITHUB_TOKEN");
    const token = readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "abc123" });
    expect(token).toBe("abc123");
  });

  it("trims surrounding whitespace", () => {
    expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "  abc  " })).toBe("abc");
  });

  it("treats an empty or whitespace-only value as absent", () => {
    expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "" })).toBeUndefined();
    expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "   " })).toBeUndefined();
  });

  it("returns undefined when the variable is missing", () => {
    expect(readGitHubTokenFromEnvironment({})).toBeUndefined();
    expect(readGitHubTokenFromEnvironment({ OTHER: "x" })).toBeUndefined();
  });

  it("does not mutate the provided environment object", () => {
    const env = Object.freeze({ OH_MY_PM_GITHUB_TOKEN: "abc" });
    expect(() => readGitHubTokenFromEnvironment(env)).not.toThrow();
    expect(env.OH_MY_PM_GITHUB_TOKEN).toBe("abc");
  });

  // A control character in the token would otherwise flow into the transport's
  // Authorization header template, leaving header-injection rejection delegated
  // to Node's HTTP stack rather than enforced at this boundary. Rejection is
  // local, and it is a charset check only -- deliberately not a format check.
  describe("rejects a value containing an ASCII control character", () => {
    const CONTROL_BEARING: [string, string][] = [
      ["CR", "abc\rdef"],
      ["LF", "abc\ndef"],
      ["CRLF", "abc\r\ndef"],
      ["TAB", "abc\tdef"],
      ["NUL", "abc\u0000def"],
      ["DEL", "abc\u007fdef"],
      ["vertical tab", "abc\u000bdef"],
      ["form feed", "abc\u000cdef"],
      ["escape", "abc\u001bdef"],
      ["unit separator", "abc\u001fdef"],
      // Leading/trailing controls are the trim() hazard: trim() strips CR, LF,
      // and TAB, so checking a trimmed value would accept these as "abc123".
      ["trailing CRLF", "abc123\r\n"],
      ["leading CRLF", "\r\nabc123"],
      ["trailing TAB", "abc123\t"],
      ["header-injection attempt", "abc123\r\nX-Injected: 1"],
    ];

    for (const [label, raw] of CONTROL_BEARING) {
      it(`rejects ${label}`, () => {
        expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: raw })).toBeUndefined();
      });
    }

    it("checks the raw value before trimming", () => {
      // If the check ran after trim(), this would be accepted as "abc123".
      expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "\tabc123\r\n" })).toBe(
        undefined,
      );
    });
  });

  describe("accepts ordinary token charsets without assuming a format", () => {
    it("trims surrounding ordinary spaces", () => {
      expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "  abc123  " })).toBe(
        "abc123",
      );
    });

    // No prefix assumption: GitHub token shapes change, and rejecting a valid
    // future token would be a worse failure than the risk being mitigated.
    const ACCEPTED = [
      "abc123",
      "a_b-c.d",
      "ghp_0123456789abcdefABCDEF",
      "github_pat_11ABCDE0123456789_abcdefXYZ",
      "token~with!punctuation@and#symbols$%^&*()",
      "brand+new/format=2030",
      "sk:scoped:token",
      "unicode-café-token",
      "a".repeat(255),
    ];

    for (const token of ACCEPTED) {
      it(`accepts ${token.length > 40 ? `${token.slice(0, 24)}... (${token.length} chars)` : token}`, () => {
        expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: token })).toBe(token);
      });
    }

    it("accepts a space inside the token, which is not a control character", () => {
      expect(readGitHubTokenFromEnvironment({ OH_MY_PM_GITHUB_TOKEN: "abc 123" })).toBe("abc 123");
    });
  });
});
