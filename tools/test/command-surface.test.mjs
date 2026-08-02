import { describe, expect, it } from "vitest";

import {
  ALIAS_INSTALLED_COMMANDS,
  ALL_INSTALLED_COMMANDS,
  BUNDLE_EXECUTABLE_NAMES,
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  COMMAND_ROLES,
  COMMAND_SURFACE,
  COMPAT_CLI,
  COMPAT_INSTALLED_COMMANDS,
  COMPAT_INSTALLER,
  COMPAT_MCP,
  DEPRECATED_CLI,
  DEPRECATED_INSTALLED_COMMANDS,
  DEPRECATED_INSTALLER,
  DEPRECATED_MCP,
  INSTALLED_SHIM_COUNT,
  INSTALLED_SHIM_NAMES,
  MCP_SERVER_KEY,
  PRODUCT,
  REQUIRED_PRODUCT_IDENTITY,
  aliasClassOf,
  aliasWarning,
  canonicalForAlias,
  isValidCommandName,
  validateCommandSurface,
} from "../command-surface.mjs";

/** A minimal well-formed manifest, cloned per test so mutations stay local. */
function validManifest() {
  return {
    schemaVersion: 2,
    product: {
      name: "OH MY PM",
      slug: "oh-my-pm",
      packageScope: "@oh-my-pm",
      environmentPrefix: "OH_MY_PM_",
      archivePrefix: "oh-my-pm",
      mcpServerKey: "oh-my-pm",
    },
    executables: {
      cli: { canonical: "omp", compatibilityAliases: ["ohmypm"], deprecatedAliases: ["oh-my-pm"] },
      mcp: {
        canonical: "omp-mcp",
        compatibilityAliases: ["ohmypm-mcp"],
        deprecatedAliases: ["oh-my-pm-mcp"],
      },
      installer: {
        canonical: "omp-install",
        compatibilityAliases: ["ohmypm-install"],
        deprecatedAliases: ["oh-my-pm-install"],
      },
    },
    canonicalSince: "0.6.0",
    compatibilityAliasSince: "0.5.0",
    deprecatedSince: "0.5.0",
    removalScheduled: false,
  };
}

