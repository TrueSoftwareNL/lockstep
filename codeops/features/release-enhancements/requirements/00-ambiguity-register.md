## Ambiguity Register: release-enhancements

> **Status**: ✅ GATE PASSED — all 15 items resolved
> **Last Updated**: 2026-07-11 23:52

Feature: `release-enhancements` — two capabilities that close semantic-release gaps for the
lockstep monorepo release tool: (RD-01) AI-based changelog & release-notes generation and
(RD-02) npm provenance support. RD-03 captures cross-cutting non-functional & security
requirements.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| 1 | Naming / Scope | How to organize the two features in the codeops/ layout | Two separate features / One combined feature | One combined feature `release-enhancements` (RD-01 changelog, RD-02 provenance) | ✅ Resolved |
| 2 | Scope / Behavioral | Where AI changelog generation plugs into the workflow | New command + auto in version / Standalone only / Inside version only | New `lockstep changelog` command **and** auto-run during `lockstep version` (opt-out) | ✅ Resolved |
| 3 | Feature / Data | Which changelog artifacts the AI generates | Per-package + root notes / Root CHANGELOG only / Per-package only | Per-package `CHANGELOG.md` (Keep a Changelog) + root `RELEASE_NOTES.md` (non-technical) | ✅ Resolved |
| 4 | Technical / Integration | Which LLM provider(s) to support | Anthropic+OpenAI fallback / Anthropic only / Agnostic adapter | OpenAI primary, Anthropic fallback, env-configurable | ✅ Resolved |
| 5 | Scope / Behavioral | How npm provenance is turned on | Explicit `--provenance` flag / Auto-enable in CI / Config only | Explicit `--provenance` flag (also honor `publishConfig.provenance`) | ✅ Resolved |
| 6 | Behavioral / Edge case | Behavior when provenance requested but not in supported CI | Skip with warning, continue / Hard-error / Pass flag anyway | Skip with a clear warning, publish without provenance (never block a local publish) | ✅ Resolved |
| 7 | Security / Data | Preflight the `repository` field before provenance publish | Validate all, fail-fast / Warn but continue / Leave to npm | Validate every package has a matching `repository` field; fail-fast before any publish | ✅ Resolved |
| 8 | Scope | Is GitHub Release creation in scope this round | Out of scope / Include it | Out of scope this round (documented future gap) | ✅ Resolved |
| 9 | Behavioral | Reliability stance when LLM/key unavailable or generation fails | Never block release (write fallback entry, continue) / Block release on failure | User accepted recommendation: never block the release — write a fallback "Version bump" entry and continue | ✅ Resolved |
| 10 | Technical / Data | Base git ref for "changes since last release" | Reuse lockstep's existing `vX.Y.Z` tag scheme (`git describe --tags`), bootstrap to first commit if no tags / Other | User accepted recommendation: reuse lockstep's existing `vX.Y.Z` tag scheme, bootstrap to first commit if no tags | ✅ Resolved |
| 11 | Technical / Data | How commits are attributed to packages in a generic (non-blendsdk) monorepo | File-diff attribution primary + conventional-commit scope match, via lockstep's generic package discovery + configurable `packagesDirs` / Other | User accepted recommendation: file-diff attribution primary + conventional-commit scope match, via generic package discovery | ✅ Resolved |
| 12 | Behavioral | Ordering of auto-run changelog within `lockstep version`, and what lands in the release commit | Bump versions → generate changelog → `git add`/commit/tag so changelog files are in the release commit / Generate separately, own commit | User accepted recommendation: bump → generate changelog → commit/tag so changelog files land in the release commit | ✅ Resolved |
| 13 | Technical / UX | Default LLM models (overridable via env) | Current-generation defaults (OpenAI primary + Anthropic fallback), env-overridable / Pin specific older models | User accepted recommendation: current-generation defaults, overridable via env vars | ✅ Resolved |
| 14 | Integration | Package-manager coverage for `--provenance` | npm + pnpm forward `--provenance`; yarn path already uses `npm publish` so covered / Other | User accepted recommendation: npm + pnpm forward `--provenance`; yarn path covered via `npm publish` | ✅ Resolved |
| 15 | Scope | npm trusted publishing / OIDC auto-provenance registry configuration | Out of scope (registry-side concern, not lockstep's job) / Include | User accepted recommendation: out of scope (registry-side concern) | ✅ Resolved |

### Resolution Notes

**AR-1 … AR-8:** Resolved by explicit user selections across two decision batches this session.

**AR-9 … AR-15:** Derived from the blendsdk-v5 reference generator, lockstep's existing code
(`src/lockstep.ts` tag/version handling), and npm provenance constraints. Presented to the user
for bulk confirmation or per-item veto. These are recommendations, not yet user-confirmed — the
gate remains BLOCKED until the user confirms.
