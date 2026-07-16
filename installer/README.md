# @oh-my-pm/installer

Private installer package for OH MY PM.

This package currently provides a deterministic installer foundation. It validates package manifests, creates install reports, checks update plans through the Kernel boundary, and produces rollback reports.

The current implementation is side-effect-free and in-memory only. It does not write files, read files, or install real release artifacts yet.

## Filesystem planning

The installer exposes filesystem planning through explicit adapters.

The current package includes an in-memory filesystem adapter for deterministic tests and examples. The installer core does not read or write the real filesystem.

Real filesystem installation will be added behind the same adapter boundary in a later phase.

## Node filesystem adapter

The package includes a read-only Node filesystem adapter for planning and inspection.

The adapter can list and read files under an explicit root and produces SHA-256 checksums. It refuses paths outside the configured root and ignores symlinks.

The adapter does not write, delete, rename, or mutate files. Real installation execution remains out of scope.

## Controlled execution

The installer can execute planned operations only through explicit write adapters.

The in-memory write adapter is intended for deterministic tests and examples. The Node write adapter is root-confined and refuses unsafe paths and symlinks.

This package still does not package releases, download artifacts, or expose a production install command.

## Release package manifest design

The installer defines package manifests before real release packaging exists.

A package manifest can include per-file metadata such as path, checksum, and byte size. The package-level checksum is deterministic and derived from the manifest content for planning purposes.

This design does not create archives, publish packages, download artifacts, or execute updates.

## Package assembly dry-run

The installer can create a package assembly dry-run from an explicit include list and a read-only filesystem adapter.

The dry-run collects file metadata, builds a rich package manifest, and reports missing include paths. It does not create archives, write files, upload artifacts, or publish releases.

## Archive plan design

The installer can produce archive dry-run plans from package assembly results.

Archive plans include a planned archive name, format, deterministic checksum, and file entries. They do not create archive files, write artifacts, upload packages, or publish releases.

## Signed release metadata design

The installer can build signed release metadata dry-runs from archive plans.

The current signature is a deterministic placeholder used only to model metadata shape and validation. No signing keys are generated, read, stored, or used. No release files are written or published.

## Release integrity verification design

The installer can verify release metadata against an archive plan and a deterministic placeholder signature.

This verification checks internal consistency only. It does not verify a real cryptographic signature, read keys, generate keys, download artifacts, or publish releases.

## Release channel metadata design

The installer can build local release channel metadata from verified release metadata.

Channel metadata groups release entries by channel name and selects the latest entry deterministically. It does not publish channel files, expose download URLs, fetch updates, upload artifacts, or create releases.

## Local update policy evaluation

The installer can evaluate whether a local channel entry is eligible for update from an installed manifest.

The evaluation is local and policy-based. It checks channel allowance, candidate integrity, current version, candidate version, and downgrade rules. It does not retrieve packages remotely, execute installation, contact remote endpoints, or write files.

## Update impact preview

The installer can preview the impact of a locally eligible update before any installation runs.

The preview compares current files with candidate release entries and reports create, replace, remove, and unchanged operations with size/checksum summaries. It does not retrieve packages remotely, execute installation, call write adapters, or write files.

## Rollback impact preview

The installer can preview the impact of a rollback before any rollback operation runs.

The preview compares current files with rollback backup entries and reports restore, remove, missing, and unchanged operations with size/checksum summaries. It does not retrieve packages remotely, execute rollback, call write adapters, or write files.

## Installer decision report

The installer can aggregate local preview layers into a deterministic decision report.

The report summarizes assembly, archive, metadata, integrity, channel, update policy, update impact, and rollback impact status. It classifies the preview as ready, blocked, or review-required. It does not retrieve packages remotely, execute installation, execute rollback, call write adapters, or write files.

## Installer audit event model

The installer can model deterministic audit events for a local preview pipeline.

Audit events describe preview start, section evaluation, decision reporting, and preview completion. They are returned in memory only. The model does not write logs, persist audit files, send telemetry, retrieve packages remotely, execute installation, execute rollback, or call write adapters.

