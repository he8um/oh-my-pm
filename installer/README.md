# @oh-my-pm/installer

Private installer package for OH MY PM.

This package currently provides a deterministic installer foundation. It validates package manifests, creates install reports, checks update plans through the Kernel boundary, and produces rollback reports.

The current implementation is side-effect-free and in-memory only. It does not write files, read files, or install real release artifacts yet.
