# npm Provenance Implementation Plan

> **Feature**: Opt-in npm provenance on `lockstep publish` — supply-chain attestation with CI detection and a fail-fast `repository` preflight
> **Status**: Planning Complete
> **Created**: 2026-07-12
> **Implements**: release-enhancements/RD-02
> **CodeOps Skills Version**: 3.3.2

## Overview

npm provenance produces a signed, publicly verifiable record binding a published package to its
source commit and CI build (Sigstore + the CI's OIDC identity). This plan adds an opt-in
`--provenance` flag to `lockstep publish` that forwards provenance generation to the underlying
package manager, with the safety rails provenance requires: it only works from a supported cloud
CI/CD, so lockstep detects that environment and skips-with-warning when absent, and it validates
the `repository` field of every provenance-enabled package up front so a partial publish can't
strand half the monorepo on the registry.

The implementation extracts the provenance decision and publish-command construction into **pure,
directly-testable functions** (`src/provenance.ts`), leaving `publish()` as thin orchestration.
This closes a semantic-release parity gap while keeping lockstep's existing publish behavior
byte-for-byte unchanged when the flag is not used.

## Document Index

| #   | Document                                       | Description                                 |
| --- | ---------------------------------------------- | ------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md)                           | This document — overview and navigation     |
| 01  | [Requirements](01-requirements.md)             | Scope delta over RD-02                       |
| 02  | [Current State](02-current-state.md)           | Analysis of the current publish path        |
| 03-01 | [Provenance & Publish Command](03-01-provenance-publish.md) | Technical specification |
| 07  | [Testing Strategy](07-testing-strategy.md)     | Specification test cases and verification    |
| 99  | [Execution Plan](99-execution-plan.md)         | Phases and task checklist                    |

## Quick Reference

### Usage Examples

```bash
# In GitHub Actions / GitLab CI (id-token: write): publish all packages with provenance
lockstep publish --tag latest --provenance

# Locally (no supported CI): warns and publishes WITHOUT provenance — never blocks
lockstep publish --tag latest --provenance

# Dry run: runs CI detection + repository preflight, reports intended provenance state
lockstep publish --tag latest --provenance --dry
```

### Key Decisions

| Decision | Outcome | Ref |
| -------- | ------- | --- |
| Enablement | Explicit `--provenance` flag + honor `publishConfig.provenance` | RD-02 AR #5 |
| Non-CI behavior | Skip with warning, publish without provenance | RD-02 AR #6 |
| Repository preflight | Fail-fast; only for provenance-enabled packages | RD-02 AR #7, plan AR PA-3 |
| Package managers | npm + pnpm forward `--provenance`; yarn via `npm publish` | RD-02 AR #14 |
| Testability | Pure helpers in `src/provenance.ts`, tested directly | plan AR PA-2 |
| Verify command | `npm run type-check && npm test` | plan AR PA-1 |

## Related Files

- **New**: `src/provenance.ts`, `src/provenance.spec.test.ts`, `src/provenance.impl.test.ts`
- **Modified**: `src/lockstep.ts` (publish orchestration), `src/cli.ts` (`--provenance` flag + help), `src/types.ts` (`PublishOptions.provenance`, `PackageJson.publishConfig`), `README.md`
