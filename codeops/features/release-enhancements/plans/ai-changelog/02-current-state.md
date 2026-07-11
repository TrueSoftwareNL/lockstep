# Current State: AI Changelog

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

`Lockstep.version()` (`src/lockstep.ts:390-453`) bumps every package's version and internal
dependency ranges, updates the root `package.json`, then stages everything with `git add .`
(`:444`), commits `chore(release): v<next>`, and tags. `determineVersionType()` (`:306`) already
reads conventional commits since the last tag via `git describe --tags --abbrev=0` (`:292`, `:309`)
and `git log <tag>..HEAD` — but only the subject (`%s`, `:319`), and it discards the commits after
choosing a bump. `findPackageDirs()` (`:109`) discovers packages generically under the configured
`packagesDirs` (default `["packages"]`). The CLI routes commands in `main()` (`src/cli.ts:111`),
parsing flags via `parseCliOptions` (`:22`).

There is no changelog generation, no LLM integration, and no `RELEASE_NOTES.md`. The root
`CHANGELOG.md` is hand-maintained.

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/lockstep.ts` | `version()`, workspace build, discovery | Add `changelog()` method; call it inside `version()` before `git add .`, guarded by `noChangelog` and a try/catch |
| `src/cli.ts` | Command routing + flag parsing | Add `changelog` command; `--no-changelog` on version; `--dry-run`/`--verbose` on changelog; help text |
| `src/types.ts` | `VersionOptions` | Add `noChangelog?: boolean` |
| `src/changelog/*` | — | **New** module: types, change-detection, llm-provider, prompts, changelog-writer, release-notes-writer |
| `package.json` | deps | Add `openai`, `@anthropic-ai/sdk` to `optionalDependencies` |
| `README.md` | docs | Document the `changelog` command, env vars, non-blocking behavior |

### Code Analysis

The base-ref + commit-reading machinery in `determineVersionType()` is the pattern to reuse, but the
changelog needs the **body** too (`%b`), fixing the subject-only limitation. Package discovery
(`findPackageDirs` → `buildWorkspace`) yields `WorkspacePackage[]` with `dir`, `name`, `version`,
`data`; attribution maps commits to these generically (no hardcoded `packages/` or scope).

## Gaps Identified

### Gap 1: No changelog artifacts
**Current:** releases ship no generated changelog/notes. **Required:** per-package `CHANGELOG.md` +
root `RELEASE_NOTES.md`. **Fix:** the new `src/changelog/` module + `Lockstep.changelog()`.

### Gap 2: Commits parsed but discarded, subject-only
**Current:** `determineVersionType` reads `%s` only and throws commits away. **Required:** full
commit (incl. body) attributed per package. **Fix:** `change-detection.ts` reads `%h/%s/%b` and
attributes.

### Gap 3: No LLM integration / no graceful degradation
**Current:** none. **Required:** OpenAI→Anthropic fallback that never blocks a release. **Fix:**
`llm-provider.ts` with dynamic imports + fallback entry writers.

## Dependencies

### Internal
- `buildWorkspace()` / `ensureAllSameVersion()` / `findPackageDirs()` for packages + the version.
- The existing tag/log git helpers pattern.

### External
- `openai`, `@anthropic-ai/sdk` — new `optionalDependencies`, dynamically imported (absent-safe).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| A changelog failure aborts a release | Low | High | `version()` wraps `changelog()` in try/catch; provider never throws; fallback entry (RD-03) |
| SDKs missing at runtime | Med | Low | Dynamic import caught → fallback path; core commands unaffected |
| Commit metadata for a private repo leaves the machine | Med | Med | Opt-in (only with keys); metadata + file paths only, never file contents (RD-01, RD-03) |
| `git add .` in `version()` stages stray files alongside the changelog | Low | Low | Pre-existing behavior; unchanged by this plan (documented, not fixed here) |