## Installer audit trail export plan

The installer can render audit events into an in-memory export payload.

Supported formats are JSON, JSONL, and Markdown. The export plan reports event count, byte size, and a deterministic fingerprint. It does not write files, persist logs, send telemetry, retrieve packages remotely, execute installation, execute rollback, or call write adapters.

## Guarded write capability

The installer can evaluate whether a future write-capable operation would be allowed under an explicit policy.

The default policy is preview-only, requires a ready decision, and requires explicit approval. This model only evaluates capability. It does not execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Explicit write approval token

The installer can model a deterministic approval token for future write-capable operations.

The token is descriptive, local, and non-secret. It binds an intent, root, and decision value so a future explicit write mode can check whether a user intentionally approved the same preview result. It does not execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Explicit write execution plan

The installer can build a deterministic execution plan for a future write-capable operation after capability checks pass.

The plan lists local step kinds and paths for install, update, or rollback intent. It is planning only. It does not execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Write execution confirmation checklist

The installer can build a deterministic confirmation checklist for a future write-capable operation.

The checklist verifies intent consistency, decision readiness, write capability, execution plan readiness, and step presence. It is confirmation-only. It does not execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Controlled write adapter contract

The installer can validate a declared write adapter metadata contract before any future write-capable operation.

The contract declares local capabilities such as write-file, remove-file, and backup-file. The validation checks the declared capabilities against the already-built write execution plan and confirmation checklist. It is metadata-only. It does not call adapters, execute installation, execute rollback, retrieve packages remotely, or write files.

## Controlled write execution dry-run envelope

The installer can aggregate write readiness layers into one controlled dry-run envelope.

The envelope summarizes write capability, approval token status, execution plan readiness, confirmation checklist readiness, and adapter contract readiness. It is non-mutating. It does not execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Installer release readiness summary

The installer can aggregate local preview readiness into one release-readiness report.

The report summarizes the installer decision report, audit trail export dry-run, and controlled write dry-run envelope. It is summary-only. It does not create release artifacts, execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## v0 release candidate checklist

The installer can build a deterministic checklist for evaluating whether the repository is ready to be considered as a future v0 release candidate.

The checklist aggregates validation, public-surface, build, test, CLI smoke, release-readiness, and public hygiene signals. It is checklist-only. It does not create release artifacts, publish packages, execute installation, execute rollback, call write adapters, retrieve packages remotely, or write files.

## Public v0 release notes draft

The installer can render a public v0 release notes draft from the local release-readiness and release-candidate checklist reports.

The draft is public-safe and summary-only. It does not create GitHub releases, release artifacts, archives, tags, publishing workflows, installation commands, or write execution.

## Guarded release artifact planning

The installer can build a guarded release artifact plan from local release-readiness, v0 checklist, release notes, package assembly, archive, metadata, integrity, and channel dry-runs.

The plan is planning-only. It reports which release outputs would be planned and keeps creation disabled. It does not create release artifacts, archives, GitHub releases, tags, publishing workflows, installation commands, or write execution.

## Guarded local artifact assembly dry-run envelope

The installer can aggregate guarded release artifact planning, package assembly, archive, metadata, integrity, and channel dry-runs into one local artifact assembly readiness envelope.

The envelope is readiness-only. It keeps creation disabled. It does not create release artifacts, archives, GitHub releases, tags, publishing workflows, installation commands, or write execution.

## Guarded artifact creation permission model

The installer can evaluate whether artifact creation permission would be granted for a future explicitly-enabled local artifact creation phase.

The permission model is evaluation-only. It can report permission as allowed only under explicit mode, ready assembly, and explicit approval, but creation remains disabled in this phase. It does not create release artifacts, archives, GitHub releases, tags, publishing workflows, installation commands, or write execution.

## Local artifact creation execution plan

The installer can build a deterministic plan for a future explicitly-enabled local artifact creation phase.

The plan is planning-only. It keeps creation disabled and reports which local artifact creation steps would be prepared. It does not create release artifacts, archives, GitHub releases, tags, publishing workflows, installation commands, or write execution.
