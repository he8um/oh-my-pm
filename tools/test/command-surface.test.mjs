import { describe, expect, it } from "vitest";

import {
  ALL_INSTALLED_COMMANDS,
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  COMMAND_ROLES,
  COMMAND_SURFACE,
  LEGACY_CLI,
  LEGACY_INSTALLED_COMMANDS,
  LEGACY_INSTALLER,
  LEGACY_MCP,
  canonicalForLegacyAlias,
  deprecationWarning,
  isValidCommandName,
  validateCommandSurface,
} from "../command-surface.mjs";

/** A minimal well-formed manifest, cloned per test so mutations stay local. */
function validManifest() {
  return {
    schemaVersion: 1,
    product: "oh-my-pm",
    canonical: { cli: "ohmypm", mcp: "ohmypm-mcp", installer: "ohmypm-install" },
    legacyAliases: {
      cli: ["oh-my-pm"],
      mcp: ["oh-my-pm-mcp"],
      installer: ["oh-my-pm-install"],
    },
    deprecatedSince: "0.5.0",
    removalScheduled: false,
  };
}

describe("isValidCommandName", () => {
  it("accepts the canonical and legacy command names", () => {
    for (const name of ["ohmypm", "ohmypm-mcp", "ohmypm-install", "oh-my-pm", "oh-my-pm-mcp"]) {
      expect(isValidCommandName(name), name).toBe(true);
    }
  });

  it("rejects names that could escape a bin directory or a shell word", () => {
    for (const name of [
      "",
      " ohmypm",
      "ohmypm ",
      "-ohmypm",
      "ohmypm-",
      "OhMyPm",
      "ohmypm/mcp",
      "ohmypm\\mcp",
      "oh my pm",
      "ohmypm;rm",
      "ohmypm$(x)",
      "ohmypm\n",
      "..",
      "a".repeat(65),
    ]) {
      expect(isValidCommandName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 5, [], {}]) {
      expect(isValidCommandName(value)).toBe(false);
    }
  });
});

describe("validateCommandSurface", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateCommandSurface(validManifest())).toEqual([]);
  });

  it("rejects a non-object", () => {
    for (const value of [null, [], "x", 5]) {
      expect(validateCommandSurface(value).length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown schema version", () => {
    const raw = validManifest();
    raw.schemaVersion = 2;
    expect(validateCommandSurface(raw)).toContain("schemaVersion must be 1");
  });

  it("refuses to let the product identity be renamed", () => {
    // The migration changes command names only; the product, package scope,
    // data directory, and archive prefix all stay "oh-my-pm".
    const raw = validManifest();
    raw.product = "ohmypm";
    expect(validateCommandSurface(raw)).toContain('product must be "oh-my-pm"');
  });

  it("requires all three command roles in canonical and legacyAliases", () => {
    for (const field of ["canonical", "legacyAliases"]) {
      const raw = validManifest();
      delete raw[field].mcp;
      expect(validateCommandSurface(raw).join(" ")).toContain(field);
    }
  });

  it("rejects an invalid canonical command name", () => {
    const raw = validManifest();
    raw.canonical.cli = "oh mypm";
    expect(validateCommandSurface(raw)).toContain("canonical.cli is not a valid command name");
  });

  it("rejects an invalid legacy alias name", () => {
    const raw = validManifest();
    raw.legacyAliases.cli = ["../escape"];
    expect(validateCommandSurface(raw)).toContain(
      "legacyAliases.cli contains an invalid command name",
    );
  });

  it("rejects duplicate legacy aliases", () => {
    const raw = validManifest();
    raw.legacyAliases.cli = ["oh-my-pm", "oh-my-pm"];
    expect(validateCommandSurface(raw)).toContain("legacyAliases.cli contains a duplicate");
  });

  it("rejects a name that is both canonical and legacy", () => {
    // If a name were both, the deprecation wrapper would warn about the very
    // command it forwards to, and could recurse.
    const raw = validManifest();
    raw.legacyAliases.cli = ["ohmypm"];
    expect(validateCommandSurface(raw)).toContain("ohmypm is declared both canonical and legacy");
  });

  it("rejects duplicate canonical names", () => {
    const raw = validManifest();
    raw.canonical.mcp = "ohmypm";
    expect(validateCommandSurface(raw)).toContain("canonical command names must be distinct");
  });

  it("requires deprecatedSince and removalScheduled", () => {
    const raw = validManifest();
    raw.deprecatedSince = "";
    raw.removalScheduled = "no";
    const problems = validateCommandSurface(raw);
    expect(problems).toContain("deprecatedSince must be a non-empty string");
    expect(problems).toContain("removalScheduled must be a boolean");
  });
});

