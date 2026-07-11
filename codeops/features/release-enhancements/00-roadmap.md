# Roadmap: Release Enhancements

> **Feature-Set**: Release Enhancements
> **Status**: In Progress
> **Created**: 2026-07-12
> **Last Updated**: 2026-07-12 00:25
> **Progress**: 1 / 3 (33%)
> **CodeOps Skills Version**: 3.3.2

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID | Title | RD | Plan | Stage | Status | Last Updated | Notes / Blocker |
|----|-------|----|------|-------|--------|--------------|-----------------|
| RD-01 | AI-Based Changelog & Release Notes | [RD-01](requirements/RD-01-ai-changelog.md) | — | RD Drafted | ✏️ | 2026-07-12 | — |
| RD-02 | npm Provenance Support | [RD-02](requirements/RD-02-npm-provenance.md) | [npm-provenance](plans/npm-provenance/00-index.md) | Done | ✅ | 2026-07-12 | Implemented + tested (36 tests) |
| RD-03 | Non-Functional & Security | [RD-03](requirements/RD-03-non-functional.md) | — | RD Drafted | ✏️ | 2026-07-12 | Shared contract for RD-01/RD-02 |

## Notes

- 2026-07-12: Requirements set authored; Zero-Ambiguity Gate PASSED (15 items). Suggested build
  order RD-02 → RD-01; RD-03 is the cross-cutting contract verified within each feature's tests.
- 2026-07-12: RD-02 (npm provenance) implemented and verified — new `src/provenance.ts` pure
  decision layer + `--provenance` publish flag; 36 tests pass, type-check clean.
