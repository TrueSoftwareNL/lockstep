# Writers & Orchestration: AI Changelog

> **Document**: 03-03-writers-and-orchestration.md
> **Parent**: [Index](00-index.md)

## Overview

Owns the file writers (`src/changelog/changelog-writer.ts`, `src/changelog/release-notes-writer.ts`),
the `Lockstep.changelog()` orchestration method, the `version()` integration, and the CLI wiring.

## Implementation Details

### Writers

```typescript
// changelog-writer.ts
/** Creates or prepends a per-package CHANGELOG.md entry (Keep a Changelog). Empty content → fallback. */
export function writeOrUpdateChangelog(packageDir: string, version: string, date: string, content: string): void;

// release-notes-writer.ts
/** Writes (overwrites) the root RELEASE_NOTES.md with the latest release's notes. Empty → placeholder. */
export function writeReleaseNotes(root: string, version: string, date: string, content: string): void;
```

`writeOrUpdateChangelog` prepends a `## [<version>] - <YYYY-MM-DD>` block above existing entries (or
creates the file with the Keep a Changelog header). `sanitizeContent` strips markdown code fences and,
on empty/whitespace content, substitutes the deterministic fallback `### Changed\n- Version bump to
<version>` (RD-01 AR #9). Dates use local `YYYY-MM-DD`.

### Orchestration — `Lockstep.changelog()` (`src/lockstep.ts`)

```typescript
/** Generates per-package CHANGELOG.md + root RELEASE_NOTES.md for the current release. Never throws
 *  on an expected failure (missing key, provider error, no changes) — writes fallback and returns. */
async changelog(options: ChangelogOptions = {}): Promise<void>;
```

Flow:
1. `buildWorkspace()`; `version = ensureAllSameVersion(packages)` (the just-written version in the
   `version` flow; the current version standalone).
2. `summaries = buildPackageChangeSummary(root, packages)`. If empty → log "no changes" and return.
3. `provider = new LLMProvider(createLLMConfig())`. If no providers → write fallback entries + a
   placeholder `RELEASE_NOTES.md` (unless `dryRun`), log a warning, return.
4. For each summary: `generate(buildChangelogPrompt(...))` → `writeOrUpdateChangelog(pkg.dir, …)`
   (or print under `dryRun`). Alphabetical order; accumulate token totals.
5. `generate(buildReleaseNotesPrompt(version, summaries))` → `writeReleaseNotes(root, …)`.
6. `verbose` prints base ref, per-package counts, provider/model, token usage; totals printed at end.

### `version()` integration (AR #12)

In `version()` (`src/lockstep.ts:390`), after writing all package versions + the root version and
**before** `git add .` (`:444`), when `!noChangelog`:

```
try { await this.changelog({}); }
catch (e) { console.warn(`Changelog generation failed, continuing release: ${message(e)}`); }
```

The try/catch guarantees an unexpected changelog error never aborts the version bump/commit (RD-03
AC2). The generated files are then swept into the release commit by the existing `git add .`.

### CLI (`src/cli.ts`)

- New `changelog` command → `new Lockstep().changelog({ dryRun: Boolean(opts['dry-run']), verbose: Boolean(opts.verbose) })`.
- `version` gains `--no-changelog` → `noChangelog: Boolean(opts['no-changelog'])` in `VersionOptions`.
- Help text documents the command, flags, and env vars.

### Types (`src/types.ts`)
- `VersionOptions` gains `noChangelog?: boolean`.

### Packaging
- `package.json`: add `openai` and `@anthropic-ai/sdk` to **`optionalDependencies`** (AR PA-2).

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| No changes since last tag | Log and return; write nothing | RD-01 AR #9 |
| No API key / provider failure | Write deterministic fallback entries + placeholder notes; return 0 | RD-01 AR #9 |
| Unexpected error during `version`-triggered changelog | `version()` try/catch degrades to a warning; the release stands | RD-03 AC2 |
| `--dry-run` | Print would-be content; write **no** files | RD-01 §dry-run |
| Secret in output | Keys never written to files/logs/commits | RD-03 |

> **Traceability:** references the registers.

## Testing Requirements
- Writers: create vs prepend; fence stripping; empty→fallback; release-notes overwrite + placeholder.
- Orchestration: with a stubbed provider (returning fixed content or null), assert per-package files
  and `RELEASE_NOTES.md` are written; `dryRun` writes nothing; no-key path writes fallback; a thrown
  provider error inside `version()` does not abort the version (integration).
