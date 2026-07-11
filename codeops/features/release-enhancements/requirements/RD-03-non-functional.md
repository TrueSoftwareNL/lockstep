# RD-03: Non-Functional & Security Requirements

> **Document**: RD-03-non-functional.md
> **Status**: Draft
> **Created**: 2026-07-12
> **Project**: @blendsdk/lockstep — monorepo lockstep versioning tool
> **Depends On**: RD-01, RD-02
> **CodeOps Skills Version**: 3.3.2

---

## Feature Overview

Cross-cutting non-functional and security requirements shared by the AI changelog (RD-01) and npm
provenance (RD-02) features. These exist because both features touch a release pipeline that must be
trustworthy and unbreakable: a versioning tool that corrupts a release, leaks a key, or blocks a publish
is worse than one that ships nothing. This RD sets the reliability, compatibility, secrets, dependency,
performance, and testing contract both features must satisfy.

---

## Functional Requirements

### Must Have — Reliability & Non-Blocking

- [ ] **Changelog never blocks a release** (AR #9): a missing API key, an LLM timeout, an HTTP error, or
  a malformed LLM response results in a deterministic fallback entry and a **zero** exit code, never a
  failed `version`/`changelog` run.
- [ ] **Local provenance never blocks a publish** (AR #6): requesting `--provenance` outside supported CI
  degrades to a warning + a normal publish, not an error.
- [ ] **Fail-fast where correctness demands it** (AR #7): the provenance `repository` preflight aborts
  *before* any package is published, so failures happen with zero side effects rather than mid-loop.
- [ ] Every externally-caused failure produces an actionable message (what failed, why, what to do), not
  a raw stack trace, on the user-facing path.

### Must Have — Backward Compatibility

- [ ] Existing commands are byte-for-byte unchanged when the new features are not invoked: `lockstep
  version` without changelog capability (or with `--no-changelog`) and `lockstep publish` without
  `--provenance` build the same operations they do today.
- [ ] No new **required** runtime dependency for the core tool. The LLM SDKs (`openai`,
  `@anthropic-ai/sdk`) are optional and dynamically imported, so `lockstep version`/`publish` work
  without them installed; only AI changelog generation needs them present.
- [ ] The public programmatic API (`Lockstep` class) remains additive — new methods/options only, no
  breaking changes to existing method signatures.

### Must Have — Secrets & Data Handling

- [ ] API keys and publish/OIDC tokens are read only from the environment; never hardcoded, never written
  to any generated file, never included in a commit.
- [ ] No secret value is logged at any verbosity level, including `--verbose`.
- [ ] Third-party data egress is bounded and opt-in: only commit metadata + file paths are sent to the
  LLM, only when the user configures API keys (RD-01). Not configuring keys means nothing leaves the
  machine.

### Should Have — Performance & Cost

- [ ] Per-LLM-call request timeout (default 30 s) bounds a hung provider and triggers fallback.
- [ ] Prompt size is bounded (commit body truncated, file lists capped) to keep token cost predictable;
  end-of-run token totals are reported for visibility.

### Won't Have (Out of Scope)

- Retry/back-off orchestration across multiple LLM attempts beyond the single provider-fallback hop —
  out of scope; the fallback entry is the safety net.
- Persisted caching of LLM responses between runs.

---

## Technical Requirements

### Dependency strategy

`openai` and `@anthropic-ai/sdk` are declared as `optionalDependencies` (or `devDependencies` plus a
documented optional install) and loaded via dynamic `import()` inside the provider, matching the
reference. A missing SDK is caught and routed to the fallback path, never surfaced as a crash.

### Error-handling posture

The changelog pipeline is written to **never throw** to the CLI on an expected failure (no key, provider
error, SDK missing, no changes) — these are warnings + fallback. Only truly unexpected states (e.g.
filesystem I/O failure writing a file) may exit non-zero, and only for the standalone `changelog`
command; when changelog runs *inside* `version`, even an unexpected changelog error must not abort the
version bump/commit that already succeeded — it degrades to a warning.

### Logging discipline

A single redaction rule: command and environment values that are known secret-bearing
(`*_API_KEY`, `NODE_AUTH_TOKEN`, OIDC tokens) are never interpolated into a logged string. Publish/exec
command logging omits environment.

---

## Integration Points

### With RD-01 (AI Changelog)
- Supplies the non-blocking guarantee, the metadata-only egress rule, and the optional-dependency
  strategy the changelog module relies on.

### With RD-02 (npm Provenance)
- Supplies the fail-fast preflight philosophy, the token-redaction rule, and the
  backward-compatibility guarantee for `publish`.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Changelog failure stance | Never block / block | Never block; fallback entry | Releases must not depend on an LLM's uptime | AR #9 |
| LLM SDK dependency | Required / optional (dynamic import) | Optional, dynamically imported | Core tool must run without AI deps | AR #4, AR #9 |
| Provenance preflight failure | Fail-fast / warn / defer to npm | Fail-fast before any publish | Avoid partial/inconsistent monorepo publishes | AR #7 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it.

---

## Security Considerations

> **🚨 MANDATORY section.**

- **Data sensitivity**: LLM API keys, `NODE_AUTH_TOKEN`, OIDC tokens (all secrets); commit metadata for
  private repos (egress-controlled). Handling rules above are the mitigations.
- **Input validation**: all git-derived text (commit subjects/bodies, file paths) treated as untrusted —
  truncated, never shell-evaluated, only embedded as prompt text or written as markdown.
- **Authentication & authorization**: no new auth surface; the tool runs with the caller's existing
  local/CI credentials and never elevates.
- **Injection prevention**: git and publish invocations use fixed argument forms; no user- or
  commit-controlled string is concatenated into a shell command; generated markdown is sanitized before
  writing (RD-01).
- **Rate limiting**: N/A (no inbound surface); per-call timeouts bound outbound calls.
- **Secrets management**: environment-only, never logged, never persisted, never committed (rules above).
- **Encryption**: all outbound calls (LLM APIs, npm publish, Sigstore attestation) over HTTPS/TLS by the
  respective SDKs/CLIs.
- **Infrastructure / supply chain**: provenance (RD-02) is itself a supply-chain-hardening control;
  optional-dependency + dynamic-import keeps the core install surface minimal.
- **Security testing**: mandatory tests for secret non-leakage, command-construction safety (no
  interpolation), and the metadata-only egress boundary (below).

---

## Acceptance Criteria

1. [ ] With no API keys and a forced provider error, a `changelog` run and a `version` run both exit 0
   and produce fallback content (no non-zero exit on any expected failure).
2. [ ] `lockstep version` succeeds and produces its release commit/tag even if changelog generation
   throws an unexpected error (the changelog error degrades to a warning; the version result stands).
3. [ ] `lockstep version` (with changelog installed but no keys) and `lockstep publish` (no
   `--provenance`) produce operations identical to the pre-feature tool — asserted by comparing
   constructed git/publish command strings.
4. [ ] The core tool runs `version` and `publish` with the `openai`/`@anthropic-ai/sdk` packages **absent**
   from `node_modules` (dynamic import failure routes to fallback, no crash).
5. [ ] A sentinel secret placed in `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`NODE_AUTH_TOKEN` appears in **no**
   stdout/stderr line (including `--verbose`), **no** generated file, and **no** git commit content.
6. [ ] The prompt-builder input for a package contains only commit metadata and file paths — a test
   asserts no file **contents** are present in the payload sent to the provider.
7. [ ] Command-construction tests assert git and publish commands contain no interpolated commit/env
   content beyond fixed flags and already-validated values.
8. [ ] Every RD-01/RD-02 acceptance test follows the CodeOps specification-vs-implementation split
   (`*.spec.test.ts` derived from these criteria; `*.impl.test.ts` for internals), and the project verify
   command passes with all tests green.
