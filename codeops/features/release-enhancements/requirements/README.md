# release-enhancements — Requirements Documents

> **Project**: @blendsdk/lockstep — monorepo lockstep versioning tool
> **Feature**: release-enhancements — semantic-release-parity additions
> **Status**: Draft
> **Created**: 2026-07-12
> **Architecture**: TypeScript (ESM), Node ≥ 18, CLI + programmatic API; git + npm/yarn/pnpm
> **CodeOps Skills Version**: 3.3.2

---

## Overview

Lockstep is a focused monorepo release tool: it keeps all packages on one version (lockstep
versioning), rewrites internal dependency ranges, and publishes in topological order. Compared with
semantic-release it lacks release-quality machinery. This feature adds the two highest-value pieces
without abandoning lockstep's niche:

1. **AI-based changelog & release notes** (RD-01) — automatic, LLM-generated per-package `CHANGELOG.md`
   and root `RELEASE_NOTES.md`, modeled on the blendsdk-v5 changelog generator, built to never block a
   release.
2. **npm provenance** (RD-02) — opt-in supply-chain attestation on publish, with CI detection and a
   fail-fast `repository` preflight.

RD-03 captures the cross-cutting non-functional and security contract both features share.

## Domain Glossary

| Term | Definition |
|------|-----------|
| Lockstep versioning | All packages in the monorepo share one version number, bumped together |
| Conventional commit | Commit message of the form `type(scope)?!: subject` with an optional body/footer |
| Base ref | The git ref marking the last release (`git describe --tags` on `vX.Y.Z`), start of the change window |
| Commit attribution | Deciding which package(s) a commit belongs to, by conventional-commit scope and/or changed-file paths |
| Keep a Changelog | The changelog format/spec at keepachangelog.com (Added/Changed/Deprecated/Removed/Fixed/Security) |
| Release notes | Non-technical, stakeholder-facing summary of a release (`RELEASE_NOTES.md`) |
| Fallback entry | Deterministic changelog content written when no LLM is available, so a release always has an entry |
| npm provenance | Signed, publicly verifiable attestation linking a published tarball to its source commit + CI build (Sigstore + OIDC) |
| Supported CI | A cloud CI/CD that can generate provenance — GitHub Actions or GitLab CI/CD |
| Dist-tag | npm distribution tag under which a version is published (`latest`, `next`, branch-prefixed, …) |

## Document Index

| # | Document | Description | Depends On |
|---|----------|-------------|------------|
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) — 15 items, GATE PASSED | — |
| **RD-01** | [AI-Based Changelog & Release Notes](RD-01-ai-changelog.md) | LLM-generated per-package changelogs + root release notes; new `changelog` command + auto-run in `version` | — |
| **RD-02** | [npm Provenance Support](RD-02-npm-provenance.md) | Opt-in `--provenance` on publish; CI detection; `repository` preflight | — |
| **RD-03** | [Non-Functional & Security](RD-03-non-functional.md) | Reliability, backward compatibility, secrets, dependencies, testing | RD-01, RD-02 |

## Dependency Graph

```
RD-01 (AI Changelog) ──┐
                       ├──> RD-03 (Non-Functional & Security)
RD-02 (npm Provenance)─┘
```

RD-01 and RD-02 are functionally independent and can be built in either order. RD-03 is the shared
contract they both satisfy; its criteria are verified as part of each feature's tests rather than as a
separate build step.

## Suggested Implementation Order

| Phase | Documents | Description |
|-------|-----------|-------------|
| **A: MVP** | RD-02 → RD-01 | Provenance first (small, self-contained: flag + CI detection + preflight), then the larger changelog module. RD-03's rules are honored throughout. |
| **B** | — | GitHub Release creation and the broader semantic-release gaps (verifyConditions, channels, notifications) are explicitly deferred. |

> Provenance is sequenced first because it is the smaller, lower-risk change and exercises the
> publish path; the changelog module is the larger port. Either order is valid — they share no code.

## Key Architecture Decisions

| Decision | Choice | Rationale | AR Ref |
|----------|--------|-----------|--------|
| Feature organization | One combined feature, three RDs | Two related release enhancements planned together | AR #1 |
| Changelog trigger | New `changelog` command + auto-run in `version` | Manual regen + hands-off releases | AR #2 |
| Output artifacts | Per-package `CHANGELOG.md` + root `RELEASE_NOTES.md` | Mirrors the reference generator | AR #3 |
| LLM provider | OpenAI primary, Anthropic fallback, env-configured | Broadest for OSS users | AR #4 |
| Changelog reliability | Never block a release; fallback entry | Uptime of an LLM must not gate releases | AR #9 |
| Provenance opt-in | Explicit `--provenance` flag + `publishConfig` | Predictable, no implicit behavior change | AR #5 |
| Provenance non-CI | Skip with warning, continue | Never block a local publish | AR #6 |
| Provenance preflight | Validate `repository`, fail-fast | Avoid partial monorepo publishes | AR #7 |
| GitHub Release | Out of scope this round | Keep scope on changelog + provenance | AR #8 |

## How to Use These Documents

1. Pick a requirements document (suggested start: RD-02, then RD-01).
2. Run the make_plan skill against it.
3. make_plan uses the RD as input to create a task-by-task execution plan.
4. Run the exec_plan skill for the feature.
5. Implement iteratively, verifying against each RD's acceptance criteria.
