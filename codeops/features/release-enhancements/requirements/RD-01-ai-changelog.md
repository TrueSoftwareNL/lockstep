# RD-01: AI-Based Changelog & Release Notes Generation

> **Document**: RD-01-ai-changelog.md
> **Status**: Draft
> **Created**: 2026-07-12
> **Project**: @blendsdk/lockstep — monorepo lockstep versioning tool
> **Depends On**: —
> **CodeOps Skills Version**: 3.3.2

---

## Feature Overview

Lockstep already analyzes conventional commits to pick a version bump (`determineVersionType`,
`src/lockstep.ts:306`) but then discards those commits — it ships no changelog, and the root
`CHANGELOG.md` is hand-maintained (stuck at 1.0.0). This feature adds automatic, **AI-generated**
changelog and release-notes production, modeled on the proven blendsdk-v5 changelog generator.

At release time lockstep detects which packages changed since the last release tag, attributes
commits to packages, sends per-package change summaries to an LLM (OpenAI primary, Anthropic
fallback), and writes a per-package `CHANGELOG.md` (Keep a Changelog format) plus a root
`RELEASE_NOTES.md` (non-technical summary). It is exposed as a new `lockstep changelog` command
and also runs automatically as a step of `lockstep version`. The pipeline is designed to **never
block a release**: if no API key is configured or every provider fails, it writes a deterministic
fallback entry and the release proceeds.

---

## Functional Requirements

### Must Have

- [ ] A new CLI command `lockstep changelog [options]` that generates changelog artifacts for the
  current release without bumping versions or publishing.
