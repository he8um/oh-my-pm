# @oh-my-pm/cli

Private CLI package for OH MY PM.

The package exposes side-effect-free CLI core utilities and a local Node.js wrapper.

The local wrapper is available as `oh-my-pm` inside the workspace after packages are built and linked by pnpm. It is private and is not published.

Current commands:

- `status`
- `doctor`
- `plan <request>`
- `install-preview <root>`

`install-preview` is dry-run only. It reads the target root through the installer read-only adapter and prints planned operations. It does not write files and it does not execute installation. The preview may include an archive plan summary (planned name, format, checksum, entry count), a signed release metadata summary, a release integrity summary, and a local channel metadata summary, but it still creates no archive, includes no signature value, performs no real signing, verifies no real signatures, and exposes no publishing or download URLs — the integrity verdict is a consistency check only and the channel metadata is local-only. It may also include a local update policy summary (an eligibility decision only) an update impact summary (a create/replace/remove/unchanged comparison only), and a rollback impact summary (a restore/remove/missing/unchanged comparison only); it never executes an update or a rollback. The preview may also include an installer decision report that aggregates every local preview layer into one ready/blocked/review-required verdict, but it still does not execute install or rollback. It may also include an installer audit event summary that models the preview pipeline as a deterministic in-memory event sequence; those events are counted only and are never logged, persisted, or sent. It may also include an audit export summary (format, event count, byte size, and a deterministic fingerprint); it does not include raw export content in JSON and does not persist or send events. It may also include a guarded write capability status (intent, mode, allowed, reasons) evaluated under the default preview-only policy; the CLI does not provide a production install command and never writes files, executes installation, or calls a write adapter. It may also include a deterministic, non-secret approval token summary (intent, decision, and a descriptive token value); the token does not bypass the preview-only default and carries no secret, key, or signature. It may also include a write execution plan summary (intent, planned step count, reasons) that describes the local write steps a future write mode would plan; the raw step list is not included in JSON, the plan is not executed, and no write adapter is called. It may also include a write confirmation summary (intent, passed/failed check counts, reasons) reporting pre-write readiness; the raw checklist items are not included in JSON, and the CLI still does not provide a production install command. It may also include a write adapter contract status (name, required and declared capabilities, reasons) validating a declared adapter metadata contract; no adapter object or method is included, no adapter is called, and the CLI still does not provide a production install command. It may also include a controlled write dry-run readiness summary (intent, per-layer readiness flags, planned step count, reasons) aggregating every write readiness layer; the raw pass-through layers are not included in JSON, nothing is executed, and the CLI still does not provide a production install command. It may also include a release readiness summary (status, per-status section counts, unique reason count, planned step count, reasons) aggregating the decision report, audit trail export dry-run, and controlled write dry-run envelope; the raw sections and markdown are not included in JSON, no release artifact is created, and the CLI still does not provide a production install command.

The wrapper uses the real WASM Kernel binding from `@oh-my-pm/kernel`, so validation, update guard, and state transition decisions come from the Rust Kernel. Provider seed data remains local. Build the workspace first so the generated binding exists:

```bash
pnpm build
```
