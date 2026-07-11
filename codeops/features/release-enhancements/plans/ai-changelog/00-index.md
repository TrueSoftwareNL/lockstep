# AI Changelog & Release Notes Implementation Plan

> **Feature**: AI-generated per-package `CHANGELOG.md` + root `RELEASE_NOTES.md`, via a new `lockstep changelog` command and auto-run inside `lockstep version`
> **Status**: Planning Complete
> **Created**: 2026-07-12
> **Implements**: release-enhancements/RD-01
> **CodeOps Skills Version**: 3.3.2

## Overview

Lockstep already parses conventional commits to choose a version bump but ships no changelog. This
feature adds automatic, LLM-generated changelog production modeled on the blendsdk-v5 generator,
adapted to lockstep's generic package discovery and lockstep versioning. At release time it detects
which packages changed since the last `vX.Y.Z` tag, attributes commits to packages, sends per-package
change summaries to an LLM (OpenAI primary, Anthropic fallback), and writes a per-package
`CHANGELOG.md` (Keep a Changelog) plus a root `RELEASE_NOTES.md` (non-technical).

It is exposed as a standalone `lockstep changelog` command and runs automatically as a step of
`lockstep version` (opt out with `--no-changelog`). The pipeline **never blocks a release**: with no
API key or on any provider failure it writes a deterministic fallback entry and continues. Only commit
metadata (subject, truncated body, file paths) is sent to the LLM — never file contents.

## Document Index

| #   | Document                                       | Description                                 |
| --- | ---------------------------------------------- | ------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md)                           | This document                               |
| 01  | [Requirements](01-requirements.md)             | Scope delta over RD-01                       |
| 02  | [Current State](02-current-state.md)           | Current version/CLI/discovery analysis      |
| 03-01 | [Change Detection](03-01-change-detection.md) | Base ref, commit parsing, attribution     |
| 03-02 | [LLM Provider & Prompts](03-02-llm-provider-and-prompts.md) | Provider fallback + prompt builders |
| 03-03 | [Writers & Orchestration](03-03-writers-and-orchestration.md) | File writers + `Lockstep.changelog` + integration |
| 07  | [Testing Strategy](07-testing-strategy.md)     | Specification test cases and verification    |
| 99  | [Execution Plan](99-execution-plan.md)         | Phases and task checklist                    |

## Quick Reference

### Usage Examples

```bash
# Generate changelog artifacts for the current release (no version bump)
lockstep changelog

# Preview without writing files
lockstep changelog --dry-run --verbose

# Version bump auto-generates the changelog into the release commit
lockstep version --type auto

# ...unless opted out
lockstep version --type patch --no-changelog
```

### Key Decisions

| Decision | Outcome | Ref |
| -------- | ------- | --- |
| Trigger | New `changelog` command + auto-run in `version` (opt-out) | RD-01 AR #2 |
| Output | Per-package `CHANGELOG.md` + root `RELEASE_NOTES.md` | RD-01 AR #3 |
| Provider | OpenAI primary, Anthropic fallback, env-configured | RD-01 AR #4 |
| Reliability | Never block a release; deterministic fallback entry | RD-01 AR #9, RD-03 |
| SDK deps | `optionalDependencies`, dynamically imported | plan AR PA-2 |
| Attribution | Scope-match (dir basename / unscoped name) or file-diff | RD-01 AR #11, plan AR PA-3 |
| Provider tests | Protected `callOpenAI`/`callAnthropic` seams stubbed via subclass | plan AR PA-4 |
| Verify command | `npm run type-check && npm test` | plan AR PA-1 |

## Related Files

- **New**: `src/changelog/{types,change-detection,llm-provider,prompts,changelog-writer,release-notes-writer}.ts` + spec/impl tests
- **Modified**: `src/lockstep.ts` (`changelog()` method + `version()` integration), `src/cli.ts` (command + flags), `src/types.ts` (`VersionOptions.noChangelog`), `package.json` (optionalDependencies), `README.md`
