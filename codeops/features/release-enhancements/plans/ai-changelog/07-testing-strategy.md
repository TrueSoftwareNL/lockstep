# Testing Strategy: AI Changelog

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --------- | ------ |
| Change detection, prompts, writers | 90% |
| LLM provider (selection/fallback) | 85% |
| Orchestration / CLI glue | 70% |

- Test names state behavior. Provider tests stub protected SDK seams (no network — AR PA-4).
- Fixture git repos (temp dirs) for change-detection and integration tests; no real API calls.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived from RD-01 acceptance criteria, the 03-XX specs, and the registers. Immutable oracle.
> In-code traceability comments paraphrase behavior in plain language — never cite ST-/AR- ids.

### Change detection (`03-01`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-1 | `parseConventionalCommit("feat(pkg): add x")` | `{ type: "feat", scope: "pkg", subject: "add x" }` | RD-01 §parsing |
| ST-2 | `parseConventionalCommit("fix: typo")` | `{ type: "fix", scope: "", subject: "typo" }` | RD-01 §parsing |
| ST-3 | `parseConventionalCommit("feat!: breaking")` | `{ type: "feat", scope: "", subject: "breaking" }` | RD-01 §parsing |
| ST-4 | `parseConventionalCommit("just a message")` | `{ type: "", scope: "", subject: "just a message" }` | RD-01 §parsing |
| ST-5 | commit `scope="a"`, package "a" present | attributed to `["a"]` (scope match) | RD-01 AR #11 / PA-3 |
| ST-6 | unscoped commit touching files under packages a and b | attributed to `["a","b"]` (file-diff) | RD-01 AR #11 / PA-3 |
| ST-7 | fixture repo with tag `v1.0.0` / with no tags | `getLastReleaseRef()` → `"v1.0.0"` / the first-commit hash | RD-01 AR #10 |
| ST-8 | a commit with `BREAKING CHANGE:` in the body | parsed `ParsedCommit.body` is non-empty and contains it | RD-01 §parsing |
| ST-9 | fixture with changes in package "a" only | `buildPackageChangeSummary` returns a summary for "a"; "b" omitted | RD-01 Must-Have |

### LLM provider & prompts (`03-02`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-10 | `getAvailableProviders` with openai key only / both / none | `["openai"]` / `["openai","anthropic"]` / `[]` | RD-01 AR #4 |
| ST-11 | `generate` with OpenAI seam returning content | `result.provider === "openai"` | RD-01 AR #4 |
| ST-12 | `generate` with OpenAI seam throwing, Anthropic returning | `result.provider === "anthropic"` (fallback) | RD-01 AR #4 |
| ST-13 | `generate` with both seams throwing | returns `null`, does not throw | RD-01 AR #9 / RD-03 |
| ST-14 | `generate` with no keys configured | returns `null` | RD-01 AR #9 |
| ST-15 | `createLLMConfig({ OPENAI_API_KEY:"x", OPENAI_MODEL:"m" })` | config carries the key + model | RD-01 AR #4/#13 |
| ST-16 | `buildChangelogPrompt(summary)` where a changed file has secret contents | prompt contains commit subjects + file **paths**, and NOT the file contents | RD-01 §egress / RD-03 |

### Writers & orchestration (`03-03`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-17 | `writeOrUpdateChangelog` on a package with no CHANGELOG.md | creates it with the Keep a Changelog header + `## [<version>] - <date>` | RD-01 AR #3 |
| ST-18 | `writeOrUpdateChangelog` on an existing CHANGELOG.md | new `## [<version>]` prepended above old entries; old content intact below | RD-01 AR #3 |
| ST-19 | writer with empty content | writes fallback `### Changed` / `- Version bump to <version>` | RD-01 AR #9 |
| ST-20 | content wrapped in ```` ```markdown ```` fences | fences stripped before writing | RD-01 §sanitize |
| ST-21 | `writeReleaseNotes` twice | root `RELEASE_NOTES.md` overwritten with the latest; empty content → placeholder | RD-01 AR #3 |
| ST-22 | `changelog()` with a stubbed provider returning fixed content | per-package `CHANGELOG.md` + root `RELEASE_NOTES.md` written | RD-01 AR #2/#3 |
| ST-23 | `changelog({ dryRun: true })` | **no** files written | RD-01 §dry-run |
| ST-24 | `changelog()` with no API keys | fallback entries + placeholder notes written; returns without throwing | RD-01 AR #9 |
| ST-25 | `version()` where `changelog()` throws (stubbed) in a fixture repo | the version bump/commit/tag still complete; the error is a warning, not a failure | RD-03 AC2 / AR #12 |
| ST-26 | any run with a sentinel in `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` | the sentinel appears in no generated file and no log line | RD-01 §security / RD-03 |

> **AUTHORING RULE:** expectations come from the spec, not imagined implementation output.

## Test Categories

### Specification Tests
> Written BEFORE implementation. Filed per module as `*.spec.test.ts`.

| Test File | ST Cases | Component |
| --------- | -------- | --------- |
| `src/changelog/change-detection.spec.test.ts` | ST-1…9 | change detection |
| `src/changelog/llm-provider.spec.test.ts` | ST-10…16 | provider + prompts |
| `src/changelog/writers.spec.test.ts` | ST-17…21 | writers |
| `src/changelog/orchestration.spec.test.ts` | ST-22…26 | `Lockstep.changelog` + `version` integration |

### Implementation Tests (edge cases, internals)
> Filed as `*.impl.test.ts`: empty repo, non-conventional-only history, capped body/file lists,
> token-total accounting, multi-package attribution ties, verbose output.

## Test Data

### Fixtures
- Temp git repos (init, commit, tag) for change-detection + `version`/orchestration integration.
- In-memory `PackageChangeSummary` fixtures for prompt/writer tests.
- A `LLMProvider` subclass stubbing `callOpenAI`/`callAnthropic` (AR PA-4).

### Mock Requirements
- No network, no real API calls, no `execSync` mocking — protected-seam subclass + git fixtures.

## Verification Checklist
- [ ] All ST-* defined with concrete input/output pairs, traced to RD-01/03-XX/AR
- [ ] Spec tests written BEFORE implementation; red phase recorded
- [ ] Spec tests pass after implementation (green)
- [ ] Impl tests written for edges/internals
- [ ] Core `version`/`publish` run with the SDKs absent from `node_modules`
- [ ] `npm run type-check && npm test` passes; no regressions
