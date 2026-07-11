# RD-02: npm Provenance Support

> **Document**: RD-02-npm-provenance.md
> **Status**: Draft
> **Created**: 2026-07-12
> **Project**: @blendsdk/lockstep — monorepo lockstep versioning tool
> **Depends On**: —
> **CodeOps Skills Version**: 3.3.2

---

## Feature Overview

npm provenance produces a cryptographically signed, publicly verifiable record binding a published
package to the exact source commit and CI build that produced it (via Sigstore + the publishing CI's
OIDC identity). It is a supply-chain-integrity signal: consumers can confirm a package on npm was built
from the claimed source by the claimed workflow, defending against compromised-account and
tampered-tarball attacks.

Lockstep currently publishes each package with a plain `npm publish` (`src/lockstep.ts:495-503`). This
feature adds an opt-in `--provenance` flag that forwards provenance generation to the underlying package
manager, with the safety rails provenance requires: it only works from a supported cloud CI/CD, so
lockstep detects that environment and skips-with-warning when absent, and it validates every package's
`repository` field up front so a partial publish can't strand half the monorepo on the registry.

---

## Functional Requirements

### Must Have

- [ ] A `--provenance` flag on `lockstep publish` that enables provenance generation for every package
  in the publish set (AR #5).
- [ ] `publishConfig.provenance: true` in a package's `package.json` is honored as equivalent to the
  flag for that package (npm's native mechanism) (AR #5).
- [ ] When provenance is enabled, `--provenance` is forwarded to the underlying publish command for the
  npm and pnpm paths; the yarn path already shells `npm publish`, so it is covered (AR #14).
- [ ] Supported-CI detection: provenance is only attempted when running in a supported cloud CI/CD —
  GitHub Actions or GitLab CI/CD — detected via their standard environment signals (AR #6).
- [ ] Outside a supported CI, when provenance is requested lockstep logs a clear warning explaining
  provenance requires supported CI, and continues the publish **without** provenance (never blocks a
  local publish) (AR #6).
- [ ] `repository`-field preflight: before publishing **any** package, verify every package in the
  publish set declares a `repository` field. If any package is missing it, abort the entire publish with
  a clear error **before** the first `npm publish` runs (fail-fast) (AR #7).
- [ ] The preflight and CI checks run before the topological publish loop begins, so provenance
  requirements are validated once for the whole set, not discovered mid-loop.

### Should Have

- [ ] The publish log states, per run, whether provenance is ON (and the detected CI provider) or SKIPPED
  (with the reason), so CI logs make the provenance state auditable.
- [ ] `--dry` combined with `--provenance` reports the intended provenance state and runs the preflight
  without publishing.

### Won't Have (Out of Scope)

- npm **trusted publishing** / OIDC auto-provenance registry configuration — that is registry-side setup,
  not lockstep's responsibility (AR #15).
- Verifying published provenance after the fact (`npm audit signatures`) — consumers' concern, not the
  publisher's flow.
- Deep URL-equality checking between `repository` and the actual remote — lockstep asserts the field is
  **present**; npm performs the authoritative case-sensitive match at publish time (documented behavior).

---

## Technical Requirements

### Enablement resolution

Provenance is enabled for a given package when either the `--provenance` flag is passed **or** that
package's `package.json` sets `publishConfig.provenance: true`. The flag is the lockstep-level switch;
`publishConfig` is npm's own per-package switch and is respected transparently (lockstep need not strip
or duplicate it).

### Supported-CI detection

| Provider | Detection signal |
|----------|------------------|
| GitHub Actions | `GITHUB_ACTIONS === "true"` (cloud-hosted runner) |
| GitLab CI/CD | `GITLAB_CI === "true"` (cloud-hosted runner) |

When `--provenance` is requested but neither signal is present, lockstep treats it as "not in supported
CI" and takes the skip-with-warning path (AR #6). Provenance additionally requires an OIDC `id-token`
permission in the workflow; lockstep does not mint tokens — it forwards to npm, which performs the OIDC
exchange. The RD documents this prerequisite for the CI examples; lockstep's responsibility ends at
detecting the environment and forwarding the flag.

### Command construction (`src/lockstep.ts:489-503`)

The publish args builder gains a conditional `--provenance`:

```
provenanceEnabled = (--provenance flag) || pkg.publishConfig?.provenance === true
effectiveProvenance = provenanceEnabled && supportedCiDetected
# npm:  npm publish  --access <a> --tag <t> [--provenance] [--dry-run]
# pnpm: pnpm publish --access <a> --tag <t> [--provenance] [--dry-run]
# yarn: (uses `npm publish` path) — same [--provenance] applies
```

### Preflight (before the topo publish loop, `src/lockstep.ts:466-482`)

1. If provenance requested: run supported-CI detection → set `effectiveProvenance` and log ON/SKIPPED.
2. If `effectiveProvenance`: iterate the full publish set; any package whose `package.json` lacks a
   `repository` field → throw a single aggregated error listing the offending package(s) and abort
   before publishing anything (AR #7).

---

## Integration Points

### With existing `Lockstep.publish` (`src/lockstep.ts:459`)
- Extends `PublishOptions` with a `provenance?: boolean` field and the CLI with a `--provenance` flag.
- Inserts CI detection + `repository` preflight before the existing topological publish loop; injects
  `--provenance` into the existing per-manager command construction.

### With RD-01 (AI Changelog)
- Independent; no runtime coupling. Both share RD-03's non-functional/security requirements.

### With RD-03 (Non-Functional & Security)
- Inherits the fail-fast preflight philosophy, the non-blocking-local-publish stance, and the
  backward-compatibility guarantee (plain `lockstep publish` is byte-for-byte unchanged).

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Opt-in mechanism | `--provenance` flag / auto-in-CI / config only | Explicit `--provenance` flag + honor `publishConfig.provenance` | Predictable; nothing changes unless asked | AR #5 |
| Non-CI behavior | Skip w/ warning / hard-error / pass flag anyway | Skip with warning, publish without provenance | Never block a legitimate local publish | AR #6 |
| `repository` preflight | Validate all, fail-fast / warn only / leave to npm | Validate all present, fail-fast before any publish | Prevent partial publishes stranding the monorepo | AR #7 |
| Package-manager coverage | npm+pnpm (+yarn via npm) / other | npm + pnpm forward the flag; yarn covered via `npm publish` | Matches lockstep's existing publish paths | AR #14 |
| Trusted publishing / OIDC config | Out of scope / include | Out of scope | Registry-side concern, not the publisher tool's job | AR #15 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it.

---

## Security Considerations

> **🚨 MANDATORY section.**

- **Data sensitivity**: no new secrets are handled by lockstep. Provenance uses the CI's OIDC identity
  and npm's own token (`NODE_AUTH_TOKEN`), exchanged by npm — lockstep never reads, stores, or logs
  these. The whole point of provenance is a **positive** security posture (supply-chain integrity).
- **Input validation**: the `--provenance` flag is a boolean; CI detection reads fixed environment
  variable names and compares to the literal `"true"`. `repository` preflight reads each already-parsed
  `package.json` — no new external input.
- **Authentication & authorization**: unchanged; publishing still relies on the caller's npm auth. OIDC
  token minting is performed by npm/the CI provider, not lockstep.
- **Injection risks**: `--provenance` is a fixed literal appended to the publish argument list — no
  user-controlled string is interpolated. No shell string is built from package or environment content.
- **Encryption needs**: provenance attestations are signed and logged to Sigstore's public transparency
  log by npm over HTTPS; lockstep introduces no plaintext transmission.
- **Rate limiting**: not applicable.
- **Secrets management**: lockstep must not echo `NODE_AUTH_TOKEN` or any OIDC token; publish command
  logs must not include token-bearing environment. See RD-03.
- **Failure integrity**: the fail-fast `repository` preflight is itself a safety control — it prevents a
  half-completed publish (some packages live, some failed) that could otherwise leave the registry in an
  inconsistent, hard-to-reason-about state.

---

## Acceptance Criteria

1. [ ] `lockstep publish --tag latest` **without** `--provenance` builds the exact same publish commands
   as today (no `--provenance` token present) — verified by asserting the constructed command string is
   unchanged from the pre-feature behavior.
2. [ ] `lockstep publish --tag latest --provenance` run with `GITHUB_ACTIONS=true` appends `--provenance`
   to the npm/pnpm publish command for every package in the set.
3. [ ] `lockstep publish --tag latest --provenance` run with **no** supported-CI env var present prints a
   warning naming the supported providers, builds publish commands **without** `--provenance`, and still
   publishes (exit 0) — a local `--provenance` never aborts the publish (AR #6).
4. [ ] With `--provenance` in a supported CI, if any package's `package.json` lacks a `repository` field,
   lockstep throws an error listing the offending package name(s) and performs **zero** `npm publish`
   calls (verified by asserting the publish loop never executes) (AR #7).
5. [ ] A package whose `package.json` sets `publishConfig.provenance: true` has `--provenance` behavior
   applied even without the CLI flag, subject to the same supported-CI gate.
6. [ ] Under `pnpm`, the constructed command is `pnpm publish … --provenance …`; under `npm` and the
   `yarn`→`npm publish` path, it is `npm publish … --provenance …`.
7. [ ] `--dry` with `--provenance` runs CI detection and the `repository` preflight and reports the
   intended provenance state, without executing a real publish.
8. [ ] The publish log states provenance ON (with detected provider) or SKIPPED (with reason) exactly
   once per run.
9. [ ] Security requirements verified: no npm/OIDC token value appears in any log line; `--provenance`
   is appended as a fixed literal with no string interpolation of package/env content (asserted by a
   command-construction test).
