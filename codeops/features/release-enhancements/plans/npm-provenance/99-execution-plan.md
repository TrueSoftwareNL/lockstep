# Execution Plan: npm Provenance

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-07-12 00:11
> **Progress**: 0/12 tasks (0%)
> **CodeOps Skills Version**: 3.3.2

## Overview

Add opt-in npm provenance to `lockstep publish`. Phase 1 builds and spec-tests the pure decision
layer (`src/provenance.ts` + types). Phase 2 wires it into `publish()` and the CLI, adds the one
integration spec (throw-before-loop), and updates docs. Specification-first ordering throughout.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| ----- | ----- | ----- |
| 1 | Provenance decision layer (pure) | 7 |
| 2 | Publish & CLI integration | 5 |

**Total: 12 tasks across 2 phases** (task size bounded per quality-checklist criteria)

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the **single source of truth** for progress. Every task line
> appears exactly once. The executing agent MUST:
>
> 1. **On implementation:** mark `[~]` with a timestamp —
>    `- [~] 1.1.1 … ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote to `[x]` —
>    `- [x] 1.1.1 … ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** and Last Updated after EVERY task — never batch. Only `[x]` counts.
> 4. **Resume** by scanning top-to-bottom: first `[~]`, else first `[ ]`.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'` — never invented.

---

## Phase 1: Provenance decision layer (pure)

### Step 1.1: Specification tests (BEFORE implementation)

**Reference**: `07-testing-strategy.md` ST-1, ST-2/2b, ST-3, ST-4, ST-4i, ST-5, ST-6a/b, ST-7c, ST-8a–c, ST-9, ST-10, ST-11a–d · AR PA-2
**Objective**: Encode expected behavior of the pure helpers before they exist.

- [ ] 1.1.1 Write spec tests for `detectSupportedCI`, `planProvenance`, `buildPublishCommand`, `provenanceLogLine` from the ST-cases — `src/provenance.spec.test.ts` (MUST NOT read implementation; helpers do not exist yet)
- [ ] 1.1.2 Run spec tests — verify they FAIL (red phase); document any pre-passing case

**Deliverables**:
- [ ] `src/provenance.spec.test.ts` covering the Phase-1 ST-cases, failing for the right reason

**Verify**: `npm run type-check && npm test`

### Step 1.2: Implementation

**Reference**: `03-01-provenance-publish.md` §Implementation Details · AR #5, #6, #7, #14, PA-3
**Objective**: Implement the pure decision layer to satisfy the spec tests.

- [ ] 1.2.1 Add `provenance?: boolean` to `PublishOptions` and typed `publishConfig?: { provenance?: boolean; access?: string }` to `PackageJson` — `src/types.ts`
- [ ] 1.2.2 Implement `detectSupportedCI`, `planProvenance`, `buildPublishCommand`, `provenanceLogLine` (pure; env passed in) — `src/provenance.ts`
- [ ] 1.2.3 Run spec tests — verify they PASS (green phase); if any fails, fix the implementation, never the test

**Deliverables**:
- [ ] `src/provenance.ts` with all four exported helpers documented (JSDoc + `@example` on public API)
- [ ] Phase-1 spec tests green

**Verify**: `npm run type-check && npm test`

### Step 1.3: Implementation tests & hardening

**Reference**: `07-testing-strategy.md` §Implementation Tests
**Objective**: Cover edges and internals of the pure layer.

- [ ] 1.3.1 Write impl tests: empty publish set; both CI vars set (github wins); `publishConfig.provenance:false` off; access passthrough; dry builds `--dry-run` — `src/provenance.impl.test.ts`
- [ ] 1.3.2 Full verification

**Deliverables**:
- [ ] `src/provenance.impl.test.ts` green; no regression in `src/lockstep.test.ts`

**Verify**: `npm run type-check && npm test`

---

## Phase 2: Publish & CLI integration

### Step 2.1: Specification test (BEFORE implementation)

**Reference**: `07-testing-strategy.md` ST-4i · AR #7
**Objective**: Encode the throw-before-loop guarantee at the `publish()` level.

- [ ] 2.1.1 Write spec test ST-4i: `publish()` on a fixture workspace (in a supported-CI env) with a provenance-enabled package missing `repository` throws before any publish runs — add to `src/provenance.spec.test.ts`
- [ ] 2.1.2 Run — verify it FAILS (red phase; `publish()` not yet wired)

**Deliverables**:
- [ ] ST-4i spec test present and failing for the right reason

**Verify**: `npm run type-check && npm test`

### Step 2.2: Implementation

**Reference**: `03-01-provenance-publish.md` §Integration Points · AR #5, #6, #7
**Objective**: Wire the decision layer into publish + CLI; keep no-flag behavior unchanged.

- [ ] 2.2.1 Rewire `publish()`: call `planProvenance` once, log `provenanceLogLine`, throw before the loop on `missingRepository`, build each command via `buildPublishCommand` with per-package provenance — `src/lockstep.ts`
- [ ] 2.2.2 Parse `--provenance` into `PublishOptions` and add it to the help text — `src/cli.ts`
- [ ] 2.2.3 Run spec tests — verify green (ST-4i passes; ST-1 baseline unchanged)

**Deliverables**:
- [ ] `publish()` uses the pure helpers; `--provenance` reaches `PublishOptions`; help documents it

**Verify**: `npm run type-check && npm test`

### Step 2.3: Docs, impl tests & full verification

**Reference**: `01-requirements.md` AC2 (baseline equality) · `07-testing-strategy.md` §Integration
**Objective**: Document the flag and confirm no behavioral regression.

- [ ] 2.3.1 Document `--provenance` in `README.md` (usage, supported-CI requirement, `repository` requirement, `publishConfig.provenance`) and add a baseline-equality integration assertion to `src/provenance.impl.test.ts`
- [ ] 2.3.2 Full verification

**Deliverables**:
- [ ] README documents provenance; baseline command equality asserted; all tests green

**Verify**: `npm run type-check && npm test`

---

## Dependencies

```
Phase 1 (pure decision layer + spec tests)
    ↓
Phase 2 (publish/CLI integration + docs)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `npm run type-check && npm test` passing
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, or exports
5. ✅ Security hardened — `--provenance` a fixed literal (no interpolation), no token in logs, fail-fast `repository` preflight
6. ✅ `README.md` updated for `--provenance`
7. ✅ Baseline publish behavior unchanged when `--provenance` is absent
8. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
