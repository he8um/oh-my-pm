// Cross-surface consistency for the v0.5 command names.
//
// command-surface.json is the single source of truth, but several surfaces cannot
// import it at runtime: the CLI and MCP packages are deliberately pure (no
// filesystem access), package manifests are static JSON, and the release-install
// core must stay repository-independent so it can run from inside an extracted
// bundle. Those surfaces restate the names, so something has to prove the
// restatements still agree. That is what these tests assert directly, in addition
// to running the repository's own validator.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ALL_INSTALLED_COMMANDS,
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  COMMAND_SURFACE,
  LEGACY_CLI,
  LEGACY_INSTALLED_COMMANDS,
  LEGACY_INSTALLER,
  LEGACY_MCP,
} from "../command-surface.mjs";
import {
  RELEASE_INSTALL_CANONICAL_COMMANDS,
  RELEASE_INSTALL_COMMANDS,
  RELEASE_INSTALL_LEGACY_COMMANDS,
  RELEASE_INSTALLER_ENTRYPOINT,
  createInstalledManifest,
  releaseInstallShimFileNames,
} from "../../distribution/libexec/release-install-core.mjs";
import {
  LOCAL_CANONICAL_COMMAND_NAMES,
  LOCAL_COMMAND_NAMES,
  LOCAL_LEGACY_COMMAND_NAMES,
} from "../local-install-utils.mjs";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(toolsDir, "..");
const readJson = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));

