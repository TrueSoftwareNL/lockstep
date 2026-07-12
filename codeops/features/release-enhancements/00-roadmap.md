# Roadmap: Release Enhancements

> **Feature-Set**: Release Enhancements
> **Status**: In Progress
> **Created**: 2026-07-12
> **Last Updated**: 2026-07-12 02:00
> **Progress**: 2 / 3 RDs (67%) · 1 / 1 task
> **CodeOps Skills Version**: 3.3.2

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID | Title | RD | Plan | Stage | Status | Last Updated | Notes / Blocker |
|----|-------|----|------|-------|--------|--------------|-----------------|
| RD-01 | AI-Based Changelog & Release Notes | [RD-01](requirements/RD-01-ai-changelog.md) | [ai-changelog](plans/ai-changelog/00-index.md) | Done | ✅ | 2026-07-12 | Implemented + tested (26 tasks, 78 tests) |
| RD-02 | npm Provenance Support | [RD-02](requirements/RD-02-npm-provenance.md) | [npm-provenance](plans/npm-provenance/00-index.md) | Done | ✅ | 2026-07-12 | Implemented + tested (36 tests) |
| RD-03 | Non-Functional & Security | [RD-03](requirements/RD-03-non-functional.md) | — | RD Drafted | ✏️ | 2026-07-12 | Shared contract for RD-01/RD-02 |
| T-01 | Single-package repository support | — | — | Done | ✅ | 2026-07-12 | Root-package fallback in workspace discovery so lockstep runs on single-package repos (incl. itself); 5 tests |

## Notes

- 2026-07-12: Requirements set authored; Zero-Ambiguity Gate PASSED (15 items). Suggested build
  order RD-02 → RD-01; RD-03 is the cross-cutting contract verified within each feature's tests.
- 2026-07-12: RD-02 (npm provenance) implemented and verified — new `src/provenance.ts` pure
  decision layer + `--provenance` publish flag; 36 tests pass, type-check clean.
- 2026-07-12: RD-01 (AI changelog) implemented and verified — new `src/changelog/` module
  (change-detection, OpenAI→Anthropic provider, prompts, writers), `changelog` command,
  auto-run in `version` (opt-out via `--no-changelog`), optional SDK deps; 78 tests pass,
  type-check clean. Execution also fixed a latent git working-directory bug (PA-5): all git
  operations now run against the configured repository root.
- 2026-07-12: T-01 (single-package support) — discovered while dogfooding: lockstep only found
  packages under `packages/`, so it errored on a single-package repo (like its own). Added a
  root-package fallback to workspace discovery and fixed root-package commit attribution; 83 tests
  pass. `lockstep changelog` now runs on this repo (real AI output requires a key — present only in
  CI secrets; locally it writes fallback entries).
