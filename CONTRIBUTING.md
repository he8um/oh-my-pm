# Contributing

Thanks for your interest in OH MY PM.

Contributions should stay small, traceable, and aligned with the public architecture and roadmap.

## Ground rules

- Do not include secrets, tokens, credentials, private workspace data, or local-only files.
- Keep changes focused.
- Explain the design or roadmap reference behind each change.
- Do not copy legacy material directly without reviewed adaptation.
- Avoid broad implementation changes that cut across package boundaries; the dependency direction is enforced by `pnpm validate:boundaries`.

## Development flow

1. Open an issue for architecture, documentation, security, or implementation proposals.
2. Keep pull requests focused.
3. Include validation notes in the PR.
4. Update public docs when behavior or architecture changes.

## Quality policy

Every gate below runs in CI on each pull request. Run them locally first —
`pnpm quality` runs all four static gates in one command.

| Command               | Enforces                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `pnpm lint`           | ESLint (flat config, type-aware on TypeScript)                       |
| `pnpm format:check`   | Prettier formatting                                                  |
| `pnpm rust:fmt:check` | `cargo fmt --all --check`                                            |
| `pnpm rust:clippy`    | `cargo clippy --workspace --all-targets -- -D warnings`              |
| `pnpm test`           | unit, release-integration, and Rust tests                            |
| `pnpm validate`       | structure, boundary, contract, command, and documentation validators |

Use `pnpm lint:fix` and `pnpm format` to apply the mechanical fixes.

A few conventions the tooling assumes:

- **Formatting stays in its own commit.** Never mix a formatting pass with a
  behavioral change; it makes the real diff unreviewable.
- **Unused bindings are errors.** Prefix a deliberately unused parameter with
  `_` rather than disabling the rule.
- **Lint findings are fixed, not silenced.** If a rule is genuinely wrong for a
  case, add a narrow `eslint-disable-next-line` with a comment stating why it
  is safe — never a file-wide or repository-wide disable.
- **Generated code is not linted or formatted.** `contracts/generated/` and the
  Kernel binding output are produced by `tools/gen-contracts.mjs` and
  `pnpm build:kernel`; fix the generator, not its output. The generator emits
  rustfmt-canonical Rust, so regenerating never breaks the formatting gate.
- **Historical documents are never reformatted.** Published release notes,
  publishing runbooks, and closed per-version phase documents under
  `docs/releases/`, `docs/v0.3/`, and `docs/v0.4/` are point-in-time records
  and are excluded from Prettier.

### Dependencies

CI installs with `pnpm install --frozen-lockfile`, so `pnpm-lock.yaml` must be
committed alongside any `package.json` change. A lockfile that does not match
the manifests fails the build rather than silently resolving a different
dependency graph than the one a release will be built from.

## Commit style

Use conventional commit messages where possible:

- `docs: ...`
- `chore: ...`
- `feat: ...`
- `fix: ...`
