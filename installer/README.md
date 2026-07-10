# @oh-my-pm/installer

Private installer package for OH MY PM.

This package currently provides a deterministic installer foundation. It validates package manifests, creates install reports, checks update plans through the Kernel boundary, and produces rollback reports.

The current implementation is side-effect-free and in-memory only. It does not write files, read files, or install real release artifacts yet.

## Filesystem planning

The installer exposes filesystem planning through explicit adapters.

The current package includes an in-memory filesystem adapter for deterministic tests and examples. The installer core does not read or write the real filesystem.

Real filesystem installation will be added behind the same adapter boundary in a later phase.
