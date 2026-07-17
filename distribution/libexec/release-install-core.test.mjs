import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  RELEASE_INSTALL_MANIFEST_SCHEMA_VERSION,
  createInstalledManifest,
  createPosixShim,
  createWindowsShim,
  formatReleaseInstallPlan,
  isCanonicalSemver,
  parseReleaseInstallArgs,
  readReleaseBundleIdentity,
  resolveReleaseInstallPlan,
  serializeInstalledManifest,
  validateReleaseBundleForInstall,
} from "./release-install-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;

const dirs = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A minimal but structurally valid bundle-shaped fixture. Not a real bundle
// (no runnable CLI), used only for pure/validation-shape tests that never apply.
function writeFixtureBundle(root, version) {
  const bundleName = `oh-my-pm-v${version}`;
  const bundleDir = join(root, bundleName);
  mkdirSync(join(bundleDir, "bin"), { recursive: true });
  mkdirSync(join(bundleDir, "libexec"), { recursive: true });
  mkdirSync(
    join(bundleDir, "node_modules", "@oh-my-pm", "kernel", "generated-node"),
    { recursive: true },
  );
  const files = {
    "bin/oh-my-pm.mjs": "// cli\n",
    "bin/oh-my-pm-mcp.mjs": "// mcp\n",
    "bin/oh-my-pm-install.mjs": "// install\n",
    "libexec/release-install-core.mjs": "// core\n",
    "libexec/check-release-bundle.mjs": "// verifier\n",
    "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel.js": "// wasm js\n",
    "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel_bg.wasm": "\0wasm",
  };
  const release = {
    name: "OH MY PM",
    version,
    bundle: bundleName,
    node: ">=20",
    commands: ["oh-my-pm", "oh-my-pm-mcp"],
    cliWorkflows: ["brief", "risks", "next", "handoff"],
    mcpTools: ["project_brief", "project_risks", "project_next", "project_handoff"],
    transport: "stdio",
    readOnly: true,
    installer: {
      entrypoint: "bin/oh-my-pm-install.mjs",
      previewFirst: true,
      prefixRequired: true,
      applyFlag: "--apply",
      forceFlag: "--force",
      network: false,
      shellProfileWrites: false,
      clientConfigWrites: false,
      projectWrites: false,
    },
  };
  files["RELEASE.json"] = `${JSON.stringify(release, null, 2)}\n`;
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(bundleDir, ...rel.split("/")), content);
  }
  return bundleDir;
}

// -----------------------------------------------------------------------------

describe("isCanonicalSemver", () => {
  it("accepts canonical release and prerelease versions", () => {
    expect(isCanonicalSemver("1.0.0")).toBe(true);
    expect(isCanonicalSemver("0.2.0-alpha.0")).toBe(true);
    expect(isCanonicalSemver(CANONICAL_VERSION)).toBe(true);
  });
  it("rejects non-canonical versions", () => {
    expect(isCanonicalSemver("v1.0.0")).toBe(false);
    expect(isCanonicalSemver("1.0")).toBe(false);
    expect(isCanonicalSemver("01.0.0")).toBe(false);
    expect(isCanonicalSemver("1.0.0-")).toBe(false);
    expect(isCanonicalSemver(" 1.0.0 ")).toBe(false);
    expect(isCanonicalSemver(42)).toBe(false);
  });
});

