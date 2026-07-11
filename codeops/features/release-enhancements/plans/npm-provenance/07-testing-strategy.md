# Testing Strategy: npm Provenance

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --------- | ------ |
| Core decision logic (`src/provenance.ts`) | 90% |
| `publish()` orchestration glue | 80% |
| CLI parsing / help | 60% |

- Test names state behavior: `should [expected] when [condition]`.
- The pure helpers are tested directly (no `execSync` mocking) per AR PA-2.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived exclusively from RD-02 acceptance criteria, `03-01-provenance-publish.md`, and the
> registers. Immutable oracle: if the implementation disagrees, the implementation is wrong.
> In-code traceability comments must paraphrase behavior in plain language — never cite ST-/AR- ids
> or `requirements/` paths.

### `buildPublishCommand` (pure)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-1 | `npm`, `{access:"public", tag:"latest", provenance:false, dry:false}` | `npm publish --access public --tag latest` — **no** `--provenance`; identical to pre-feature output | RD-02 AC1 |
| ST-6a | `pnpm`, `{…, provenance:true, dry:false}` | command starts `pnpm publish` and contains `--provenance` | RD-02 AC6 / AR #14 |
| ST-6b | `npm` (and yarn→npm path), `{…, provenance:true}` | command starts `npm publish` and contains `--provenance` | RD-02 AC6 / AR #14 |
| ST-7c | `npm`, `{…, provenance:true, dry:true}` | command contains both `--provenance` and `--dry-run` | RD-02 AC7 |

### `detectSupportedCI` (pure)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-11a | `{ GITHUB_ACTIONS: "true" }` | `{ supported: true, provider: "github" }` | 03-01 §CI detection / AR #6 |
| ST-11b | `{ GITLAB_CI: "true" }` | `{ supported: true, provider: "gitlab" }` | 03-01 §CI detection / AR #6 |
| ST-11c | `{}` (neither set) | `{ supported: false, provider: null }` | 03-01 §CI detection / AR #6 |
| ST-11d | `{ GITHUB_ACTIONS: "false" }` | `{ supported: false, provider: null }` — literal `"true"` required | 03-01 §CI detection |

### `planProvenance` (pure)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-2 | flag `true`, env GitHub Actions, 2 pkgs both with `repository` | `effective:true`, `enabledPackages` = both, `missingRepository` = `[]` | RD-02 AC2 |
| ST-3 | flag `true`, env `{}` (no CI) | `effective:false`, `skippedReason` names GitHub Actions/GitLab CI, `enabledPackages` = ∅ | RD-02 AC3 / AR #6 |
| ST-4 | flag `true`, env GitHub Actions, one pkg missing `repository` | `effective:true`, `missingRepository` = `[<that pkg>]` | RD-02 AC4 / AR #7 |
| ST-5 | flag `false`, `pkgA.publishConfig.provenance=true`, `pkgB` none, env GitHub Actions | `requested:true`, `effective:true`, `enabledPackages` = `{pkgA}` | RD-02 AC5 |
| ST-10 | flag `false`, `pkgA.publishConfig.provenance=true` (has `repository`), `pkgB` **missing** `repository` (not provenance-enabled), env GitHub Actions | `missingRepository` = `[]` — pkgB is not validated | AR PA-3 |
| ST-2b | flag `false`, no publishConfig opt-ins | `requested:false`, `effective:false`, `enabledPackages` = ∅ | RD-02 AC1 |

### `provenanceLogLine` (pure)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-8a | plan with `effective:true`, provider `github` | returns exactly `Provenance: ON (github)` | RD-02 AC8 |
| ST-8b | plan with `requested:true`, `effective:false` | returns exactly one `Provenance: SKIPPED — <reason>` line | RD-02 AC8 |
| ST-8c | plan with `requested:false` | returns `null` (nothing logged) | RD-02 AC8 |
| ST-9 | any plan (with a sentinel token present in the environment) | the returned line contains only provider/reason text — never a token or command; `buildPublishCommand` output likewise contains no env/token content, only the fixed `--provenance` literal | RD-02 AC9 / RD-03 |

### `publish()` integration

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-4i | publish set with a provenance-enabled package missing `repository`, in CI, `--provenance` | `publish()` throws an error naming the package **before** the publish loop runs (throw precedes any `execSync`, so no package is published — no mock needed) | RD-02 AC4 / AR #7 |

> **AUTHORING RULE:** expectations come from the spec above, not imagined implementation output.

## Test Categories

### Specification Tests (from ST-cases above)
> Written BEFORE implementation. Filed as `src/provenance.spec.test.ts`.

| Test File | ST Cases Covered | Component |
| --------- | ---------------- | --------- |
| `src/provenance.spec.test.ts` | ST-1, ST-2, ST-2b, ST-3, ST-4, ST-4i, ST-5, ST-6a/b, ST-7c, ST-8a–c, ST-9, ST-10, ST-11a–d | provenance decision layer + command builder + log line + publish throw |

> ST-4i (publish-level throw) is also covered here via a fixture workspace; because the throw
> occurs before the loop, no `execSync` runs — satisfying "no package published" without mocking.

### Implementation Tests (edge cases, internals)
> Written AFTER implementation. Filed as `src/provenance.impl.test.ts`.

| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `src/provenance.impl.test.ts` | Empty publish set; both GITHUB_ACTIONS and GITLAB_CI set (github wins); `publishConfig.provenance:false` treated as off; `--dry` path builds `--dry-run`; access value passthrough | High |

### Integration Tests

| Test | Components | Description |
| ---- | ---------- | ----------- |
| publish baseline | `publish()` + `buildPublishCommand` | With `--provenance` absent, constructed commands equal pre-feature output (ST-1 at integration level) |

## Test Data

### Fixtures Needed
- In-memory `WorkspacePackage[]` fixtures (name, `data.publishConfig`, `data.repository`) — no disk needed for the pure-helper specs.
- A temp fixture workspace (two packages, one missing `repository`) for ST-4i.

### Mock Requirements
- None for the pure helpers (env passed as an argument). No `execSync` mocking (AR PA-2).

## Verification Checklist
- [ ] All ST-* defined with concrete input/output pairs
- [ ] Every ST case traces to RD-02 AC / 03-01 / AR
- [ ] Spec tests written BEFORE implementation
- [ ] Spec tests verified to FAIL before implementation (red phase)
- [ ] All spec tests pass after implementation (green phase)
- [ ] Impl tests written for edge cases and internals
- [ ] No regressions in `src/lockstep.test.ts`
- [ ] `npm run type-check && npm test` passes
