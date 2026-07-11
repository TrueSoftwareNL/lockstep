# Requirements: AI Changelog

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-ai-changelog.md) — the OWNING requirements doc (also RD-03 for shared non-functional/security)

## Scope of this plan (delta view)

### In this plan
- RD-01 Must-Have: `changelog` command; auto-run in `version` with `--no-changelog` opt-out; base ref from `vX.Y.Z` tags (bootstrap to first commit); scope+file-diff attribution via generic discovery; OpenAI→Anthropic fallback from env; per-package `CHANGELOG.md` (Keep a Changelog, prepend) + root `RELEASE_NOTES.md`; non-blocking fallback; `--dry-run`; metadata-only egress.
- RD-01 Should-Have: `--verbose`; deterministic alphabetical ordering; token-usage totals.
- RD-03 applicable: never block a release; optional dynamically-imported SDKs; secrets never logged/committed; metadata-only egress; spec/impl test split.

### Deferred / out of this plan
- RD-01 Won't-Have: GitHub Release creation; a general lockstep config file; localization; sending file contents.
- RD-02 (npm provenance) — shipped separately.

## Plan-local decisions

| Decision | Chosen | AR Ref |
| -------- | ------ | ------ |
| Verify command | `npm run type-check && npm test` | AR PA-1 |
| LLM SDK declaration | `optionalDependencies` (`openai`, `@anthropic-ai/sdk`), dynamically imported | AR PA-2 |
| Commit attribution | Scope match (package dir basename / unscoped name) or changed-file paths, via lockstep's generic discovery | AR PA-3 |
| Provider testability | Protected `callOpenAI`/`callAnthropic` seams stubbed via a test subclass | AR PA-4 |

## Acceptance Criteria

Plan-local (RD-01 owns AC1–AC10; the ST-cases in `07-testing-strategy.md` operationalize them):

1. [ ] Change-detection, prompt-building, and writers are covered by specification tests derived
   from RD-01's acceptance criteria and pass under `npm run type-check && npm test`.
2. [ ] The core tool (`version` without changelog / `publish`) runs with `openai` and
   `@anthropic-ai/sdk` absent from `node_modules` — dynamic-import failure routes to the fallback.
3. [ ] A sentinel value in `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` appears in no generated file, no
   log line, and no commit.
