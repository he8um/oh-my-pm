# @oh-my-pm/cli

Private CLI package for OH MY PM.

The package exposes side-effect-free CLI core utilities and a local Node.js wrapper.

The local wrapper is available as `oh-my-pm` inside the workspace after packages are built and linked by pnpm. It is private and is not published.

Current commands:

- `status`
- `doctor`
- `plan <request>`

The wrapper currently uses an injected deterministic local Kernel boundary and local provider seed data. It does not load the production Kernel binding yet.
