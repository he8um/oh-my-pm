# Roadmap

The detailed public roadmap is maintained in [`docs/roadmap.md`](docs/roadmap.md).

Current focus:

1. public foundation
2. repository scaffold
3. shared contracts
4. Kernel and runtime foundation
5. CLI foundation
6. read-only context provider framework
7. validation and release lifecycle

Active direction — **v0.5 CLI command namespace**: `ohmypm`, `ohmypm-mcp` and
`ohmypm-install` become the canonical commands, with the former `oh-my-pm` family
retained as deprecated compatibility aliases and no removal scheduled. Not a
product rename: package scope, environment variables, installation paths, data
directories, archive names and the MCP server key are unchanged, and no data
migration is required. No new feature, no schema change, no write path, no upload,
and no Dashboard work. See [`docs/v0.5/README.md`](docs/v0.5/README.md).

Shipped — **v0.4 Project Timeline**: a local, bounded, deterministic history of
project changes derived from already-captured Project Brain snapshots, exposed
read-only through the CLI and MCP. See [`docs/v0.4/README.md`](docs/v0.4/README.md).
