import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  chmodSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeSubprocessResult } from "./test-subprocess-diagnostics.mjs";
import {
  applyReleaseInstallPlan,
  evaluatePostInstallState,
  requiresPosixShimExecutableMode,
  resolveReleaseInstallPlan,
} from "../distribution/libexec/release-install-core.mjs";
import { createInstalledCommandInvocation } from "./check-release-install.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");
const installedCheck = join(repoRoot, "tools", "check-release-install.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const isWindows = process.platform === "win32";

const roots = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    diagnostics: describeSubprocessResult(script, args, r),
  };
}

/** Whether a path is a regular file (never following a symlink). */
function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** The relative paths a bundle's SHA256SUMS manifest lists, in file order. */
function listedManifestPaths(bundleDir) {
  return readFileSync(join(bundleDir, "SHA256SUMS"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => /^([0-9a-f]{64}) {2}(.+)$/.exec(line))
    .filter((m) => m !== null)
    .map((m) => m[2]);
}

/** Assert a fixture subprocess succeeded, surfacing its full diagnostics. */
function expectFixtureSuccess(result) {
  expect(result.status, result.diagnostics).toBe(0);
}
function installBundle() {
  // Build a fresh bundle outside the repository so tests exercise source
  // independence, then relocate it to a location the source repo does not own.
  // Returns the bundle directory plus the exact owned root that contains it, so
  // "source removal" tests delete that exact root — never an inferred parent.
  const out = tempDir("omp-e2e-build-");
  expectFixtureSuccess(run(buildBundle, ["--output", out, "--apply"]));
  const root = tempDir("omp-e2e-bundle-");
  const dir = join(root, BUNDLE_NAME);
  renameSync(join(out, BUNDLE_NAME), dir);
  return { dir, root };
}

let bundle;

beforeAll(() => {
  bundle = installBundle();
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("release install e2e", () => {
  it("preview creates no prefix", () => {
    const prefix = join(tempDir("omp-e2e-prev-"), "prefix");
    const preview = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain("action: create");
    expect(existsSync(prefix)).toBe(false);
  }, 60_000);

  it("apply creates the canonical layout and installs from a source that can be removed", () => {
    const parent = tempDir("omp-e2e-apply-");
    const prefix = join(parent, "prefix");

    const apply = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]);
    expect(apply.status, apply.stderr).toBe(0);

    // Canonical layout.
    const versionDir = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    expect(existsSync(versionDir)).toBe(true);
    for (const shim of ["oh-my-pm", "oh-my-pm.cmd", "oh-my-pm-mcp", "oh-my-pm-mcp.cmd"]) {
      expect(existsSync(join(prefix, "bin", shim)), shim).toBe(true);
    }
    const manifest = JSON.parse(
      readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8"),
    );
    expect(manifest.version).toBe(CANONICAL_VERSION);
    expect(manifest.activeVersion).toBe(CANONICAL_VERSION);

    // POSIX shims executable.
    if (!isWindows) {
      for (const shim of ["oh-my-pm", "oh-my-pm-mcp"]) {
        expect((lstatSync(join(prefix, "bin", shim)).mode & 0o111) !== 0, shim).toBe(true);
      }
    }

    // Installed-state verifier passes.
    const check = run(installedCheck, ["--prefix", prefix]);
    expect(check.stderr, check.stderr).toBe("");
    expect(check.status).toBe(0);
    expect(check.stdout).toBe(`OH MY PM release installation check: OK (${CANONICAL_VERSION})\n`);

    // Manifest embeds no absolute path.
    const manifestText = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestText).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
  }, 120_000);

  it("keeps the source bundle unchanged after apply", () => {
    const prefix = join(tempDir("omp-e2e-srcstable-"), "prefix");
    // The shared bundle is only read here, never removed.
    const before = readFileSync(join(bundle.dir, "SHA256SUMS"), "utf8");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const after = readFileSync(join(bundle.dir, "SHA256SUMS"), "utf8");
    expect(after).toBe(before);
  }, 120_000);

  it("installed commands survive source removal and full prefix relocation", () => {
    const localBundle = installBundle();
    const parent = tempDir("omp-e2e-reloc-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", localBundle.dir, "--prefix", prefix, "--apply"]).status).toBe(
      0,
    );

    // Remove the source bundle entirely by deleting its exact owned root
    // (never an inferred parent of the bundle directory).
    rmSync(localBundle.root, { recursive: true, force: true });

    const cliCmd = join(prefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const status = spawnSync(cliCmd, ["status"], { encoding: "utf8" });
    expect(status.stdout).toContain(`version: ${CANONICAL_VERSION}`);
    expect(status.stdout).toContain(`kernel: ${CANONICAL_VERSION}`);

    // Relocate the entire prefix and re-run through the relative shims.
    const movedParent = tempDir("omp-e2e-reloc-moved-");
    const movedPrefix = join(movedParent, "prefix");
    renameSync(prefix, movedPrefix);
    const movedCli = join(movedPrefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const movedStatus = spawnSync(movedCli, ["status"], { encoding: "utf8" });
    expect(movedStatus.stdout).toContain(`version: ${CANONICAL_VERSION}`);

    // Installed-state verifier passes from the moved prefix.
    expect(run(installedCheck, ["--prefix", movedPrefix]).status).toBe(0);
  }, 180_000);

  it("is idempotent: a second apply from the same bundle is already-installed and writes nothing new", () => {
    const parent = tempDir("omp-e2e-idem-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const manifestBefore = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");

    const second = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("already installed");
    const manifestAfter = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestAfter).toBe(manifestBefore);
  }, 120_000);

  it("blocks drift without --force and preserves unrelated prefix files under --force", () => {
    const parent = tempDir("omp-e2e-force-");
    const prefix = join(parent, "prefix");
    const localBundle = bundle.dir;
    expect(run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Unrelated files that force must preserve.
    writeFileSync(join(prefix, "bin", "unrelated-tool"), "keepme\n");
    mkdirSync(join(prefix, "lib", "other"), { recursive: true });
    writeFileSync(join(prefix, "lib", "other", "note.txt"), "unrelated\n");

    // Introduce drift in a managed shim.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "corrupted\n");

    // Blocked without force. A plan that fails to resolve is rendered to stdout
    // (action: blocked) and exits 2; the stderr "blocked" line is reserved for a
    // block detected inside apply-time revalidation.
    const blocked = run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]);
    expect(blocked.status).toBe(2);
    expect(`${blocked.stdout}${blocked.stderr}`).toContain("blocked");

    // Force replaces exact managed targets only.
    const forced = run(wrapper, [
      "--bundle",
      localBundle,
      "--prefix",
      prefix,
      "--apply",
      "--force",
    ]);
    expect(forced.status, forced.stderr).toBe(0);

    // Unrelated files preserved.
    expect(readFileSync(join(prefix, "bin", "unrelated-tool"), "utf8")).toBe("keepme\n");
    expect(readFileSync(join(prefix, "lib", "other", "note.txt"), "utf8")).toBe("unrelated\n");

    // Managed shim repaired and install verifies.
    expect(readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8").startsWith("#!/bin/sh")).toBe(
      true,
    );
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 240_000);

  it("does not create shell profiles, MCP client config, or project files", () => {
    const parent = tempDir("omp-e2e-noextra-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    // Only bin/ and lib/ appear directly under the prefix.
    const top = readdirSync(prefix).sort();
    expect(top).toEqual(["bin", "lib"]);
  }, 120_000);
});

