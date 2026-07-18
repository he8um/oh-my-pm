import { describe, expect, it } from "vitest";
import { GITHUB_TOKEN_ENV, readGitHubTokenFromEnvironment } from "../src/index.js";

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
});
