// The single canonical version identity for the MCP server package.
//
// Every MCP surface — the server handshake, the local project tool runner, and
// the GitHub tool runner — reports this one value. Keeping it in a dependency-free
// leaf module makes the shared identity importable from any runner without an
// import cycle, and leaves exactly one place for the release version bump to
// touch (see check-version-consistency).
//
// The application GitHub use case receives this version from the MCP adapter; it
// never knows the MCP package version itself.

export const OH_MY_PM_MCP_VERSION = "0.6.2";
