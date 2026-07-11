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