describe("parseReleaseInstallArgs", () => {
  it("requires --prefix", () => {
    expect(parseReleaseInstallArgs([])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--apply"])).toMatchObject({ ok: false });
  });
  it("accepts a prefix and defaults to preview", () => {
    expect(parseReleaseInstallArgs(["--prefix", "/p"])).toMatchObject({
      ok: true,
      prefix: "/p",
      apply: false,
      force: false,
      outputMode: "brief",
    });
  });
  it("rejects a missing prefix value", () => {
    expect(parseReleaseInstallArgs(["--prefix"])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--prefix", "--apply"])).toMatchObject({ ok: false });
  });
  it("rejects duplicate options", () => {
    expect(parseReleaseInstallArgs(["--prefix", "a", "--prefix", "b"])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--prefix", "a", "--apply", "--apply"])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--prefix", "a", "--json", "--json"])).toMatchObject({ ok: false });
  });
  it("rejects unknown options and positional arguments", () => {
    expect(parseReleaseInstallArgs(["--prefix", "a", "--nope"])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--prefix", "a", "extra"])).toMatchObject({ ok: false });
  });
  it("requires --apply for --force", () => {
    expect(parseReleaseInstallArgs(["--prefix", "a", "--force"])).toMatchObject({ ok: false });
    expect(parseReleaseInstallArgs(["--prefix", "a", "--apply", "--force"])).toMatchObject({
      ok: true,
      apply: true,
      force: true,
    });
  });
  it("supports JSON mode", () => {
    expect(parseReleaseInstallArgs(["--prefix", "a", "--json"])).toMatchObject({
      ok: true,
      outputMode: "json",
    });
  });
  it("rejects --bundle unless allowed", () => {
    expect(parseReleaseInstallArgs(["--prefix", "a", "--bundle", "b"])).toMatchObject({ ok: false });
    expect(
      parseReleaseInstallArgs(["--prefix", "a", "--bundle", "b"], { allowBundle: true }),
    ).toMatchObject({ ok: true, bundle: "b" });
  });
  it("requires --bundle for the repository wrapper", () => {
    expect(
      parseReleaseInstallArgs(["--prefix", "a"], { allowBundle: true, requireBundle: true }),
    ).toMatchObject({ ok: false });
  });
});

describe("createPosixShim", () => {
  it("is a /bin/sh launcher resolving its own bin dir and forwarding args", () => {
    const shim = createPosixShim(`../lib/oh-my-pm/versions/${CANONICAL_VERSION}/bin/oh-my-pm.mjs`);
    expect(shim.startsWith("#!/bin/sh")).toBe(true);
    expect(shim).toContain('dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)');
    expect(shim).toContain(`exec node "$dir/../lib/oh-my-pm/versions/${CANONICAL_VERSION}/bin/oh-my-pm.mjs" "$@"`);
    expect(shim).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    expect(shim.endsWith("\n")).toBe(true);
  });
  it("rejects a target with a newline", () => {
    expect(() => createPosixShim("a\nb")).toThrow();
  });
});

describe("createWindowsShim", () => {
  it("is a .cmd launcher with CRLF endings forwarding %*", () => {
    const shim = createWindowsShim(`../lib/oh-my-pm/versions/${CANONICAL_VERSION}/bin/oh-my-pm.mjs`);
    expect(shim.startsWith("@echo off\r\n")).toBe(true);
    expect(shim).toContain(`node "%~dp0..\\lib\\oh-my-pm\\versions\\${CANONICAL_VERSION}\\bin\\oh-my-pm.mjs" %*`);
    expect(shim).toContain("\r\n");
    expect(shim).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\[a-z]/i);
  });
});

describe("createInstalledManifest", () => {
  it("is deterministic with no timestamps or environment fields", () => {
    const manifest = createInstalledManifest({ version: CANONICAL_VERSION, bundleName: `oh-my-pm-v${CANONICAL_VERSION}` });
    expect(manifest).toEqual({
      schemaVersion: RELEASE_INSTALL_MANIFEST_SCHEMA_VERSION,
      product: "oh-my-pm",
      version: CANONICAL_VERSION,
      bundle: `oh-my-pm-v${CANONICAL_VERSION}`,
      activeVersion: CANONICAL_VERSION,
      versionRoot: `lib/oh-my-pm/versions/${CANONICAL_VERSION}`,
      commands: { "oh-my-pm": "bin/oh-my-pm", "oh-my-pm-mcp": "bin/oh-my-pm-mcp" },
      source: { kind: "release-bundle", verified: true },
    });
    const text = serializeInstalledManifest(manifest);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/timestamp|hostname|username/);
    expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    // Deterministic key order.
    expect(Object.keys(manifest)).toEqual([
      "schemaVersion",
      "product",
      "version",
      "bundle",
      "activeVersion",
      "versionRoot",
      "commands",
      "source",
    ]);
  });
});

describe("readReleaseBundleIdentity", () => {
  it("reads the declared version and bundle name", () => {
    const root = tempDir("omp-identity-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    expect(readReleaseBundleIdentity(bundle)).toMatchObject({
      ok: true,
      version: CANONICAL_VERSION,
      bundleName: `oh-my-pm-v${CANONICAL_VERSION}`,
    });
  });
  it("reports missing and invalid RELEASE.json", () => {
    const root = tempDir("omp-identity-bad-");
    expect(readReleaseBundleIdentity(root)).toMatchObject({ ok: false });
    mkdirSync(join(root, "b"));
    writeFileSync(join(root, "b", "RELEASE.json"), "{not json");
    expect(readReleaseBundleIdentity(join(root, "b"))).toMatchObject({ ok: false });
  });
});