describe("the repository manifest", () => {
  it("declares ohmypm as the canonical command family", () => {
    expect(CANONICAL_CLI).toBe("ohmypm");
    expect(CANONICAL_MCP).toBe("ohmypm-mcp");
    expect(CANONICAL_INSTALLER).toBe("ohmypm-install");
  });

  it("retains the old family as legacy aliases", () => {
    expect(LEGACY_CLI).toEqual(["oh-my-pm"]);
    expect(LEGACY_MCP).toEqual(["oh-my-pm-mcp"]);
    expect(LEGACY_INSTALLER).toEqual(["oh-my-pm-install"]);
  });

  it("keeps the product identity unchanged", () => {
    expect(COMMAND_SURFACE.product).toBe("oh-my-pm");
  });

  it("schedules no removal for the compatibility aliases", () => {
    expect(COMMAND_SURFACE.deprecatedSince).toBe("0.5.0");
    expect(COMMAND_SURFACE.removalScheduled).toBe(false);
  });

  it("declares exactly the three command roles", () => {
    expect(Object.keys(COMMAND_SURFACE.canonical).sort()).toEqual([...COMMAND_ROLES].sort());
  });

  it("orders installed commands canonical-first", () => {
    expect(CANONICAL_INSTALLED_COMMANDS).toEqual(["ohmypm", "ohmypm-mcp"]);
    expect(LEGACY_INSTALLED_COMMANDS).toEqual(["oh-my-pm", "oh-my-pm-mcp"]);
    expect(ALL_INSTALLED_COMMANDS).toEqual(["ohmypm", "ohmypm-mcp", "oh-my-pm", "oh-my-pm-mcp"]);
  });
});

describe("canonicalForLegacyAlias", () => {
  it("maps each legacy alias to its canonical replacement", () => {
    expect(canonicalForLegacyAlias("oh-my-pm")).toBe("ohmypm");
    expect(canonicalForLegacyAlias("oh-my-pm-mcp")).toBe("ohmypm-mcp");
    expect(canonicalForLegacyAlias("oh-my-pm-install")).toBe("ohmypm-install");
  });

  it("returns null for a canonical or unknown name", () => {
    expect(canonicalForLegacyAlias("ohmypm")).toBeNull();
    expect(canonicalForLegacyAlias("something-else")).toBeNull();
  });
});

describe("deprecationWarning", () => {
  it("names both the deprecated alias and its replacement", () => {
    expect(deprecationWarning("oh-my-pm")).toBe(
      "Warning: `oh-my-pm` is a deprecated compatibility alias.\nUse `ohmypm` instead.",
    );
    expect(deprecationWarning("oh-my-pm-mcp")).toBe(
      "Warning: `oh-my-pm-mcp` is a deprecated compatibility alias.\nUse `ohmypm-mcp` instead.",
    );
    expect(deprecationWarning("oh-my-pm-install")).toBe(
      "Warning: `oh-my-pm-install` is a deprecated compatibility alias.\nUse `ohmypm-install` instead.",
    );
  });

  it("never emits a trailing newline of its own", () => {
    // Callers add the newline, so a wrapper can control exactly what reaches
    // stderr without risking a blank line before protocol output.
    expect(deprecationWarning("oh-my-pm").endsWith("\n")).toBe(false);
  });

  it("throws for a name that is not a legacy alias", () => {
    expect(() => deprecationWarning("ohmypm")).toThrow(/not a legacy alias/);
  });
});
