# Execution Plan: AI Changelog

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-07-12 01:05
> **Progress**: 13/26 tasks (50%)
> **CodeOps Skills Version**: 3.3.2

## Overview

Build the `src/changelog/` module and wire it into `lockstep`. Four spec-first phases: change
detection → LLM provider + prompts → writers + orchestration → CLI/version integration + packaging +
docs. The pipeline never blocks a release; SDKs are optional and dynamically imported.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| ----- | ----- | ----- |
| 1 | Change detection + types | 7 |
| 2 | LLM provider + prompts | 6 |
| 3 | Writers + orchestration | 7 |
| 4 | CLI, version integration, packaging, docs | 6 |

**Total: 26 tasks across 4 phases**

> **⚠️ EXECUTION RULE:** The task checkboxes are the single source of truth. On implementation mark
> `[~]` with a timestamp + bump Progress; on verify pass promote to `[x]`. Only `[x]` counts.
> Resume from the first `[~]`, else the first `[ ]`. Timestamps via `date '+%Y-%m-%d %H:%M'`.

---

## Phase 1: Change detection + types

### Step 1.1: Specification tests (BEFORE implementation)
**Reference**: `07-testing-strategy.md` ST-1…9 · AR PA-3
- [x] 1.1.1 Write spec tests for `parseConventionalCommit`, `getLastReleaseRef`, `getCommitsSinceRef` (body capture), `attributeCommitToPackages`, `buildPackageChangeSummary` over a temp git fixture — `src/changelog/change-detection.spec.test.ts` ✅ (completed: 2026-07-12 00:58)
- [x] 1.1.2 Run — verify FAIL (red phase) ✅ (completed: 2026-07-12 00:58) — suite fails on missing module; correct red state

### Step 1.2: Implementation
**Reference**: `03-01-change-detection.md`
- [x] 1.2.1 Add `ParsedCommit`, `PackageChangeSummary`, `ChangelogOptions` — `src/changelog/types.ts` ✅ (completed: 2026-07-12 00:59)
- [x] 1.2.2 Implement `src/changelog/change-detection.ts` (base ref, changed files, conventional parse incl. body, generic scope+file attribution, summary assembly) ✅ (completed: 2026-07-12 00:59)
- [x] 1.2.3 Run spec tests — verify PASS (green); fix implementation, never the test ✅ (completed: 2026-07-12 00:59) — 46/46 pass

### Step 1.3: Implementation tests & hardening
**Reference**: `07-testing-strategy.md` §Impl Tests
- [x] 1.3.1 Write impl tests: no-tags bootstrap, non-conventional-only history, multi-package attribution ties — `src/changelog/change-detection.impl.test.ts` ✅ (completed: 2026-07-12 01:00)
- [x] 1.3.2 Full verification ✅ (completed: 2026-07-12 01:00) — 50/50 pass, type-check clean

**Verify**: `npm run type-check && npm test`

---

## Phase 2: LLM provider + prompts

### Step 2.1: Specification tests
**Reference**: `07-testing-strategy.md` ST-10…16 · AR PA-4
- [x] 2.1.1 Write spec tests via a `LLMProvider` subclass stubbing `callOpenAI`/`callAnthropic`: provider ordering, OpenAI→Anthropic fallback, both-fail→null, no-key→null, `createLLMConfig`, prompt metadata-only — `src/changelog/llm-provider.spec.test.ts` ✅ (completed: 2026-07-12 01:02)
- [x] 2.1.2 Run — verify FAIL (red phase) ✅ (completed: 2026-07-12 01:02) — missing module; correct red state

### Step 2.2: Implementation
**Reference**: `03-02-llm-provider-and-prompts.md`
- [x] 2.2.1 Add `LLMConfig`, `LLMResult` types; implement `src/changelog/llm-provider.ts` (`createLLMConfig`, `LLMProvider` with protected dynamic-import seams, never-throw `generate`) and `src/changelog/prompts.ts` (metadata-only builders). Default models current-gen (`gpt-4o-mini`, `claude-haiku-4-5-20251001`), env-overridable; SDKs via runtime-resolved dynamic import (optional, no build dep) ✅ (completed: 2026-07-12 01:04)
- [x] 2.2.2 Run spec tests — verify PASS (green) ✅ (completed: 2026-07-12 01:04) — fixed exactOptionalPropertyTypes on LLMConfig; 59/59 pass