- [ ] `lockstep version` runs changelog generation automatically after bumping package versions and
  **before** the git commit/tag, so the generated files are included in the release commit (AR #12).
- [ ] A `--no-changelog` opt-out flag on `lockstep version` that skips generation.
- [ ] Change detection resolves the base ref from lockstep's existing `vX.Y.Z` tag scheme via
  `git describe --tags --abbrev=0`; when no tags exist it bootstraps to the repository's first
  commit (`git rev-list --max-parents=0 HEAD`) (AR #10).
- [ ] Per-package commit attribution: a commit is attributed to a package when (a) its conventional-commit
  scope matches a discovered package's short name, or (b) its changed files fall inside that package's
  directory. File-diff attribution is the fallback for unscoped or cross-cutting commits (AR #11).
- [ ] Package discovery reuses lockstep's existing generic discovery (`findPackageDirs`,
  `src/lockstep.ts:109`) and honors the configured `packagesDirs` — no hardcoded `packages/` path or
  package-name scope (AR #11).
- [ ] LLM provider layer: try OpenAI first, fall back to Anthropic on failure/unavailability,
  configured entirely from environment variables (AR #4).
- [ ] Per-package `CHANGELOG.md` written in [Keep a Changelog](https://keepachangelog.com/) format,
  categorized into Added / Changed / Deprecated / Removed / Fixed / Security; a new version entry is
  **prepended** to an existing file, or a new file is created with the standard header (AR #3).
- [ ] Root `RELEASE_NOTES.md` written with a non-technical summary of the release; always overwritten
  to contain only the latest release (AR #3).
- [ ] Non-blocking reliability: with no API key, or when all providers fail, write a deterministic
  fallback entry (`### Changed` / `- Version bump to <version>`) and exit success (AR #9). Detailed in RD-03.
- [ ] `--dry-run` prints what would be generated for every package and the release notes without
  writing any file.
- [ ] Only commit **metadata** is sent to the LLM — commit subject, truncated body, and changed-file
  **paths**. Never file contents. (Bounds third-party data egress; see RD-03.)

### Should Have

- [ ] `--verbose` prints the resolved base ref, per-package commit/file counts, active provider/model,
  and per-call token usage.
- [ ] Deterministic ordering: packages processed and listed alphabetically by name for stable output.
- [ ] Token-usage totals reported at the end of a run (input/output) for cost visibility.

### Won't Have (Out of Scope)

- GitHub Release creation from the generated notes — out of scope this round (AR #8); documented future gap.
- A general lockstep configuration file — the changelog reuses the existing `LockstepConfig`
  (`packagesDirs`, `root`); a full `.locksteprc` is a separate future effort.
- Localization of changelog/release-notes output — English only this round.
- Sending file contents or code diffs to the LLM — only commit metadata + file paths are sent.

---

## Technical Requirements

### Module Structure

A self-contained `changelog/` module under `src/`, mirroring the blendsdk-v5 architecture so the
proven separation of concerns is preserved:

| File | Responsibility |
|------|----------------|
| `src/changelog/types.ts` | `ParsedCommit`, `PackageChangeSummary`, `LLMConfig`, `LLMResult`, `ChangelogOptions` |
| `src/changelog/change-detection.ts` | base-ref resolution, changed-file diff, conventional-commit parsing (incl. body), commit→package attribution, package discovery bridge |
| `src/changelog/llm-provider.ts` | OpenAI-first / Anthropic-fallback abstraction; dynamic SDK import; never throws |
| `src/changelog/prompts.ts` | system + user prompt builders for per-package changelog and root release notes |
| `src/changelog/changelog-writer.ts` | create/prepend per-package `CHANGELOG.md`, content sanitization, fallback entry |
| `src/changelog/release-notes-writer.ts` | write root `RELEASE_NOTES.md` |

The orchestration lives on the `Lockstep` class as a `changelog(options)` method, and the CLI wires a
new `changelog` command plus the auto-run step inside `version`.

### Conventional-Commit Parsing (fixes an existing bug)

Commits are read with `git log <ref>..HEAD` using a multi-field format that captures **hash, subject,
and body** (`%h`, `%s`, `%b`) with unambiguous separators, then parsed with the conventional-commit
regex `^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$`. Because the body is captured, `BREAKING CHANGE:` footers are
visible — closing the gap where lockstep's current subject-only analysis (`%s` at `src/lockstep.ts:319`)
misses canonically-declared breaking changes.

### LLM Provider & Configuration

Provider order is OpenAI → Anthropic (AR #4). SDKs are loaded via dynamic `import()` so the tool runs
(including `--dry-run` and the fallback path) without the SDKs installed. Configuration is environment-only:

| Env var | Purpose | Default |
|---------|---------|---------|
| `OPENAI_API_KEY` | OpenAI key (primary) | — (provider disabled if unset) |
| `OPENAI_MODEL` | OpenAI model | a current low-cost model (e.g. `gpt-4o-mini`), overridable (AR #13) |
| `ANTHROPIC_API_KEY` | Anthropic key (fallback) | — (provider disabled if unset) |
| `ANTHROPIC_MODEL` | Anthropic model | a current low-cost model (e.g. Claude Haiku 4.5), overridable (AR #13) |

Per-call request timeout defaults to 30 s; max output tokens default to a value sufficient for a
changelog entry (~2048). Exact default model IDs are pinned at implementation to the current
generation and remain overridable via env (AR #13).

### `version` Integration Ordering (AR #12)

```
lockstep version --type <t>
  1. determine bump type (auto → analyze commits)
  2. bump all package.json versions + internal dep ranges + root package.json   [existing]
  3. generate changelog artifacts (unless --no-changelog)                        [NEW]
       - reads the just-written new version
       - detects changes since the last vX.Y.Z tag
  4. git add . → commit "chore(release): v<next>" → git tag v<next>              [existing]
```

Because generation runs before `git add .` (`src/lockstep.ts:444`), the new/updated `CHANGELOG.md`
files and `RELEASE_NOTES.md` are committed as part of the release commit.

---

## Integration Points

### With existing `Lockstep.version` (`src/lockstep.ts:390`)
- A new step invokes `changelog()` between version writing and the git commit; guarded by `--no-changelog`.
- Reuses the already-computed next version and the existing `packagesDirs`/discovery.

### With RD-02 (npm Provenance)
- Independent features; no runtime coupling. Both extend the same CLI surface and share RD-03's
  non-functional/security requirements (secrets handling, non-blocking reliability).

### With RD-03 (Non-Functional & Security)
- Inherits the non-blocking reliability guarantee, third-party data-egress handling, secrets policy,
  and testing strategy.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Workflow integration | New command + auto in version / standalone only / inside version only | New `lockstep changelog` command **and** auto-run in `version` (opt-out) | Manual regeneration plus hands-off releases | AR #2 |
| Output artifacts | Per-package + root notes / root only / per-package only | Per-package `CHANGELOG.md` + root `RELEASE_NOTES.md` | Mirrors the reference; per-package history + a readable release summary | AR #3 |
| LLM provider | OpenAI+Anthropic fallback / Anthropic only / agnostic adapter | OpenAI primary, Anthropic fallback, env-configurable | Broadest for OSS users; matches the reference | AR #4 |
| Failure stance | Never block / block on failure | Never block; write fallback entry | A release must never be held hostage to an LLM outage | AR #9 |
| Base ref | Reuse `vX.Y.Z` tags / other | Reuse existing tag scheme, bootstrap to first commit | Consistency with lockstep's existing tagging | AR #10 |
| Commit attribution | File-diff + scope match / other | File-diff primary + scope match via generic discovery | Works for any monorepo, not just blendsdk | AR #11 |
| Version ordering | Fold into release commit / separate commit | Fold changelog into the release commit | One coherent release commit | AR #12 |
| Default models | Current-gen, env-overridable / pin older | Current-generation defaults, env-overridable | Avoid shipping stale model IDs | AR #13 |
| Data sent to LLM | Metadata only / include file contents | Commit metadata + file paths only, never contents | Minimizes third-party data egress | AR #4, RD-03 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

---

## Security Considerations

> **🚨 MANDATORY section.**

- **Data sensitivity**: LLM API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are secrets. Commit
  messages and file paths for a **private** repository are sent to a third-party LLM — a data-egress
  event the user opts into by configuring keys. Only metadata (subject, truncated body, file paths) is
  sent; **never file contents**. Not configuring keys disables egress entirely (fallback path runs).
- **Input validation**: commit messages and file paths are untrusted input. They are (a) truncated
  (body ≤ ~200 chars, file lists capped), and (b) treated purely as text embedded in a prompt and as
  content written to markdown files — never executed, never used to build a shell command.
- **Authentication & authorization**: no new auth surface; the tool acts with the caller's existing
  local credentials. LLM keys are read only from the environment.
- **Injection risks**: (1) **Command injection** — git output must not be interpolated into shell
  commands; git invocations use fixed argument forms, and parsed commit text is never shell-evaluated.
  (2) **Prompt/markdown injection** — a hostile commit message could attempt to steer the LLM or inject
  markdown; impact is bounded because output is documentation, not code, and generated content is
  sanitized (code-fence stripping) before writing. (3) **Path safety** — generated `CHANGELOG.md` paths
  are derived from discovered package directories under the configured roots, not from commit content.
- **Encryption needs**: LLM API calls occur over HTTPS (SDK default). No data at rest beyond the
  generated markdown, which is non-secret by nature.
- **Rate limiting**: not applicable (no inbound endpoints); per-call timeout bounds hung requests.
- **Secrets management**: keys are never logged (even under `--verbose`), never written to generated
  files, and never committed. See RD-03.

---

## Acceptance Criteria

1. [ ] Running `lockstep changelog` in a monorepo with changes since the last `vX.Y.Z` tag writes a
   `CHANGELOG.md` in each changed package directory and a `RELEASE_NOTES.md` at the repo root; packages
   with no attributed commits and no changed files get no entry.
2. [ ] A new `CHANGELOG.md` begins with the Keep a Changelog header and a `## [<version>] - <YYYY-MM-DD>`
   entry; an existing `CHANGELOG.md` has the new `## [<version>]` entry **prepended** above the previous
   entries, leaving prior content byte-for-byte intact below it.
3. [ ] With `OPENAI_API_KEY` set, generation uses OpenAI; when the OpenAI call throws and
   `ANTHROPIC_API_KEY` is set, generation falls back to Anthropic and still produces output; the run
   exits 0 in both cases.
4. [ ] With **no** API keys set, `lockstep changelog` writes the fallback entry
   (`### Changed` / `- Version bump to <version>`) to every changed package's `CHANGELOG.md`, writes a
   placeholder `RELEASE_NOTES.md`, prints a warning, and exits 0 (never non-zero for a missing key).
5. [ ] A commit whose message body (not subject) contains `BREAKING CHANGE:` is parsed with that body
   visible to attribution/prompting — verified by a unit test asserting the parsed `body` field is
   non-empty for such a commit.
6. [ ] `lockstep version --type patch` on a repo with changes produces a single release commit that
   includes the bumped `package.json` files **and** the generated `CHANGELOG.md`/`RELEASE_NOTES.md`;
   `lockstep version --type patch --no-changelog` produces the release commit **without** any changelog
   files.
7. [ ] `lockstep changelog --dry-run` writes **zero** files (verified by asserting no filesystem
   mutation) and prints the would-be content for each package and the release notes.
8. [ ] A commit scoped to a package (`fix(foo): …`) is attributed to package `foo` when `foo` is a
   discovered package; an unscoped commit touching files under two packages is attributed to both.
9. [ ] LLM API keys never appear in stdout/stderr, generated files, or the git commit — verified by a
   test that sets a sentinel key value and asserts it is absent from all outputs.
10. [ ] Security requirements verified: git output is never shell-evaluated (attribution/parsing use
    fixed-arg git calls); generated content is sanitized (code fences stripped) before writing; only
    commit metadata + file paths are sent to the LLM (no file contents), asserted by a test on the
    prompt-builder input.