// The Windows-only post_install_verification_failed regression: the installer
// intentionally does not chmod POSIX shims on Windows, so exact-state detection
// and post-install verification must not require the POSIX executable bit there,
// while still enforcing it on Linux/macOS. This test runs on every platform by
// injecting the target platform, so it protects the fix regardless of the host.
describe("platform-aware installed-state (post_install regression)", () => {
  const posixShims = ["oh-my-pm", "oh-my-pm-mcp"];

  it("exposes the platform executable-mode policy", () => {
    expect(requiresPosixShimExecutableMode("win32")).toBe(false);
    expect(requiresPosixShimExecutableMode("linux")).toBe(true);
    expect(requiresPosixShimExecutableMode("darwin")).toBe(true);
  });

  it("classifies a valid install as already-installed on Windows without POSIX exec bits", () => {
    const prefix = join(tempDir("omp-e2e-plat-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);

    const winPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "win32",
    });
    expect(winPlan.ok, JSON.stringify(winPlan.reasons)).toBe(true);
    expect(winPlan.action).toBe("already-installed");
    // Platform must never leak into public plan output.
    expect(Object.keys(winPlan)).not.toContain("platform");
  });

  it("blocks on Linux when POSIX shims lack executable bits, then passes once restored", () => {
    const prefix = join(tempDir("omp-e2e-plat2-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Baseline: a freshly applied prefix (exec bits set by apply on this POSIX
    // host) is already-installed under every platform.
    for (const platform of ["win32", "linux", "darwin"]) {
      const plan = resolveReleaseInstallPlan({
        bundleRoot: bundle.dir,
        prefix,
        apply: false,
        force: false,
        platform,
      });
      expect(plan.action, platform).toBe("already-installed");
    }

    // Strip the POSIX executable bits (simulating a Windows-applied prefix).
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o644);

    // Windows: still already-installed (mode not required).
    const winPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "win32",
    });
    expect(winPlan.action).toBe("already-installed");

    // Linux: blocked, with the precise mode reason (not a content mismatch).
    const linuxPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "linux",
    });
    expect(linuxPlan.ok).toBe(false);
    expect(linuxPlan.action).toBe("blocked");
    expect(linuxPlan.reasons).toContain("posix_shim_not_executable");
    expect(linuxPlan.reasons).not.toContain("shim_content_mismatch");

    // Restore exec bits: Linux is already-installed again.
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o755);
    const restored = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "linux",
    });
    expect(restored.action).toBe("already-installed");
  });

  it("evaluatePostInstallState passes on Windows for a valid prefix and reports safe reasons on drift", () => {
    const prefix = join(tempDir("omp-e2e-plat3-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const versionDirectory = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);

    // Valid prefix passes on every platform.
    for (const platform of ["win32", "linux", "darwin"]) {
      const post = evaluatePostInstallState({
        bundleRoot: bundle.dir,
        prefix,
        versionDirectory,
        platform,
      });
      expect(post.ok, `${platform}:${JSON.stringify(post.reasons)}`).toBe(true);
      expect(post.bundleVerifier.ok).toBe(true);
      expect(post.installedState.action).toBe("already-installed");
    }

    // Strip exec bits: Windows still ok; Linux fails with the bounded mode reason.
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o644);
    const winPost = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "win32",
    });
    expect(winPost.ok).toBe(true);
    const linuxPost = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "linux",
    });
    expect(linuxPost.ok).toBe(false);
    expect(linuxPost.reasons).toContain("post_installed_state_not_exact");
    expect(linuxPost.reasons).toContain("post_posix_shim_mode_mismatch");
    // No path, file content, or subprocess output leaks in the reasons.
    const serialized = JSON.stringify(linuxPost.reasons);
    expect(serialized).not.toContain(prefix);
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
  });

  it("post-check reports a shim content mismatch distinctly from a mode mismatch", () => {
    const prefix = join(tempDir("omp-e2e-plat4-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const versionDirectory = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    // Corrupt a shim's content.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "corrupted\n");
    const post = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "win32",
    });
    expect(post.ok).toBe(false);
    expect(post.reasons).toContain("post_shim_content_mismatch");
    expect(post.reasons).not.toContain("post_posix_shim_mode_mismatch");
  });
});

