## Ambiguity Register: npm-provenance (plan)

> **Status**: ✅ GATE PASSED — all 3 items resolved
> **Last Updated**: 2026-07-12 00:11

Plan for `release-enhancements/RD-02` (npm Provenance Support). The **feature-level** decisions are
inherited resolved from the requirements register
(`../../requirements/00-ambiguity-register.md`, AR #5–#8, #14, #15) and are not re-litigated here.
This register captures only **new implementation-level** ambiguities surfaced during planning.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| PA-1 | Technical / Tooling | Project verify command that fills every Verify line | `npm run type-check && npm test` (tsc --noEmit + vitest) / `npm test` only / other | User chose: `npm run type-check && npm test` | ✅ Resolved |
| PA-2 | Technical / Testing | How to make CI detection + publish-command construction + repository preflight unit-testable, given `publish()` currently calls `execSync` inline (`src/lockstep.ts:489-505`) | Extract pure helper functions (build-args, detect-CI, preflight) tested directly / Keep inline and mock `execSync` in tests | User chose: extract pure helper functions, tested directly | ✅ Resolved |
| PA-3 | Behavioral / Data | Scope of the `repository`-field preflight when provenance is enabled per-package via `publishConfig` rather than the global `--provenance` flag | Validate `repository` only for packages that will publish WITH provenance (all when `--provenance`; the `publishConfig` subset otherwise) / Validate every package in the publish set whenever provenance is requested at all | User chose: validate only provenance-enabled packages (all with `--provenance`; the `publishConfig` subset otherwise) | ✅ Resolved |

### Resolution Notes

**Inherited (feature-level):** AR #5 (explicit `--provenance` flag + honor `publishConfig.provenance`),
AR #6 (skip-with-warning outside supported CI), AR #7 (fail-fast `repository` preflight), AR #8
(GitHub Release out of scope), AR #14 (npm+pnpm forward the flag; yarn via `npm publish`), AR #15
(trusted publishing out of scope) — all ✅ Resolved in the requirements register.

**PA-1 … PA-3:** New plan-level decisions. Recommendations shown; presented to the user for
confirmation. Gate remains BLOCKED until confirmed.