describe("isValidCommandName", () => {
  it("accepts every declared command name", () => {
    for (const name of [
      "omp",
      "omp-mcp",
      "omp-install",
      "ohmypm",
      "ohmypm-mcp",
      "ohmypm-install",
      "oh-my-pm",
      "oh-my-pm-mcp",
    ]) {
      expect(isValidCommandName(name), name).toBe(true);
    }
  });

  it("rejects names that could escape a bin directory or a shell word", () => {
    for (const name of [
      "",
      " omp",
      "omp ",
      "-omp",
      "omp-",
      "Omp",
      "omp/mcp",
      "omp\\mcp",
      "oh my pm",
      "omp;rm",
      "omp$(x)",
      "omp\n",
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
    raw.schemaVersion = 1;
    expect(validateCommandSurface(raw)).toContain("schemaVersion must be 2");
  });

  // --- Product identity mutations. -----------------------------------------
  // Each of these is a rename the v0.6 migration explicitly must NOT perform.
  // The manifest is where "unchanged" stops being a claim and becomes enforced.

  it("refuses to let any product identity field be renamed", () => {
    for (const [field, expected] of Object.entries(REQUIRED_PRODUCT_IDENTITY)) {
      const raw = validManifest();
      raw.product[field] = "omp";
      expect(validateCommandSurface(raw), field).toContain(
        `product.${field} must be "${expected}"`,
      );
    }
  });

  it("rejects a missing product block", () => {
    const raw = validManifest();
    delete raw.product;
    expect(validateCommandSurface(raw)).toContain("product must be an object");
  });

  // --- Executable structure mutations. --------------------------------------

  it("requires all three command roles", () => {
    const raw = validManifest();
    delete raw.executables.mcp;
    expect(validateCommandSurface(raw).join(" ")).toContain("executables must declare exactly");
  });

  it("rejects an invalid canonical command name", () => {
    const raw = validManifest();
    raw.executables.cli.canonical = "om p";
    expect(validateCommandSurface(raw)).toContain(
      "executables.cli.canonical is not a valid command name",
    );
  });

  it("rejects an invalid alias name in either class", () => {
    for (const aliasClass of ["compatibilityAliases", "deprecatedAliases"]) {
      const raw = validManifest();
      raw.executables.cli[aliasClass] = ["../escape"];
      expect(validateCommandSurface(raw), aliasClass).toContain(
        `executables.cli.${aliasClass} contains an invalid command name`,
      );
    }
  });

  it("rejects duplicate aliases within a class", () => {
    const raw = validManifest();
    raw.executables.cli.deprecatedAliases = ["oh-my-pm", "oh-my-pm"];
    expect(validateCommandSurface(raw)).toContain(
      "executables.cli.deprecatedAliases contains a duplicate",
    );
  });

  it("rejects a name that is both a compatibility and a deprecated alias", () => {
    // The two classes carry different support promises, so a name in both would
    // make its own promise ambiguous and its warning wording arbitrary.
    const raw = validManifest();
    raw.executables.cli.deprecatedAliases = ["ohmypm"];
    expect(validateCommandSurface(raw)).toContain(
      "executables.cli: ohmypm is both a compatibility and deprecated alias",
    );
  });

  it("rejects an alias that equals its own canonical name", () => {
    // If a name were both, the wrapper would warn about the very command it
    // forwards to, and could recurse.
    for (const aliasClass of ["compatibilityAliases", "deprecatedAliases"]) {
      const raw = validManifest();
      raw.executables.cli[aliasClass] = ["omp"];
      expect(validateCommandSurface(raw), aliasClass).toContain(
        "executables.cli: omp is declared both canonical and alias",
      );
    }
  });

  it("rejects duplicate canonical names across roles", () => {
    const raw = validManifest();
    raw.executables.mcp.canonical = "omp";
    expect(validateCommandSurface(raw)).toContain("canonical command names must be distinct");
  });

  it("rejects one name appearing in two roles", () => {
    // A single executable name can only resolve to one implementation on PATH.
    const raw = validManifest();
    raw.executables.mcp.compatibilityAliases = ["ohmypm"];
    expect(validateCommandSurface(raw)).toContain("ohmypm is declared in more than one role");
  });

  it("requires the since-fields and removalScheduled", () => {
    const raw = validManifest();
    raw.canonicalSince = "";
    raw.compatibilityAliasSince = "";
    raw.deprecatedSince = "";
    raw.removalScheduled = "no";
    const problems = validateCommandSurface(raw);
    expect(problems).toContain("canonicalSince must be a non-empty string");
    expect(problems).toContain("compatibilityAliasSince must be a non-empty string");
    expect(problems).toContain("deprecatedSince must be a non-empty string");
    expect(problems).toContain("removalScheduled must be a boolean");
  });
});

describe("the repository manifest", () => {
  it("declares omp as the canonical command family", () => {
    expect(CANONICAL_CLI).toBe("omp");
    expect(CANONICAL_MCP).toBe("omp-mcp");
    expect(CANONICAL_INSTALLER).toBe("omp-install");
  });

  it("retains ohmypm as a supported compatibility alias family", () => {
    // Not "deprecated": this family was canonical in v0.5, one minor version
    // ago, so demoting it that far would retroactively withdraw a promise.
    expect(COMPAT_CLI).toEqual(["ohmypm"]);
    expect(COMPAT_MCP).toEqual(["ohmypm-mcp"]);
    expect(COMPAT_INSTALLER).toEqual(["ohmypm-install"]);
  });

  it("retains oh-my-pm as the deprecated alias family", () => {
    expect(DEPRECATED_CLI).toEqual(["oh-my-pm"]);
    expect(DEPRECATED_MCP).toEqual(["oh-my-pm-mcp"]);
    expect(DEPRECATED_INSTALLER).toEqual(["oh-my-pm-install"]);
  });

  it("keeps every product identity unchanged", () => {
    expect(PRODUCT.name).toBe("OH MY PM");
    expect(PRODUCT.slug).toBe("oh-my-pm");
    expect(PRODUCT.packageScope).toBe("@oh-my-pm");
    expect(PRODUCT.environmentPrefix).toBe("OH_MY_PM_");
    expect(PRODUCT.archivePrefix).toBe("oh-my-pm");
    expect(MCP_SERVER_KEY).toBe("oh-my-pm");
  });

  it("schedules no removal for either alias family", () => {
    expect(COMMAND_SURFACE.canonicalSince).toBe("0.6.0");
    expect(COMMAND_SURFACE.deprecatedSince).toBe("0.5.0");
    expect(COMMAND_SURFACE.removalScheduled).toBe(false);
  });

  it("declares exactly the three command roles", () => {
    expect(Object.keys(COMMAND_SURFACE.executables).sort()).toEqual([...COMMAND_ROLES].sort());
  });

  it("orders installed commands canonical, then compatibility, then deprecated", () => {
    expect(CANONICAL_INSTALLED_COMMANDS).toEqual(["omp", "omp-mcp"]);
    expect(COMPAT_INSTALLED_COMMANDS).toEqual(["ohmypm", "ohmypm-mcp"]);
    expect(DEPRECATED_INSTALLED_COMMANDS).toEqual(["oh-my-pm", "oh-my-pm-mcp"]);
    expect(ALIAS_INSTALLED_COMMANDS).toEqual(["ohmypm", "ohmypm-mcp", "oh-my-pm", "oh-my-pm-mcp"]);
    expect(ALL_INSTALLED_COMMANDS).toEqual([
      "omp",
      "omp-mcp",
      "ohmypm",
      "ohmypm-mcp",
      "oh-my-pm",
      "oh-my-pm-mcp",
    ]);
  });

  it("derives the shim inventory rather than restating a count", () => {
    // Six installed commands, each with a POSIX and a .cmd launcher.
    expect(INSTALLED_SHIM_COUNT).toBe(12);
    expect(INSTALLED_SHIM_NAMES).toHaveLength(INSTALLED_SHIM_COUNT);
    expect(INSTALLED_SHIM_NAMES).toEqual(ALL_INSTALLED_COMMANDS.flatMap((c) => [c, `${c}.cmd`]));
    expect(new Set(INSTALLED_SHIM_NAMES).size).toBe(INSTALLED_SHIM_COUNT);
  });

  it("ships nine bundle executables, canonical class first", () => {
    expect(BUNDLE_EXECUTABLE_NAMES).toEqual([
      "omp",
      "omp-mcp",
      "omp-install",
      "ohmypm",
      "ohmypm-mcp",
      "ohmypm-install",
      "oh-my-pm",
      "oh-my-pm-mcp",
      "oh-my-pm-install",
    ]);
    expect(new Set(BUNDLE_EXECUTABLE_NAMES).size).toBe(BUNDLE_EXECUTABLE_NAMES.length);
  });
});

describe("aliasClassOf", () => {
  it("classifies each declared name", () => {
    for (const name of ["omp", "omp-mcp", "omp-install"]) {
      expect(aliasClassOf(name), name).toBe("canonical");
    }
    for (const name of ["ohmypm", "ohmypm-mcp", "ohmypm-install"]) {
      expect(aliasClassOf(name), name).toBe("compatibility");
    }
    for (const name of ["oh-my-pm", "oh-my-pm-mcp", "oh-my-pm-install"]) {
      expect(aliasClassOf(name), name).toBe("deprecated");
    }
  });

  it("returns null for an unknown name", () => {
    expect(aliasClassOf("something-else")).toBeNull();
  });
});

describe("canonicalForAlias", () => {
  it("maps every alias in both classes to its canonical replacement", () => {
    expect(canonicalForAlias("ohmypm")).toBe("omp");
    expect(canonicalForAlias("ohmypm-mcp")).toBe("omp-mcp");
    expect(canonicalForAlias("ohmypm-install")).toBe("omp-install");
    expect(canonicalForAlias("oh-my-pm")).toBe("omp");
    expect(canonicalForAlias("oh-my-pm-mcp")).toBe("omp-mcp");
    expect(canonicalForAlias("oh-my-pm-install")).toBe("omp-install");
  });

  it("returns null for a canonical or unknown name", () => {
    expect(canonicalForAlias("omp")).toBeNull();
    expect(canonicalForAlias("something-else")).toBeNull();
  });
});

describe("aliasWarning", () => {
  it("uses compatibility wording for the ohmypm family", () => {
    expect(aliasWarning("ohmypm")).toBe("Warning: `ohmypm` is a compatibility alias; use `omp`.");
    expect(aliasWarning("ohmypm-mcp")).toBe(
      "Warning: `ohmypm-mcp` is a compatibility alias; use `omp-mcp`.",
    );
    expect(aliasWarning("ohmypm-install")).toBe(
      "Warning: `ohmypm-install` is a compatibility alias; use `omp-install`.",
    );
  });

  it("uses deprecation wording for the oh-my-pm family", () => {
    expect(aliasWarning("oh-my-pm")).toBe("Warning: `oh-my-pm` is deprecated; use `omp`.");
    expect(aliasWarning("oh-my-pm-mcp")).toBe(
      "Warning: `oh-my-pm-mcp` is deprecated; use `omp-mcp`.",
    );
    expect(aliasWarning("oh-my-pm-install")).toBe(
      "Warning: `oh-my-pm-install` is deprecated; use `omp-install`.",
    );
  });

  it("never calls a compatibility alias deprecated", () => {
    // The whole reason the two classes exist: `ohmypm` is supported, and saying
    // otherwise would misreport a name that was canonical one release ago.
    for (const name of ["ohmypm", "ohmypm-mcp", "ohmypm-install"]) {
      expect(aliasWarning(name), name).not.toMatch(/deprecated/i);
    }
  });

  it("never emits a trailing newline of its own", () => {
    // Callers add the newline, so a wrapper can control exactly what reaches
    // stderr without risking a blank line before protocol output.
    for (const name of ["ohmypm", "oh-my-pm"]) {
      expect(aliasWarning(name).endsWith("\n"), name).toBe(false);
    }
  });

  it("is a single line, so an alias can emit exactly one warning", () => {
    for (const name of ["ohmypm", "ohmypm-mcp", "oh-my-pm", "oh-my-pm-mcp"]) {
      expect(aliasWarning(name).includes("\n"), name).toBe(false);
    }
  });

  it("throws for a canonical name", () => {
    for (const name of ["omp", "omp-mcp", "omp-install"]) {
      expect(() => aliasWarning(name), name).toThrow(/not an alias/);
    }
  });
});