// Prove the installed-runtime launch policy against a real installed prefix on
// every host: Windows-mode launches must use the Node executable plus the
// installed .mjs entrypoints (never the .cmd shim, never a shell), POSIX-mode
// launches must use the installed shims, and the four exact shims plus the two
// .mjs entrypoints must all be present regular files.
describe("installed-runtime launch policy (Windows-safe invocation)", () => {
  it("Windows-mode uses Node + installed .mjs; POSIX-mode uses installed shims", () => {
    const prefix = join(tempDir("omp-e2e-launch-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const binDir = join(prefix, "bin");
    const versionDir = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    const cliEntry = join(versionDir, "bin", "oh-my-pm.mjs");
    const mcpEntry = join(versionDir, "bin", "oh-my-pm-mcp.mjs");

    // Mandatory exact four-shim presence plus the two installed .mjs targets.
    for (const shim of ["oh-my-pm", "oh-my-pm.cmd", "oh-my-pm-mcp", "oh-my-pm-mcp.cmd"]) {
      expect(lstatSync(join(binDir, shim)).isFile(), shim).toBe(true);
    }
    expect(lstatSync(cliEntry).isFile()).toBe(true);
    expect(lstatSync(mcpEntry).isFile()).toBe(true);

    const node = process.execPath;
    // Windows CLI: node <installed cli .mjs> <args...>
    const winCli = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable: node,
      shimPath: join(binDir, "oh-my-pm.cmd"),
      entrypoint: cliEntry,
      args: ["status"],
    });
    expect(winCli.command).toBe(node);
    expect(winCli.args).toEqual([cliEntry, "status"]);
    expect(existsSync(winCli.args[0])).toBe(true);
    expect(winCli.command.endsWith(".cmd")).toBe(false);

    // Windows MCP: node <installed mcp .mjs>
    const winMcp = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable: node,
      shimPath: join(binDir, "oh-my-pm-mcp.cmd"),
      entrypoint: mcpEntry,
      args: [],
    });
    expect(winMcp.command).toBe(node);
    expect(winMcp.args).toEqual([mcpEntry]);
    expect(existsSync(winMcp.args[0])).toBe(true);

    // POSIX CLI/MCP: the installed shim itself, no Node prefix.
    for (const [shimName, entry] of [
      ["oh-my-pm", cliEntry],
      ["oh-my-pm-mcp", mcpEntry],
    ]) {
      const posix = createInstalledCommandInvocation({
        platform: "linux",
        nodeExecutable: node,
        shimPath: join(binDir, shimName),
        entrypoint: entry,
        args: ["status"],
      });
      expect(posix.command).toBe(join(binDir, shimName));
      expect(posix.args).toEqual(["status"]);
    }

    // Every launched entrypoint lives under the installed version directory,
    // never the source repository and never node_modules/.bin.
    expect(cliEntry.startsWith(versionDir)).toBe(true);
    expect(mcpEntry.startsWith(versionDir)).toBe(true);
    expect(cliEntry).not.toContain("node_modules");
  });
});

