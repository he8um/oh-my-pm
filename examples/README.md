# Examples

This directory contains small, deterministic examples for using OH MY PM packages together.

The examples are private workspace examples. They do not publish a package and they do not create a binary.

Current examples:

- status through the CLI and injected Runtime
- doctor through the CLI and injected Runtime
- plan through the CLI, Runtime, Planner, local Provider, and deterministic Skills
- installer dry-run planning through in-memory adapters
- controlled installer execution through explicit write adapters
- rollback capture examples
- installer package assembly dry-run through in-memory adapters
- installer archive planning from assembly dry-run results
- installer signed release metadata from archive plans

Installer examples do not add a CLI install command and do not package or download release artifacts. The assembly example builds a manifest only, and the archive plan example plans a name, checksum, and entries only; no archive file is created and nothing is published. The signed metadata example uses a deterministic placeholder signature only: no signing keys exist and nothing is signed for real.

The example Kernel is an injected deterministic boundary used only for examples, demonstrating dependency injection. The private CLI wrapper now uses the real WASM Kernel binding instead.
