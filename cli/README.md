# @oh-my-pm/cli

Private CLI package for OH MY PM.

The package exposes side-effect-free CLI core utilities and a local Node.js wrapper.

The local wrapper is available as `oh-my-pm` inside the workspace after packages are built and linked by pnpm. It is private and is not published.

Current commands:

- `status`
- `doctor`
- `plan <request>`
- `install-preview <root>`

`install-preview` is dry-run only. It reads the target root through the installer read-only adapter and prints planned operations. It does not write files and it does not execute installation. The preview may include an archive plan summary (planned name, format, checksum, entry count), a signed release metadata summary, and a release integrity summary, but it still creates no archive, includes no signature value, performs no real signing, and verifies no real signatures — the integrity verdict is a consistency check only.

The wrapper uses the real WASM Kernel binding from `@oh-my-pm/kernel`, so validation, update guard, and state transition decisions come from the Rust Kernel. Provider seed data remains local. Build the workspace first so the generated binding exists:

```bash
pnpm build
```