### Step 2.3: Implementation tests & hardening
- [x] 2.3.1 Write impl tests: timeout/maxTokens defaults, capped body/file formatting, token accounting — `src/changelog/llm-provider.impl.test.ts` ✅ (completed: 2026-07-12 01:05)
- [x] 2.3.2 Full verification ✅ (completed: 2026-07-12 01:05) — 63/63 pass, type-check clean

**Verify**: `npm run type-check && npm test`

---

## Phase 3: Writers + orchestration

### Step 3.1: Specification tests
**Reference**: `07-testing-strategy.md` ST-17…24, ST-26
- [ ] 3.1.1 Write spec tests for `writeOrUpdateChangelog` (create/prepend/fence-strip/fallback), `writeReleaseNotes` (overwrite/placeholder), and `Lockstep.changelog()` with a stubbed provider (writes files; dryRun writes none; no-key writes fallback; no secret leak) — `src/changelog/writers.spec.test.ts`, `src/changelog/orchestration.spec.test.ts`
- [ ] 3.1.2 Run — verify FAIL (red phase)

### Step 3.2: Implementation
**Reference**: `03-03-writers-and-orchestration.md`
- [ ] 3.2.1 Implement `src/changelog/changelog-writer.ts` + `src/changelog/release-notes-writer.ts` (sanitize, create/prepend, fallback, placeholder)
- [ ] 3.2.2 Implement `Lockstep.changelog(options)` orchestration (build summaries → provider → generate → write; dryRun; no-key fallback; token totals; verbose) — `src/lockstep.ts`
- [ ] 3.2.3 Run spec tests — verify PASS (green)

### Step 3.3: Implementation tests & hardening
- [ ] 3.3.1 Write impl tests: empty-summary early return, verbose output, alphabetical ordering — `src/changelog/writers.impl.test.ts`
- [ ] 3.3.2 Full verification

**Verify**: `npm run type-check && npm test`

---

## Phase 4: CLI, version integration, packaging, docs

### Step 4.1: Specification test
**Reference**: `07-testing-strategy.md` ST-25 · AR #12
- [ ] 4.1.1 Write spec test: in a temp git fixture, `version()` where a stubbed `changelog()` throws still completes the bump/commit/tag (error degrades to a warning) — `src/changelog/orchestration.spec.test.ts`
- [ ] 4.1.2 Run — verify FAIL (red phase)

### Step 4.2: Implementation
**Reference**: `03-03-writers-and-orchestration.md` §CLI / §version integration / §Packaging
- [ ] 4.2.1 Wire the `changelog` command + `--dry-run`/`--verbose`, add `--no-changelog` to `version`, `noChangelog` to `VersionOptions`, and call `changelog()` (try/catch) inside `version()` before `git add .` — `src/cli.ts`, `src/types.ts`, `src/lockstep.ts`
- [ ] 4.2.2 Add `openai` + `@anthropic-ai/sdk` to `optionalDependencies` and document the `changelog` command, env vars, and non-blocking behavior — `package.json`, `README.md`
- [ ] 4.2.3 Run spec tests — verify PASS (green)

### Step 4.3: Implementation tests & full verification
- [ ] 4.3.1 Impl test: core `version`/`publish` behave with SDKs absent (dynamic-import failure → fallback) — `src/changelog/orchestration.impl.test.ts`
- [ ] 4.3.2 Full verification (all phases)

**Verify**: `npm run type-check && npm test`

---

## Dependencies

```
Phase 1 (change detection)
    ↓
Phase 2 (provider + prompts)
    ↓
Phase 3 (writers + orchestration)
    ↓
Phase 4 (CLI + integration + packaging + docs)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `npm run type-check && npm test` passing
3. ✅ No warnings/errors; no dead code
4. ✅ Security: keys never logged/written/committed; only commit metadata + file paths sent to the LLM (no file contents)
5. ✅ Never blocks a release — no key / provider failure writes fallback and continues; a `version`-triggered changelog error degrades to a warning
6. ✅ Core `version`/`publish` run with the SDKs absent
7. ✅ `README.md` updated
8. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