// -----------------------------------------------------------------------------
// Bundle-level SHA256SUMS tampering (F-05).
//
// The installer's checksum pass is the layer that makes a bundle's manifest
// binding: a bundle whose contents disagree with its own SHA256SUMS must never
// install, no matter how it disagrees. Four distinct tamper shapes each map to
// their own reason code, so a rejection says *how* the bundle was wrong rather
// than only that it was.
//
// Every case is proved against a real built bundle (not a hand-written fixture)
// copied into its own temp directory, so the tampering is confined and the
// shared bundle the rest of this file depends on is never mutated.
//
// Note on the fourth code: the installer emits `sha256sums_lists_missing_file`
// for a manifest entry with no corresponding file. The v0.6.3 planning docs
// refer to it as `sha256sums_lists_missing`; the production string is the
// authority and is asserted verbatim here.
describe("bundle checksum tampering is rejected (F-05)", () => {
  const SUMS_LINE = /^([0-9a-f]{64}) {2}(.+)$/;

  /**
   * Copy the shared bundle into a fresh temp root so a tamper case can mutate
   * it freely. Returns the disposable bundle directory plus the owned root, so
   * confinement can be asserted against the exact root the case owns.
   */
  function disposableBundle(prefixLabel) {
    const root = tempDir(`omp-e2e-tamper-${prefixLabel}-`);
    const dir = join(root, BUNDLE_NAME);
    cpSync(bundle.dir, dir, { recursive: true, dereference: false, verbatimSymlinks: true });
    return { dir, root };
  }

  function readSums(bundleDir) {
    return readFileSync(join(bundleDir, "SHA256SUMS"), "utf8");
  }
  function writeSums(bundleDir, text) {
    writeFileSync(join(bundleDir, "SHA256SUMS"), text);
  }

  /** The manifest's listed relative paths, in file order. */
  function listedPaths(bundleDir) {
    return readSums(bundleDir)
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => SUMS_LINE.exec(line))
      .filter((m) => m !== null)
      .map((m) => m[2]);
  }

  /**
   * Drive the real installer wrapper against a tampered bundle and assert the
   * full security contract for that tamper case:
   *
   *   - the exact expected reason code is emitted (prefixed `source:`, which is
   *     how resolveReleaseInstallPlan namespaces source-bundle failures),
   *   - the failure is detected before any write -- the prefix is not created,
   *   - `--force` does not bypass it,
   *   - no absolute host path appears in the reported reasons,
   *   - the tampering stayed inside the case's own temp root.
   *
   * The plan is resolved through the shipped core *and* through the installer
   * CLI, so neither path can regress independently.
   */
  function expectTamperRejected({ bundleDir, ownedRoot, reason }) {
    const parent = tempDir("omp-e2e-tamper-prefix-");
    const prefix = join(parent, "prefix");

    // 1. The core's own plan resolution blocks with the exact reason.
    const plan = resolveReleaseInstallPlan({
      bundleRoot: bundleDir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons).toContain(`source:${reason}`);

    // 2. Reasons stay path-free: no absolute host path, and specifically
    //    neither the bundle nor the destination prefix.
    const serializedReasons = JSON.stringify(plan.reasons);
    expect(serializedReasons).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
    expect(serializedReasons).not.toContain(bundleDir);
    expect(serializedReasons).not.toContain(prefix);
    expect(serializedReasons).not.toContain(tmpdir());

    // 3. Preview wrote nothing.
    expect(existsSync(prefix)).toBe(false);

    // 4. --apply is refused, still before any write.
    const applied = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(2);
    expect(`${applied.stdout}${applied.stderr}`).toContain(`source:${reason}`);
    expect(existsSync(prefix)).toBe(false);

    // 5. --force does NOT bypass an integrity failure. Force only authorizes
    //    replacing exact managed targets; it can never authorize installing a
    //    bundle that fails its own checksum manifest.
    const forced = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply", "--force"]);
    expect(forced.status, forced.diagnostics).toBe(2);
    expect(`${forced.stdout}${forced.stderr}`).toContain(`source:${reason}`);

    // 6. Destination is untouched by every attempt above: no prefix, and so no
    //    bin/, lib/, version directory, or install manifest.
    expect(existsSync(prefix)).toBe(false);
    expect(existsSync(join(prefix, "bin"))).toBe(false);
    expect(existsSync(join(prefix, "lib"))).toBe(false);
    expect(existsSync(join(prefix, "lib", "oh-my-pm", "install.json"))).toBe(false);

    // 7. The fixture stayed confined to its own temp root, and the shared
    //    bundle every other test depends on was never touched.
    expect(bundleDir.startsWith(ownedRoot)).toBe(true);
    expect(bundleDir.startsWith(bundle.dir)).toBe(false);
    expect(existsSync(join(bundle.dir, "SHA256SUMS"))).toBe(true);
  }

  // A. A regular file listed in SHA256SUMS no longer hashes to its listed
  //    digest. This is the classic post-signing content swap.
  it("A. rejects a modified listed file with sha256sums_checksum_mismatch", () => {
    const { dir, root } = disposableBundle("mismatch");
    const target = join(dir, "RELEASE.json");
    expect(listedPaths(dir)).toContain("RELEASE.json");

    // Flip one byte of a listed regular file, preserving its length so only the
    // digest changes. RELEASE.json stays syntactically valid JSON with an
    // unchanged version, so the only reason this bundle can fail is the digest.
    const original = readFileSync(target);
    const flipped = Buffer.from(original);
    // Mutate inside the "OH MY PM" name value, not a structural character, so
    // the file stays valid JSON and only its digest changes.
    const valueAt = flipped.indexOf(Buffer.from("OH MY PM"));
    expect(valueAt).toBeGreaterThanOrEqual(0);
    flipped[valueAt] = flipped[valueAt] ^ 0x20;
    expect(Buffer.compare(flipped, original)).not.toBe(0);
    expect(flipped.length).toBe(original.length);
    writeFileSync(target, flipped);

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_checksum_mismatch",
    });
  }, 120_000);

  // B. An extra regular file is smuggled into the bundle. It is not listed, so
  //    no listed digest is wrong -- completeness is what catches it.
  it("B. rejects an unlisted added regular file with sha256sums_unlisted_file", () => {
    const { dir, root } = disposableBundle("unlisted");
    const smuggled = join(dir, "libexec", "smuggled-payload.mjs");
    expect(existsSync(smuggled)).toBe(false);
    writeFileSync(smuggled, "// not listed in SHA256SUMS\n");
    expect(listedPaths(dir)).not.toContain("libexec/smuggled-payload.mjs");

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_unlisted_file",
    });
  }, 120_000);

  // C. The manifest itself is not parseable as the accepted syntax. A manifest
  //    that cannot be read must fail closed rather than be partially trusted.
  it("C. rejects a malformed SHA256SUMS line with sha256sums_malformed", () => {
    const { dir, root } = disposableBundle("malformed");
    const lines = readSums(dir).split("\n");
    const firstIndex = lines.findIndex((line) => SUMS_LINE.test(line));
    expect(firstIndex).toBeGreaterThanOrEqual(0);

    // Corrupt the digest field so the line no longer matches the accepted
    // `<64 lowercase hex><2 spaces><path>` syntax, while still looking
    // superficially like a manifest line.
    const [, digest, rel] = SUMS_LINE.exec(lines[firstIndex]);
    expect(digest).toHaveLength(64);
    lines[firstIndex] = `not-a-sha256-digest  ${rel}`;
    expect(SUMS_LINE.test(lines[firstIndex])).toBe(false);
    writeSums(dir, lines.join("\n"));

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_malformed",
    });
  }, 120_000);

  // D. A manifest entry names a file that is not present. The remaining files
  //    all match, so only the dangling entry can explain the rejection.
  it("D. rejects a manifest entry for an absent file with sha256sums_lists_missing_file", () => {
    const { dir, root } = disposableBundle("listsmissing");

    // Pick a listed, non-required file so its removal cannot also trigger a
    // required_file_missing reason -- the dangling manifest entry must be the
    // distinguishing signal.
    const required = new Set([
      "RELEASE.json",
      "bin/omp.mjs",
      "bin/omp-mcp.mjs",
      "bin/omp-install.mjs",
      "bin/ohmypm.mjs",
      "bin/ohmypm-mcp.mjs",
      "bin/ohmypm-install.mjs",
      "bin/oh-my-pm.mjs",
      "bin/oh-my-pm-mcp.mjs",
      "bin/oh-my-pm-install.mjs",
      "libexec/release-install-core.mjs",
      "libexec/check-release-bundle.mjs",
      "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel.js",
      "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel_bg.wasm",
      "node_modules/@oh-my-pm/kernel/generated-node/package.json",
    ]);
    const victim = listedPaths(dir).find((rel) => !required.has(rel));
    expect(victim, "bundle must list at least one non-required file").toBeTruthy();

    // Delete the file but leave its manifest entry in place: the manifest now
    // lists a file the bundle does not contain.
    rmSync(join(dir, ...victim.split("/")));
    expect(existsSync(join(dir, ...victim.split("/")))).toBe(false);
    expect(listedPaths(dir)).toContain(victim);

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_lists_missing_file",
    });
  }, 120_000);

  // The untampered control: the same bundle, copied the same way, installs
  // cleanly. Without this, every assertion above could pass for the wrong
  // reason (e.g. if copying alone broke the bundle).
  it("control: an untampered copy of the same bundle still installs", () => {
    const { dir } = disposableBundle("control");
    const prefix = join(tempDir("omp-e2e-tamper-control-"), "prefix");
    const plan = resolveReleaseInstallPlan({
      bundleRoot: dir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(true);
    expect(plan.action).toBe("create");
    expect(plan.reasons).toEqual([]);

    const applied = run(wrapper, ["--bundle", dir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 180_000);
});

// -----------------------------------------------------------------------------
// Bundle symlink safety (F-04).
//
// Symlinks are a coverage gap that checksums cannot close: SHA256SUMS covers
// regular-file bytes, and a symlink has no bytes of its own to cover. The
// explicit policy is therefore that symlinks are EXCLUDED from SHA256SUMS and
// made safe by a separate invariant -- enforced independently by the installer
// and by the shipped bundle verifier.
//
// These cases prove both layers agree on all three shapes: an escaping link and
// a dangling link are each rejected by BOTH, and a benign link whose real target
// stays inside the bundle is accepted by BOTH. Every case runs against a real
// built bundle copied into its own temp root, using real filesystem symlinks.
describe("bundle symlink safety (F-04)", () => {
  /**
   * Copy the shared bundle into a fresh temp root. `verbatimSymlinks` keeps any
   * link the bundle already contains as a link rather than materializing its
   * target, so the copy is a faithful fixture base.
   */
  function disposableBundle(prefixLabel) {
    const root = tempDir(`omp-e2e-symlink-${prefixLabel}-`);
    const dir = join(root, BUNDLE_NAME);
    cpSync(bundle.dir, dir, { recursive: true, dereference: false, verbatimSymlinks: true });
    return { dir, root };
  }

  /**
   * Create a real filesystem symlink, reporting whether the platform allowed it.
   * On Windows, creating a symlink requires Developer Mode or elevation; when it
   * is refused the case is skipped rather than being weakened into a fake
   * fixture. POSIX CI always exercises the real path.
   */
  function trySymlink(target, linkPath, type) {
    try {
      symlinkSync(target, linkPath, type);
      return lstatSync(linkPath).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /** Skip-with-report helper for a platform that refused to create a symlink. */
  function reportSymlinkUnsupported(ctx, label) {
    // Only Windows may legitimately refuse; a POSIX failure is a real failure.
    expect(isWindows, `${label}: symlink creation failed on a POSIX platform`).toBe(true);
    ctx.skip();
  }

  /** Run the SHIPPED verifier (the copy inside the bundle's own libexec/). */
  function runShippedVerifier(bundleDir) {
    return run(join(bundleDir, "libexec", "check-release-bundle.mjs"), ["--bundle", bundleDir]);
  }

  /**
   * Assert that BOTH independent layers reject a bundle for the same stable
   * symlink reason, and that rejection costs the destination nothing.
   */
  function expectSymlinkRejected({ bundleDir, ownedRoot, reason, externalFile }) {
    const parent = tempDir("omp-e2e-symlink-prefix-");
    const prefix = join(parent, "prefix");

    // 1. The SHIPPED verifier rejects, naming the stable reason token.
    const verified = runShippedVerifier(bundleDir);
    expect(verified.status, verified.diagnostics).not.toBe(0);
    const verifierOutput = `${verified.stdout}${verified.stderr}`;
    expect(verifierOutput).toContain(reason);

    // 2. The verifier leaks no host/absolute path -- only the reason token.
    expect(verifierOutput).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
    expect(verifierOutput).not.toContain(bundleDir);
    expect(verifierOutput).not.toContain(tmpdir());
    if (externalFile !== undefined) {
      expect(verifierOutput).not.toContain(externalFile);
    }

    // 3. The INSTALLER independently rejects with the same reason, before any
    //    write. This is the agreement invariant: neither layer carries it alone.
    const plan = resolveReleaseInstallPlan({
      bundleRoot: bundleDir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons).toContain(`source:${reason}`);

    const serializedReasons = JSON.stringify(plan.reasons);
    expect(serializedReasons).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
    expect(serializedReasons).not.toContain(bundleDir);
    expect(serializedReasons).not.toContain(prefix);

    // 4. Preview wrote nothing, --apply is refused, and --force cannot bypass a
    //    safety failure. The prefix never comes into existence.
    expect(existsSync(prefix)).toBe(false);
    const applied = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(2);
    expect(`${applied.stdout}${applied.stderr}`).toContain(`source:${reason}`);
    expect(existsSync(prefix)).toBe(false);

    const forced = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply", "--force"]);
    expect(forced.status, forced.diagnostics).toBe(2);
    expect(`${forced.stdout}${forced.stderr}`).toContain(`source:${reason}`);

    // 5. No installation artifact of any kind was produced.
    expect(existsSync(prefix)).toBe(false);
    expect(existsSync(join(prefix, "bin"))).toBe(false);
    expect(existsSync(join(prefix, "lib"))).toBe(false);
    expect(existsSync(join(prefix, "lib", "oh-my-pm", "install.json"))).toBe(false);

    // 6. The fixture stayed inside its own root; the shared bundle is untouched.
    expect(bundleDir.startsWith(ownedRoot)).toBe(true);
    expect(bundleDir.startsWith(bundle.dir)).toBe(false);
    expect(existsSync(join(bundle.dir, "SHA256SUMS"))).toBe(true);
  }

  // A. A symlink inside the bundle whose real target lies OUTSIDE the bundle
  //    root. This is the escape shape: following it during install would read
  //    (or write through to) a location the bundle does not own.
  it("A. rejects a symlink escaping the bundle root with bundle_symlink_escape", (ctx) => {
    const { dir, root } = disposableBundle("escape");

    // The escape target lives outside the bundle directory entirely, in a root
    // this case owns, so "outside" is a real property and not a path trick.
    const outsideRoot = tempDir("omp-e2e-symlink-outside-");
    const outsideFile = join(outsideRoot, "outside-secret.txt");
    const outsideContents = "outside-the-bundle\n";
    writeFileSync(outsideFile, outsideContents);
    expect(outsideFile.startsWith(dir)).toBe(false);

    const link = join(dir, "libexec", "escaping-link.mjs");
    if (!trySymlink(outsideFile, link, "file")) {
      reportSymlinkUnsupported(ctx, "escaping symlink");
      return;
    }
    // The link really resolves out of the bundle.
    expect(realpathSync(link)).toBe(realpathSync(outsideFile));
    expect(realpathSync(link).startsWith(realpathSync(dir))).toBe(false);

    expectSymlinkRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "bundle_symlink_escape",
      externalFile: outsideFile,
    });

    // The external target was never read through, written, or removed.
    expect(existsSync(outsideFile)).toBe(true);
    expect(readFileSync(outsideFile, "utf8")).toBe(outsideContents);
  }, 180_000);

  // B. A symlink whose target does not exist. It cannot be checksummed, cannot
  //    be installed, and its target could be created later -- so it fails closed.
  it("B. rejects a dangling symlink with bundle_dangling_symlink", (ctx) => {
    const { dir, root } = disposableBundle("dangling");

    // Target inside the bundle but absent, so only "dangling" can explain the
    // rejection -- an escape reason would be the wrong diagnosis.
    const missingTarget = join(dir, "libexec", "no-such-target.mjs");
    expect(existsSync(missingTarget)).toBe(false);
    const link = join(dir, "libexec", "dangling-link.mjs");
    if (!trySymlink(missingTarget, link, "file")) {
      reportSymlinkUnsupported(ctx, "dangling symlink");
      return;
    }
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(existsSync(link)).toBe(false); // resolves to nothing

    expectSymlinkRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "bundle_dangling_symlink",
    });
  }, 180_000);

  // C. A benign symlink whose real target is an existing regular file INSIDE the
  //    bundle. This is the acceptance half of the invariant: the link is
  //    inspected -- not skipped -- and passes because it stays confined.
  it("C. accepts a benign symlink confined to the bundle root", (ctx) => {
    const { dir } = disposableBundle("benign");

    // Target a listed regular file that is not itself required, so the fixture
    // adds a link and changes nothing else about the bundle.
    const targetRel = "docs/getting-started.md";
    const target = join(dir, ...targetRel.split("/"));
    expect(isRegularFile(target)).toBe(true);

    // The link target is RELATIVE ("getting-started.md", a sibling). A bundle is
    // relocated by copy during install, so an absolute link would point back at
    // the original bundle location and become a real escape from the installed
    // copy -- which the installer's post-copy staged check correctly rejects
    // (staged_symlink_unsafe). A relative sibling link stays confined through
    // relocation, which is what a genuinely portable bundle symlink looks like.
    const linkRel = "docs/getting-started-alias.md";
    const link = join(dir, ...linkRel.split("/"));
    if (!trySymlink("getting-started.md", link, "file")) {
      reportSymlinkUnsupported(ctx, "benign symlink");
      return;
    }
    // Real target is confined inside the bundle root.
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(realpathSync(link).startsWith(realpathSync(dir))).toBe(true);

    // --- SHA256SUMS policy assertions -------------------------------------
    // The symlink itself needs NO manifest entry, and adding it must not make
    // the bundle look incomplete. Its regular target stays covered normally.
    const listed = listedManifestPaths(dir);
    expect(listed).not.toContain(linkRel);
    expect(listed).toContain(targetRel);

    // --- The shipped verifier accepts -------------------------------------
    const verified = runShippedVerifier(dir);
    expect(verified.status, verified.diagnostics).toBe(0);
    expect(verified.stdout).toBe(`OH MY PM release bundle check: OK (${CANONICAL_VERSION})\n`);
    // Specifically NOT rejected for any symlink or manifest-coverage reason:
    // the link is inspected and accepted, not silently unlisted.
    const verifierOutput = `${verified.stdout}${verified.stderr}`;
    expect(verifierOutput).not.toContain("bundle_symlink_escape");
    expect(verifierOutput).not.toContain("bundle_dangling_symlink");
    expect(verifierOutput).not.toContain("unlisted regular file present");

    // --- The installer accepts too (agreement) ----------------------------
    const prefix = join(tempDir("omp-e2e-symlink-benign-"), "prefix");
    const plan = resolveReleaseInstallPlan({
      bundleRoot: dir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(true);
    expect(plan.action).toBe("create");
    // No symlink or checksum-coverage reason appears -- notably not
    // sha256sums_unlisted_file, which an unlisted *regular* file would trigger.
    expect(plan.reasons).toEqual([]);

    const applied = run(wrapper, ["--bundle", dir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);

    // The link survived relocation as a link, still confined to the INSTALLED
    // copy's own root -- confinement is a property of the relocated bundle, not
    // only of the fixture it was built in.
    const installedRoot = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    const installedLink = join(installedRoot, ...linkRel.split("/"));
    expect(lstatSync(installedLink).isSymbolicLink()).toBe(true);
    expect(realpathSync(installedLink).startsWith(realpathSync(installedRoot))).toBe(true);

    // The target file was not disturbed by being linked to.
    expect(isRegularFile(target)).toBe(true);
  }, 180_000);

  // Control: the very same copy WITHOUT any added symlink verifies and installs.
  // Without this, an acceptance above could pass for an unrelated reason.
  it("control: the same bundle copy with no added symlink verifies and installs", () => {
    const { dir } = disposableBundle("control");
    const verified = runShippedVerifier(dir);
    expect(verified.status, verified.diagnostics).toBe(0);
    expect(verified.stdout).toBe(`OH MY PM release bundle check: OK (${CANONICAL_VERSION})\n`);

    const prefix = join(tempDir("omp-e2e-symlink-ctl-"), "prefix");
    const applied = run(wrapper, ["--bundle", dir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 180_000);
});

// -----------------------------------------------------------------------------
// Install transaction and rollback (F-06, F-08).
//
// Before this suite, rollback had never been executed by a test: every step of
// it was wrapped in a best-effort `try {} catch {}`, and the transaction
// directory (which holds the ONLY copy of the previous install) was deleted
// immediately afterwards whether or not the restore had worked.
//
// Forcing a post-install failure needs no production test hook. The installer
// runs the bundle's OWN shipped verifier three times with a different `--bundle`
// argument each time: against the source bundle, against the staged copy inside
// the transaction directory, and finally against the installed
// `versions/<version>` directory. A disposable bundle copy whose verifier fails
// only when its target's parent directory is named `versions` therefore passes
// every earlier gate and fails exactly once the new managed state is already in
// place -- which is precisely the state rollback exists to undo.
describe("install transaction and rollback (F-06, F-08)", () => {
  const productRelative = ["lib", "oh-my-pm"];
  const SHIM_NAMES = [
    "omp",
    "omp.cmd",
    "omp-mcp",
    "omp-mcp.cmd",
    "ohmypm",
    "ohmypm.cmd",
    "ohmypm-mcp",
    "ohmypm-mcp.cmd",
    "oh-my-pm",
    "oh-my-pm.cmd",
    "oh-my-pm-mcp",
    "oh-my-pm-mcp.cmd",
  ];

  const productDir = (prefix) => join(prefix, ...productRelative);
  const versionDir = (prefix) => join(productDir(prefix), "versions", CANONICAL_VERSION);
  const manifestPath = (prefix) => join(productDir(prefix), "install.json");

  /** The transaction directories currently present under a prefix. */
  function transactionDirs(prefix) {
    const product = productDir(prefix);
    if (!existsSync(product)) return [];
    return readdirSync(product).filter((name) => name.startsWith(".install-tx-"));
  }

  /**
   * A disposable copy of the shared bundle whose shipped verifier has been
   * replaced with `guardSource` -- code injected directly after the shebang, so
   * it runs before the real verifier does anything.
   *
   * SHA256SUMS is repaired for the rewritten verifier, because the installer
   * checksums the source bundle first: without the repair the install would fail
   * at `source:sha256sums_checksum_mismatch` and never reach post-install.
   */
  function bundleWithVerifierGuard(label, guardSource) {
    const root = tempDir(`omp-e2e-rollback-${label}-`);
    const dir = join(root, BUNDLE_NAME);
    cpSync(bundle.dir, dir, { recursive: true, dereference: false, verbatimSymlinks: true });

    const verifierRel = "libexec/check-release-bundle.mjs";
    const verifierPath = join(dir, ...verifierRel.split("/"));
    const lines = readFileSync(verifierPath, "utf8").split("\n");
    // Keep the shebang first; ESM imports in the guard are hoisted anyway.
    writeFileSync(verifierPath, [lines[0], guardSource, ...lines.slice(1)].join("\n"), "utf8");

    const digest = createHash("sha256").update(readFileSync(verifierPath)).digest("hex");
    const sumsPath = join(dir, "SHA256SUMS");
    const repaired = readFileSync(sumsPath, "utf8")
      .split("\n")
      .map((line) => (line.endsWith(`  ${verifierRel}`) ? `${digest}  ${verifierRel}` : line))
      .join("\n");
    writeFileSync(sumsPath, repaired, "utf8");

    // The rewritten fixture still passes from its own source location, so a
    // later failure is attributable to the injected stage check and nothing else.
    expectFixtureSuccess(run(verifierPath, ["--bundle", dir]));
    return { dir, root };
  }

  /**
   * Snapshot every managed target's observable state: relative path, kind,
   * regular-file bytes, and (POSIX only) the executable bit. This is the
   * evidence that a successful rollback restored the prior install *exactly*
   * rather than merely leaving something behind.
   */
  function snapshotManaged(prefix) {
    const entries = new Map();
    const walk = (absolute, relativePath) => {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.set(relativePath, { kind: "symlink" });
        return;
      }
      if (stat.isDirectory()) {
        entries.set(relativePath, { kind: "dir" });
        for (const name of readdirSync(absolute).sort()) {
          walk(join(absolute, name), `${relativePath}/${name}`);
        }
        return;
      }
      const record = {
        kind: "file",
        sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      };
      if (requiresPosixShimExecutableMode(process.platform)) {
        record.executable = (stat.mode & 0o111) !== 0;
      }
      entries.set(relativePath, record);
    };

    walk(versionDir(prefix), "versions");
    for (const shim of SHIM_NAMES) {
      const path = join(prefix, "bin", shim);
      if (existsSync(path)) walk(path, `bin/${shim}`);
    }
    entries.set("install.json", {
      kind: "file",
      contents: readFileSync(manifestPath(prefix), "utf8"),
    });
    return entries;
  }

  /** Install the real, unmodified shared bundle as the "previous" install. */
  function installPriorVersion(prefix) {
    expectFixtureSuccess(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]));
    expectFixtureSuccess(run(installedCheck, ["--prefix", prefix]));
  }

  // A. Post-install verification fails after the new state is in place; rollback
  //    succeeds. The original failure code must survive (NOT be rewritten to
  //    rollback_failed), the prior install must return byte-exactly, and the
  //    transaction directory must be cleaned because recovery is proven good.
  it("A. rolls back a post-install failure and restores the prior install exactly", () => {
    // Fail only from the final installed location: the source bundle and the
    // in-transaction staged copy both verify normally.
    const guard = [
      'import { basename as fiBase, dirname as fiDir, resolve as fiRes } from "node:path";',
      "{",
      '  const i = process.argv.indexOf("--bundle");',
      '  if (i !== -1 && typeof process.argv[i + 1] === "string") {',
      "    const target = fiRes(process.argv[i + 1]);",
      '    if (fiBase(fiDir(target)) === "versions") {',
      '      process.stderr.write("fixture: forced post-install failure\\n");',
      "      process.exit(1);",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const fixture = bundleWithVerifierGuard("post-fail", guard);

    const prefix = join(tempDir("omp-e2e-rollback-good-"), "prefix");
    installPriorVersion(prefix);
    const before = snapshotManaged(prefix);
    // Files the installer does not manage must also survive untouched.
    const unrelated = join(prefix, "bin", "unrelated-tool");
    writeFileSync(unrelated, "keep me\n", "utf8");

    // Forced replacement, so the previous managed targets really are moved into
    // backup and the restore path is genuinely exercised.
    const forced = run(wrapper, [
      "--bundle",
      fixture.dir,
      "--prefix",
      prefix,
      "--apply",
      "--force",
    ]);

    // 1. The install fails for the ORIGINAL reason. Rollback succeeded, so the
    //    failure is not reported as rollback_failed.
    expect(forced.status, forced.diagnostics).toBe(1);
    const output = `${forced.stdout}${forced.stderr}`;
    expect(output).toContain("post_install_verification_failed");
    expect(output).not.toContain("rollback_failed");

    // 2. No absolute host path, prefix, or transaction path is disclosed.
    expect(output).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
    expect(output).not.toContain(prefix);
    expect(output).not.toContain(fixture.dir);
    expect(output).not.toContain(tmpdir());
    expect(output).not.toContain(".install-tx-");

    // 3. The prior managed state is back, byte-for-byte and mode-for-mode.
    const after = snapshotManaged(prefix);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, value] of before) {
      expect(after.get(key), key).toEqual(value);
    }

    // 4. The installed-state verifier agrees the prefix is a valid install.
    expectFixtureSuccess(run(installedCheck, ["--prefix", prefix]));

    // 5. Rollback was proven good, so the transaction directory is gone -- no
    //    stranded backup and no leftover staging tree.
    expect(transactionDirs(prefix)).toEqual([]);

    // 6. Unmanaged files were never touched.
    expect(readFileSync(unrelated, "utf8")).toBe("keep me\n");
  }, 240_000);

  // B. Rollback itself cannot complete. The distinct code must surface, the
  //    backup must survive as recoverable evidence, and the transaction
  //    directory must NOT be deleted.
  //
  //    Mechanism: the fixture makes `<prefix>/bin` read-only just before failing,
  //    so rollback can neither remove the newly installed shims nor rename the
  //    backups back into it. Directory permission bits do not deny an
  //    administrator on Windows, so this case is POSIX-only; the reason-code and
  //    cleanup-ordering logic it covers is platform-independent.
  it.skipIf(isWindows)(
    "B. reports rollback_failed and preserves the backup when restore cannot complete",
    () => {
      const guard = [
        'import { basename as fiBase, dirname as fiDir, resolve as fiRes, join as fiJoin } from "node:path";',
        'import { chmodSync as fiChmod } from "node:fs";',
        "{",
        '  const i = process.argv.indexOf("--bundle");',
        '  if (i !== -1 && typeof process.argv[i + 1] === "string") {',
        "    const target = fiRes(process.argv[i + 1]);",
        '    if (fiBase(fiDir(target)) === "versions") {',
        "      // <prefix>/lib/oh-my-pm/versions/<version> -> <prefix>",
        "      const prefix = fiDir(fiDir(fiDir(fiDir(target))));",
        '      try { fiChmod(fiJoin(prefix, "bin"), 0o500); } catch {}',
        '      process.stderr.write("fixture: obstructed rollback\\n");',
        "      process.exit(1);",
        "    }",
        "  }",
        "}",
      ].join("\n");
      const fixture = bundleWithVerifierGuard("rollback-fail", guard);

      const prefix = join(tempDir("omp-e2e-rollback-bad-"), "prefix");
      installPriorVersion(prefix);
      const priorShim = readFileSync(join(prefix, "bin", "omp"), "utf8");

      const forced = run(wrapper, [
        "--bundle",
        fixture.dir,
        "--prefix",
        prefix,
        "--apply",
        "--force",
      ]);
      // Restore write access immediately so the assertions (and cleanup) can
      // read the prefix regardless of what follows.
      chmodSync(join(prefix, "bin"), 0o700);

      // 1. The distinct rollback failure code is reported, not the original one.
      expect(forced.status, forced.diagnostics).toBe(1);
      const output = `${forced.stdout}${forced.stderr}`;
      expect(output).toContain("rollback_failed");
      // 2. The original failure is retained alongside it, so the mixed state is
      //    still attributable to the post-install check that started it.
      expect(output).toContain("post_install_verification_failed");

      // 3. Nothing about the filesystem layout leaks, including the random
      //    transaction directory that is deliberately still on disk.
      expect(output).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
      expect(output).not.toContain(prefix);
      expect(output).not.toContain(tmpdir());
      expect(output).not.toContain(".install-tx-");

      // 4. The transaction directory SURVIVES: a failed rollback must never be
      //    followed by deletion of the only copy of the previous install.
      const surviving = transactionDirs(prefix);
      expect(surviving).toHaveLength(1);

      // 5. The previous shim is still recoverable from the preserved backup,
      //    byte-identical to what was installed before the failed transaction.
      const backupDir = join(productDir(prefix), surviving[0], "backup");
      expect(existsSync(backupDir)).toBe(true);
      const backedUpShim = join(backupDir, "shim-omp");
      expect(isRegularFile(backedUpShim)).toBe(true);
      expect(readFileSync(backedUpShim, "utf8")).toBe(priorShim);

      // 6. The test owns this disposable prefix, so it cleans the preserved
      //    evidence itself. Production deliberately does not.
      rmSync(join(productDir(prefix), surviving[0]), { recursive: true, force: true });
      expect(transactionDirs(prefix)).toEqual([]);
    },
    240_000,
  );

  // C. F-08: the transaction directory name is unpredictable, so a pre-created
  //    directory at the OLD PID-derived path is never removed or reused.
  //
  //    This drives applyReleaseInstallPlan IN-PROCESS rather than through the
  //    installer subprocess. That is essential to the test's power: the old code
  //    derived its path from the *installing* process's pid, so a sentinel
  //    planted at the test runner's `process.pid` would never collide with a
  //    child installer's pid and the defect would go unobserved. Running the
  //    install in this process makes `process.pid` the exact value the
  //    vulnerable implementation would have used.
  it("C. never touches a pre-created PID-derived transaction path", () => {
    const prefix = join(tempDir("omp-e2e-txpath-"), "prefix");

    // The product directory must exist before the sentinel can be planted, so
    // install once, then plant the old predictable path and reinstall by force.
    installPriorVersion(prefix);

    const predictable = join(productDir(prefix), `.install-tx-${process.pid}`);
    mkdirSync(predictable, { recursive: true });
    const sentinel = join(predictable, "DO_NOT_DELETE");
    const sentinelBytes = "pre-created by a co-located process\n";
    writeFileSync(sentinel, sentinelBytes, "utf8");

    // Drift one managed shim so the plan resolves to `replace` rather than
    // `already-installed`. A replacement takes the full transaction path --
    // staging, backup, and rename -- which is what must avoid the planted path.
    writeFileSync(join(prefix, "bin", "omp"), "drifted\n", "utf8");

    const plan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: true,
      force: true,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(true);
    expect(plan.action).toBe("replace");
    const applied = applyReleaseInstallPlan(plan);
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    expect(applied.code).toBe("replaced");

    // 1. The sentinel survives byte-identically: the installer neither removed
    //    the predictable directory nor wrote through it.
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, "utf8")).toBe(sentinelBytes);
    // Nothing was added to it either -- it was not used as a workspace.
    expect(readdirSync(predictable)).toEqual(["DO_NOT_DELETE"]);

    // 2. The install still succeeded and its own random workspace was cleaned,
    //    so the planted directory is the ONLY `.install-tx-*` entry left.
    expectFixtureSuccess(run(installedCheck, ["--prefix", prefix]));
    expect(transactionDirs(prefix)).toEqual([`.install-tx-${process.pid}`]);

    // 3. The surviving directory is the planted sentinel, not a transaction
    //    directory the installer created and abandoned.
    rmSync(predictable, { recursive: true, force: true });
    expect(transactionDirs(prefix)).toEqual([]);
  }, 240_000);
});
