import { describe, expect, it } from "vitest";

import { resolveDataRoot } from "../src/data-location.js";
import { ProjectMemoryError } from "../src/errors.js";

describe("resolveDataRoot", () => {
  it("prefers an explicit override over every platform rule", () => {
    expect(
      resolveDataRoot({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" },
        override: "/custom/root",
      }),
    ).toBe("/custom/root");
  });

  it("resolves Windows LOCALAPPDATA/oh-my-pm", () => {
    expect(
      resolveDataRoot({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" } }),
    ).toBe("C:\\Users\\a\\AppData\\Local\\oh-my-pm");
  });

  it("resolves macOS HOME/Library/Application Support/oh-my-pm", () => {
    expect(resolveDataRoot({ platform: "darwin", homedir: "/Users/a", env: {} })).toBe(
      "/Users/a/Library/Application Support/oh-my-pm",
    );
  });

  it("resolves Linux XDG_DATA_HOME/oh-my-pm", () => {
    expect(
      resolveDataRoot({ platform: "linux", homedir: "/home/a", env: { XDG_DATA_HOME: "/xdg" } }),
    ).toBe("/xdg/oh-my-pm");
  });

  it("resolves Linux fallback HOME/.local/share/oh-my-pm", () => {
    expect(resolveDataRoot({ platform: "linux", homedir: "/home/a", env: {} })).toBe(
      "/home/a/.local/share/oh-my-pm",
    );
  });

  it("fails closed on Windows without LOCALAPPDATA", () => {
    expect(() => resolveDataRoot({ platform: "win32", env: {} })).toThrow(ProjectMemoryError);
  });

  it("fails closed on macOS without a home directory", () => {
    expect(() => resolveDataRoot({ platform: "darwin", env: {} })).toThrow(ProjectMemoryError);
  });

  it("fails closed on Linux with neither XDG_DATA_HOME nor a home directory", () => {
    expect(() => resolveDataRoot({ platform: "linux", env: {} })).toThrow(ProjectMemoryError);
  });

  it("never reads a provider token from the environment", () => {
    // Tokens in the env must not affect resolution and must not appear anywhere.
    const root = resolveDataRoot({
      platform: "linux",
      homedir: "/home/a",
      env: { XDG_DATA_HOME: "/xdg", OH_MY_PM_GITHUB_TOKEN: "ghp_secretvalue" },
    });
    expect(root).toBe("/xdg/oh-my-pm");
    expect(root).not.toContain("ghp_secretvalue");
  });
});
