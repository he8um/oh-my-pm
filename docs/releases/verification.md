# Verifying a release artifact

How to check that an OH MY PM release archive you downloaded is the archive this
project's release workflow actually produced.

There are two independent checks, and they answer different questions:

| Check | Question it answers |
| --- | --- |
| SHA-256 checksum | Are these the exact bytes the published checksum file describes? |
| Build provenance attestation | Were these bytes produced by this repository's release workflow? |

A checksum compares an artifact against a list you also downloaded from the same
release. Provenance is a signed, independently verifiable claim about *where the
artifact came from*. Neither replaces the other, and neither is a signature over
the archive on its own: provenance signs a statement binding the artifact's
digest to a build identity.

## 1. Download the release assets

Each stable v0.6 release publishes exactly three assets:

```
oh-my-pm-v<version>.tar.gz
oh-my-pm-v<version>.zip
oh-my-pm-v<version>-SHA256SUMS.txt
```

With the GitHub CLI:

```sh
gh release download v0.6.2 --repo he8um/oh-my-pm --dir ./omp-release
cd ./omp-release
```

## 2. Verify the SHA-256 checksums

Linux:

```sh
sha256sum -c oh-my-pm-v0.6.2-SHA256SUMS.txt
```

macOS:

```sh
shasum -a 256 -c oh-my-pm-v0.6.2-SHA256SUMS.txt
```

Windows (PowerShell), per file:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .\oh-my-pm-v0.6.2.zip).Hash.ToLower()
```

Compare the printed hash against the matching line in the `SHA256SUMS.txt` file.

This proves the archive matches the checksum file. It does not prove the checksum
file itself is authentic — that is what the next step adds.

## 3. Verify the build provenance attestation

> Provenance attestations apply only to releases published **after** provenance
> support was activated in a real release run. At the time of writing, no
> published release carries one yet; v0.6.2 was published before this support
> existed and was **not** retroactively attested. See
> [Releases without an attestation](#releases-without-an-attestation).

Verify an artifact against this repository:

```sh
gh attestation verify oh-my-pm-v0.6.2.tar.gz --repo he8um/oh-my-pm
```

Run it once per artifact; all three published assets are attested.

### Stronger: bind to the signer workflow

`--repo` proves the attestation came from this repository. It does not say
*which* workflow in the repository produced it. Adding `--signer-workflow`
additionally requires that the signing identity is the release workflow:

```sh
gh attestation verify oh-my-pm-v0.6.2.tar.gz \
  --repo he8um/oh-my-pm \
  --signer-workflow he8um/oh-my-pm/.github/workflows/release-v0.6.yml
```

Prefer this form. It is the difference between "something in this repository
signed it" and "this repository's release workflow signed it".

The `--signer-workflow` value takes the form
`[host/]<owner>/<repo>/<path>/<to>/<workflow>`.

Verification fetches the attestation from the GitHub API, so it needs network
access and an authenticated `gh`. For an air-gapped check, download the bundle
first with `gh attestation download` and pass it via `--bundle`.

## 4. Expected identities

A successful verification for a v0.6 stable release should report:

- **Repository / source repository owner** — `he8um/oh-my-pm`
- **Signer workflow** — `.github/workflows/release-v0.6.yml`
- **Predicate type** — `https://slsa.dev/provenance/v1` (the default `gh
  attestation verify` enforces)

If the repository or the signer workflow is anything else, stop and treat the
artifact as untrusted, even if the checksums matched.

## 5. What success proves

Together, a matching checksum and a passing attestation give you:

- the artifact's bytes are unmodified since the moment the release workflow
  recorded its digest;
- the artifact was produced by a GitHub Actions run in `he8um/oh-my-pm`, by the
  v0.6 release workflow, at a specific commit;
- the claim is cryptographically verifiable against a signing certificate issued
  by Sigstore for that build identity, and is not something a third party could
  forge by re-uploading a rebuilt archive.

## 6. What it does NOT prove

Provenance is evidence about **origin**, not about **quality or intent**:

- It does not prove the software is free of bugs or vulnerabilities.
- It does not prove the *source code* is trustworthy, safe, or reviewed. A build
  system faithfully building malicious source produces valid provenance.
- It is not a checksum, and does not replace one; the two checks are
  complementary.
- It is not a signature over the archive itself. It signs a statement binding the
  archive's digest to a build identity.
- It says nothing about anything you obtained outside the GitHub Release — a
  mirror, a fork's release page, or a repackaged copy.

## Releases without an attestation

Build provenance was introduced during the v0.6.3 security work. Releases
published before that support was activated do not have attestations, and were
not retroactively attested — an attestation can only be produced by the build
that made the artifact, so back-filling one would be a claim about a build that
never made it.

For those releases, `gh attestation verify` will report that no attestation was
found.

**A missing attestation on an older release is not evidence that the archive was
modified.** It means the check does not apply. Verify those artifacts with the
SHA-256 checksums published alongside them.

## Related

- [SECURITY.md](../../SECURITY.md) — security policy, including the build
  provenance summary and how to report a vulnerability.
- [docs/security-model.md](../security-model.md) — the runtime security model.