describe("validateReleaseBundleForInstall (shape checks)", () => {
  // These use a structurally valid but non-runnable fixture; they never apply.
  // The shipped verifier line fails on a fixture (fake libexec), so we assert
  // specific reasons appear, not overall ok. The real end-to-end suite uses a
  // genuine bundle for ok:true.
  it("rejects an invalid RELEASE.json version", () => {
    const root = tempDir("omp-val-ver-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    const release = JSON.parse(readFileSync(join(bundle, "RELEASE.json"), "utf8"));
    release.version = "not-semver";
    writeFileSync(join(bundle, "RELEASE.json"), `${JSON.stringify(release, null, 2)}\n`);
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("release_version_invalid");
  });
  it("rejects a bundle-name mismatch", () => {
    const root = tempDir("omp-val-name-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    const release = JSON.parse(readFileSync(join(bundle, "RELEASE.json"), "utf8"));
    release.bundle = "wrong";
    writeFileSync(join(bundle, "RELEASE.json"), `${JSON.stringify(release, null, 2)}\n`);
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("release_bundle_name_mismatch");
  });
  it("rejects readOnly false and non-stdio transport", () => {
    const root = tempDir("omp-val-ro-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    const release = JSON.parse(readFileSync(join(bundle, "RELEASE.json"), "utf8"));
    release.readOnly = false;
    release.transport = "http";
    writeFileSync(join(bundle, "RELEASE.json"), `${JSON.stringify(release, null, 2)}\n`);
    const reasons = validateReleaseBundleForInstall(bundle).reasons;
    expect(reasons).toContain("release_read_only_not_true");
    expect(reasons).toContain("release_transport_not_stdio");
  });
  it("rejects missing installer metadata", () => {
    const root = tempDir("omp-val-inst-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    const release = JSON.parse(readFileSync(join(bundle, "RELEASE.json"), "utf8"));
    delete release.installer;
    writeFileSync(join(bundle, "RELEASE.json"), `${JSON.stringify(release, null, 2)}\n`);
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("release_installer_metadata_missing");
  });
  it("rejects a missing installer entrypoint file", () => {
    const root = tempDir("omp-val-entry-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    rmSync(join(bundle, "bin", "oh-my-pm-install.mjs"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain(
      "required_file_missing:bin/oh-my-pm-install.mjs",
    );
  });
  it("rejects a missing core", () => {
    const root = tempDir("omp-val-core-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    rmSync(join(bundle, "libexec", "release-install-core.mjs"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain(
      "required_file_missing:libexec/release-install-core.mjs",
    );
  });
  it("rejects a missing verifier", () => {
    const root = tempDir("omp-val-verif-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    rmSync(join(bundle, "libexec", "check-release-bundle.mjs"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain(
      "required_file_missing:libexec/check-release-bundle.mjs",
    );
  });
  it("rejects a missing WASM binary", () => {
    const root = tempDir("omp-val-wasm-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    rmSync(join(bundle, "node_modules", "@oh-my-pm", "kernel", "generated-node", "oh_my_pm_kernel_bg.wasm"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain(
      "required_file_missing:node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel_bg.wasm",
    );
  });
  it("rejects a missing SHA256SUMS", () => {
    const root = tempDir("omp-val-sums-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    // no SHA256SUMS written by the fixture
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("sha256sums_missing");
  });
  it("rejects an escaping symlink", () => {
    const root = tempDir("omp-val-esc-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    const outside = join(root, "outside.txt");
    writeFileSync(outside, "x");
    symlinkSync(outside, join(bundle, "escape-link"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("bundle_symlink_escape");
  });
  it("rejects a dangling symlink", () => {
    const root = tempDir("omp-val-dangle-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    symlinkSync(join(bundle, "does-not-exist"), join(bundle, "dangle-link"));
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("bundle_dangling_symlink");
  });
  it("rejects a forbidden private path", () => {
    const root = tempDir("omp-val-forbidden-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    mkdirSync(join(bundle, "_dev"));
    writeFileSync(join(bundle, "_dev", "secret.txt"), "x");
    expect(validateReleaseBundleForInstall(bundle).reasons).toContain("bundle_forbidden_path");
  });
});

describe("resolveReleaseInstallPlan (source validation gates)", () => {
  it("blocks when the source bundle is invalid", () => {
    const root = tempDir("omp-plan-src-");
    const bundle = writeFixtureBundle(root, CANONICAL_VERSION);
    rmSync(join(bundle, "libexec", "release-install-core.mjs"));
    const prefix = tempDir("omp-plan-prefix-");
    const plan = resolveReleaseInstallPlan({ bundleRoot: bundle, prefix, apply: false, force: false });
    expect(plan.ok).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons.some((r) => r.startsWith("source:"))).toBe(true);
    // Preview performs no writes.
    expect(existsSync(join(prefix, "bin"))).toBe(false);
    expect(existsSync(join(prefix, "lib"))).toBe(false);
  });
});

describe("formatReleaseInstallPlan", () => {
  it("emits exactly one trailing newline in JSON mode", () => {
    const plan = { ok: true, version: "1.0.0", action: "create", prefix: "/p", bundleRoot: "/b", versionDirectory: "/p/v", targets: { shims: [] }, reasons: [] };
    const out = formatReleaseInstallPlan(plan, "json");
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("}\n\n")).toBe(false);
  });
  it("renders a preview with exactly one trailing newline", () => {
    const plan = {
      ok: true,
      version: "1.0.0",
      action: "create",
      prefix: "/p",
      bundleRoot: "/b",
      versionDirectory: "/p/lib/oh-my-pm/versions/1.0.0",
      apply: false,
      targets: { shims: ["/p/bin/oh-my-pm", "/p/bin/oh-my-pm.cmd"] },
      reasons: [],
    };
    const out = formatReleaseInstallPlan(plan, "brief");
    expect(out).toContain("OH MY PM release installation: preview");
    expect(out).toContain("action: create");
    expect(out).toContain("apply required: yes");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
  it("renders an already-installed result", () => {
    const plan = { ok: true, version: "1.0.0", action: "already-installed", prefix: "/p", bundleRoot: "/b", targets: { shims: [] }, reasons: [] };
    const out = formatReleaseInstallPlan(plan, "brief");
    expect(out).toContain("OH MY PM release installation: already installed");
    expect(out).toContain("apply required: no");
  });
});
