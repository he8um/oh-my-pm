// The read-only filesystem boundary for the installed MCP command probe.
//
// This is the only mcp-config module that touches the filesystem, and it does
// exactly one thing: stat an already-derived absolute path to learn whether the
// installed sibling executable is a regular file. It reads no file contents,
// creates nothing, writes nothing, resolves no project document, and never
// reaches the environment, the network, a child process, or the clock. All path
// derivation and rendering stay in the pure mcp-config module.

import { lstatSync } from "node:fs";

/** Whether an absolute path is an existing regular file. Read-only stat. */
export function installedCommandExists(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}
