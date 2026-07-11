# Requirements: npm Provenance

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-02](../../requirements/RD-02-npm-provenance.md) — the OWNING requirements doc (also RD-03 for shared non-functional/security)

## Scope of this plan (delta view)

### In this plan
- RD-02 Must-Have: `--provenance` flag; honor `publishConfig.provenance`; forward to npm/pnpm (yarn via npm); supported-CI detection (GitHub Actions, GitLab CI); skip-with-warning outside CI; fail-fast `repository` preflight; checks run before the topo publish loop.
- RD-02 Should-Have: per-run provenance state log (ON+provider / SKIPPED+reason); `--dry` + `--provenance` reports intent and runs preflight without publishing.
- RD-03 applicable clauses: backward compatibility (unchanged publish when flag absent), token non-leakage in logs, fail-fast preflight as a safety control.

### Deferred / out of this plan
- RD-02 Won't-Have: npm trusted publishing / OIDC auto-provenance (AR #15), post-publish `npm audit signatures` verification, deep `repository`-URL equality (lockstep asserts presence; npm performs the authoritative match).
- RD-01 (AI changelog) — separate plan.

## Plan-local decisions

| Decision | Chosen | AR Ref |
| -------- | ------ | ------ |
| Verify command | `npm run type-check && npm test` | AR PA-1 |
| Testability approach | Extract pure helpers in `src/provenance.ts`, tested directly (no `execSync` mocking) | AR PA-2 |
| Preflight scope under per-package `publishConfig` | Validate `repository` only for provenance-enabled packages (all with `--provenance`; the `publishConfig` subset otherwise) | AR PA-3 |

> Every RD-level scope decision is owned by RD-02 / RD-03; this table lists only decisions that
> did not already exist in the RD. See `00-ambiguity-register.md` and the RD's own register.

## Acceptance Criteria

Plan-local (the RD owns its acceptance criteria — see RD-02 AC1–AC9; the ST-cases in
`07-testing-strategy.md` operationalize them):

1. [ ] The pure decision layer (`planProvenance`, `detectSupportedCI`, `buildPublishCommand`) is
   covered by specification tests derived from RD-02's acceptance criteria, passing under
   `npm run type-check && npm test`.
2. [ ] `git diff` shows no behavioral change to `publish()` output when `--provenance` is absent
   (baseline command strings identical).
