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
