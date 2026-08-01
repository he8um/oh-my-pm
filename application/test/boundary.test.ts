// Static boundary check for @oh-my-pm/application.
//
// The application layer is a presentation-neutral use-case boundary. These
// checks fail the build if it grows a dependency on a presentation package, a
// process-output side effect, or any Dashboard/HTTP capability. Reading source
// files here is allowed only for this static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");

/**
 * The explicit Node boundary. Only these files may touch node:fs, node:path,
 * or the ambient process, and only to read.
 */
const NODE_BOUNDARY_DIR = "node";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Strip line and block comments so a marker is only ever matched in real code.
 * Documentation in this package deliberately names the very APIs it forbids
 * ("calls no process.exit"), and prose must not trip a code check.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const files = sourceFiles(srcDir).map((file) => ({
  path: relative(srcDir, file),
  text: stripComments(readFileSync(file, "utf8")),
}));

/** True when the file sits under the explicit Node boundary directory. */
function isNodeBoundary(path: string): boolean {
  return path.split(/[\\/]/)[0] === NODE_BOUNDARY_DIR;
}

describe("application dependency direction", () => {
  it("has at least one source file to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never imports a presentation package", () => {
    const forbidden = ["@oh-my-pm/cli", "@oh-my-pm/mcp-server"];
    for (const { path, text } of files) {
      for (const specifier of forbidden) {
        expect(text.includes(`"${specifier}"`), `${path} must not import ${specifier}`).toBe(false);
      }
    }
  });

  it("never imports the installer or distribution packages", () => {
    for (const { path, text } of files) {
      for (const specifier of ["@oh-my-pm/installer", "@oh-my-pm/distribution"]) {
        expect(text.includes(`"${specifier}"`), `${path} must not import ${specifier}`).toBe(false);
      }
    }
  });

  it("declares no dependency on a presentation, installer, or distribution package", () => {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      const deps = manifest[field] ?? {};
      for (const name of [
        "@oh-my-pm/cli",
        "@oh-my-pm/mcp-server",
        "@oh-my-pm/installer",
        "@oh-my-pm/distribution",
      ]) {
        expect(Object.hasOwn(deps, name), `${field} must not contain ${name}`).toBe(false);
      }
    }
  });

  it("stays private and unpublished", () => {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      private?: boolean;
      type?: string;
    };
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
  });
});

describe("application process boundary", () => {
  it("never reads process.argv", () => {
    for (const { path, text } of files) {
      expect(text.includes("process.argv"), `${path} must not read process.argv`).toBe(false);
      expect(text.includes("argv?."), `${path} must not read argv`).toBe(false);
    }
  });

  it("never writes to stdout or stderr", () => {
    const markers = [
      "process.stdout",
      "process.stderr",
      "console.log",
      "console.error",
      "console.warn",
      "console.info",
    ];
    for (const { path, text } of files) {
      for (const marker of markers) {
        expect(text.includes(marker), `${path} must not use ${marker}`).toBe(false);
      }
    }
  });

  it("never calls process.exit", () => {
    for (const { path, text } of files) {
      expect(text.includes("process.exit"), `${path} must not call process.exit`).toBe(false);
    }
  });

  it("never spawns a child process", () => {
    for (const { path, text } of files) {
      for (const marker of ["child_process", "spawn(", "execFile", "execSync"]) {
        expect(text.includes(marker), `${path} must not use ${marker}`).toBe(false);
      }
    }
  });
});

describe("application contains no presentation or server capability", () => {
  it("contains no HTTP server code", () => {
    const markers = [
      "node:http",
      "node:https",
      '"http"',
      "createServer",
      ".listen(",
      "express",
      "fastify",
      "WebSocket",
    ];
    for (const { path, text } of files) {
      for (const marker of markers) {
        expect(text.includes(marker), `${path} must not contain ${marker}`).toBe(false);
      }
    }
  });

  it("renders no HTML and no UI framework", () => {
    const markers = [
      "<!DOCTYPE",
      "<html",
      "document.",
      "React",
      "createRoot",
      "Vite",
      "Tauri",
      "Electron",
    ];
    for (const { path, text } of files) {
      for (const marker of markers) {
        expect(text.includes(marker), `${path} must not contain ${marker}`).toBe(false);
      }
    }
  });

  it("knows no MCP protocol", () => {
    const markers = ["jsonrpc", "JSON-RPC", "tools/call", "StdioServerTransport", "registerTool"];
    for (const { path, text } of files) {
      for (const marker of markers) {
        expect(text.includes(marker), `${path} must not reference ${marker}`).toBe(false);
      }
    }
  });

  it("confines executable names to the command-surface module", () => {
    // command-surface.ts exists to name the public executables -- it is the
    // single source of truth the MCP alias wrapper and the CLI both read. No
    // OTHER application module may hard-code a command name, because a use case
    // must not know how it was invoked.
    for (const { path, text } of files) {
      if (path === "command-surface.ts") continue;
      for (const marker of ["ohmypm-mcp", "ohmypm-install", '"ohmypm"']) {
        expect(text.includes(marker), `${path} must not reference ${marker}`).toBe(false);
      }
    }
  });
});

describe("application Node boundary containment", () => {
  it("confines node: imports to the node/ directory", () => {
    for (const { path, text } of files) {
      if (isNodeBoundary(path)) continue;
      expect(text.includes("node:"), `${path} must not import a node: builtin`).toBe(false);
    }
  });

  // The single documented exception: the memory orchestrator may read the
  // process id to derive the store's internal staging operation id. It is never
  // printed and never persisted, and every caller may inject `processId`.
  const AMBIENT_PROCESS_ALLOWED = new Set(["memory-process.ts"]);

  it("confines ambient process reads to the node/ directory", () => {
    for (const { path, text } of files) {
      if (isNodeBoundary(path) || AMBIENT_PROCESS_ALLOWED.has(path)) continue;
      expect(
        text.includes("globalThis as { process"),
        `${path} must not read the ambient process`,
      ).toBe(false);
    }
  });

  it("limits the memory orchestrator's ambient read to the process id", () => {
    const text = files.find((f) => f.path === "memory-process.ts")?.text ?? "";
    expect(text).toContain("process?: { pid?: number }");
    for (const marker of ["process.env", "process.argv", "process.cwd"]) {
      expect(text.includes(marker), `memory-process.ts must not read ${marker}`).toBe(false);
    }
  });

  it("never writes to the filesystem, even at the Node boundary", () => {
    const writeApis = [
      "writeFileSync",
      "appendFileSync",
      "createWriteStream",
      "mkdirSync",
      "rmSync",
      "rmdirSync",
      "unlinkSync",
      "renameSync",
      "copyFileSync",
      "chmodSync",
    ];
    for (const { path, text } of files) {
      for (const api of writeApis) {
        expect(text.includes(api), `${path} must not call ${api}`).toBe(false);
      }
    }
  });
});