describe("the repository validator agrees", () => {
  it("passes pnpm validate:commands", () => {
    const result = spawnSync(process.execPath, [join(toolsDir, "validate-command-surface.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate-command-surface: OK");
  }, 30000);
});

describe("package bin maps match the manifest", () => {
  it("the CLI package exposes only the canonical CLI command", () => {
    expect(readJson("cli/package.json").bin).toEqual({
      [CANONICAL_CLI]: `./bin/${CANONICAL_CLI}.mjs`,
    });
  });

  it("the MCP package exposes only the canonical MCP command", () => {
    expect(readJson("mcp-server/package.json").bin).toEqual({
      [CANONICAL_MCP]: `./bin/${CANONICAL_MCP}.mjs`,
    });
  });

  it("the distribution package ships both families, canonical first", () => {
    const bin = readJson("distribution/package.json").bin;
    expect(Object.keys(bin)).toEqual([
      CANONICAL_CLI,
      CANONICAL_MCP,
      CANONICAL_INSTALLER,
      ...LEGACY_CLI,
      ...LEGACY_MCP,
      ...LEGACY_INSTALLER,
    ]);
    for (const [name, target] of Object.entries(bin)) {
      expect(target).toBe(`./bin/${name}.mjs`);
    }
  });

  it("every declared bin target exists on disk", () => {
    for (const pkg of ["cli", "mcp-server", "distribution"]) {
      const bin = readJson(`${pkg}/package.json`).bin;
      for (const target of Object.values(bin)) {
        const abs = join(repoRoot, pkg, target);
        expect(existsSync(abs), `${pkg}: ${target} must exist`).toBe(true);
      }
    }
  });
});

describe("installer command arrays match the manifest", () => {
  it("the local installer plans the manifest's commands, canonical first", () => {
    expect(LOCAL_CANONICAL_COMMAND_NAMES).toEqual(CANONICAL_INSTALLED_COMMANDS);
    expect(LOCAL_LEGACY_COMMAND_NAMES).toEqual(LEGACY_INSTALLED_COMMANDS);
    expect(LOCAL_COMMAND_NAMES).toEqual(ALL_INSTALLED_COMMANDS);
  });

  it("the release install core plans the same command set", () => {
    expect(RELEASE_INSTALL_CANONICAL_COMMANDS).toEqual(CANONICAL_INSTALLED_COMMANDS);
    expect(RELEASE_INSTALL_LEGACY_COMMANDS).toEqual(LEGACY_INSTALLED_COMMANDS);
    expect(RELEASE_INSTALL_COMMANDS).toEqual(ALL_INSTALLED_COMMANDS);
  });

  it("the two installers agree with each other", () => {
    // A local development install and a release install must produce the same
    // command names, or `mcp-config` would resolve differently between them.
    expect(LOCAL_COMMAND_NAMES).toEqual(RELEASE_INSTALL_COMMANDS);
  });

  it("plans a POSIX and a .cmd launcher for every command", () => {
    const shims = releaseInstallShimFileNames();
    expect(shims).toEqual(ALL_INSTALLED_COMMANDS.flatMap((n) => [n, `${n}.cmd`]));
    expect(shims).toHaveLength(8);
  });

  it("declares the canonical installer entrypoint", () => {
    expect(RELEASE_INSTALLER_ENTRYPOINT).toBe(`bin/${CANONICAL_INSTALLER}.mjs`);
  });
});

describe("the installed manifest separates canonical from legacy", () => {
  const manifest = createInstalledManifest({ version: "9.9.9", bundleName: "oh-my-pm-v9.9.9" });

  it("lists the canonical pair under commands", () => {
    expect(Object.keys(manifest.commands)).toEqual(CANONICAL_INSTALLED_COMMANDS);
  });

  it("lists the aliases under legacyCommands, never mixed in", () => {
    expect(Object.keys(manifest.legacyCommands)).toEqual(LEGACY_INSTALLED_COMMANDS);
    for (const legacy of LEGACY_INSTALLED_COMMANDS) {
      expect(manifest.commands).not.toHaveProperty(legacy);
    }
  });

  it("keeps product identity out of the command migration", () => {
    // The migration renames commands only. These four facts must not move.
    expect(manifest.product).toBe("oh-my-pm");
    expect(manifest.bundle).toBe("oh-my-pm-v9.9.9");
    expect(manifest.versionRoot).toBe("lib/oh-my-pm/versions/9.9.9");
    expect(COMMAND_SURFACE.product).toBe("oh-my-pm");
  });
});

describe("generated MCP configuration matches the manifest", () => {
  it("invokes the canonical MCP command", async () => {
    const { MCP_CONFIG_COMMAND_NAME, MCP_CONFIG_LEGACY_COMMAND_NAMES } =
      await import("../../cli/dist/index.js");
    expect(MCP_CONFIG_COMMAND_NAME).toBe(CANONICAL_MCP);
    expect([...MCP_CONFIG_LEGACY_COMMAND_NAMES]).toEqual(LEGACY_MCP);
  });

  it("keeps the default server key as the product name, not a command", async () => {
    const { MCP_CONFIG_DEFAULT_SERVER_NAME } = await import("../../cli/dist/index.js");
    expect(MCP_CONFIG_DEFAULT_SERVER_NAME).toBe(COMMAND_SURFACE.product);
    expect(MCP_CONFIG_DEFAULT_SERVER_NAME).not.toBe(CANONICAL_MCP);
  });
});

describe("release metadata declares both families distinctly", () => {
  it("names canonicalCommands and legacyAliases as separate fields", () => {
    const utils = readFileSync(join(toolsDir, "release-bundle-utils.mjs"), "utf8");
    expect(utils).toContain("canonicalCommands");
    expect(utils).toContain("legacyAliases");
    expect(utils).toContain("commandRemovalScheduled");
  });

  it("keeps the bundle name product-based, never command-based", () => {
    const utils = readFileSync(join(toolsDir, "release-bundle-utils.mjs"), "utf8");
    expect(utils).toContain("`oh-my-pm-v${RELEASE_BUNDLE_VERSION}`");
    expect(utils).not.toContain("ohmypm-v");
  });
});

describe("the deprecation contract", () => {
  it("declares 0.5.0 as the deprecation point with no removal scheduled", () => {
    expect(COMMAND_SURFACE.deprecatedSince).toBe("0.5.0");
    expect(COMMAND_SURFACE.removalScheduled).toBe(false);
  });

  it("keeps canonical and legacy name sets disjoint", () => {
    for (const legacy of ALL_INSTALLED_COMMANDS.filter((n) =>
      LEGACY_INSTALLED_COMMANDS.includes(n),
    )) {
      expect(CANONICAL_INSTALLED_COMMANDS).not.toContain(legacy);
    }
  });
});
