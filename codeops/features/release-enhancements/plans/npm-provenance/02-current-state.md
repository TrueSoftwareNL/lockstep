# Current State: npm Provenance

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

`Lockstep.publish()` (`src/lockstep.ts:459-514`) builds the workspace, topologically sorts it,
computes a branch-prefixed dist-tag, and loops over packages calling `execSync` with a
per-package-manager publish command. The publish-argument construction is **inline** in the loop
(`src/lockstep.ts:489-503`): it pushes `--access` and `--tag`, then selects `pnpm publish` /
`npm publish` and appends `--dry-run` when `dry` is set. There is no provenance handling, no CI
detection, and no pre-loop validation of the publish set.

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/lockstep.ts` | `publish()` orchestration + inline command build | Call new pure helpers; add pre-loop provenance planning + preflight; pass per-package provenance into the command builder |
| `src/cli.ts` | Publish flag parsing (`:147-158`), help text (`:60-64`) | Parse `--provenance`; pass into `PublishOptions`; document in help |
| `src/types.ts` | `PublishOptions`, `PackageJson` | Add `provenance?: boolean`; add typed `publishConfig?: { provenance?: boolean; access?: string }` |
| `src/provenance.ts` | — | **New** module: `detectSupportedCI`, `planProvenance`, `buildPublishCommand` (pure) |
| `README.md` | Publish docs | Document `--provenance`, CI requirement, `repository` requirement |

### Code Analysis

Current inline command construction (`src/lockstep.ts:489-503`):

```
args.push("--access", access);
args.push("--tag", finalTag);
if pnpm  → `pnpm publish ${args} ${dry ? "--dry-run" : ""}`
else     → `npm publish  ${args} ${dry ? "--dry-run" : ""}`   // yarn also uses npm publish
execSync(cmd, { cwd: p.dir, stdio: "inherit" });
```

`PackageJson` already carries `[key: string]: any` (`src/types.ts:18`), so `publishConfig` is
readable today but untyped. Tests live beside source (`src/*.test.ts`); vitest include is
`src/**/*.{test,spec}.ts`, so `provenance.spec.test.ts` and `provenance.impl.test.ts` are picked
up automatically.

## Gaps Identified

### Gap 1: No provenance support
**Current Behavior:** every publish is a plain `npm/pnpm publish`; no attestation is generated.
**Required Behavior:** an opt-in `--provenance` forwards provenance to npm/pnpm when in supported CI.
**Fix Required:** `buildPublishCommand` gains a `provenance` parameter; `publish()` supplies it per package.

### Gap 2: No CI detection / no non-CI guard
**Current Behavior:** publish runs identically everywhere.
**Required Behavior:** provenance is attempted only in GitHub Actions / GitLab CI; elsewhere it is skipped with a warning.
**Fix Required:** `detectSupportedCI` + `planProvenance` gate provenance on the environment.

### Gap 3: No pre-publish validation
**Current Behavior:** a bad package surfaces mid-loop, after earlier packages are already live.
**Required Behavior:** the `repository` field of provenance-enabled packages is validated before any publish; failure aborts the whole run.
**Fix Required:** `planProvenance` collects missing-`repository` packages; `publish()` throws before the loop.

### Gap 4: Command construction is not unit-testable
**Current Behavior:** command building is inline and immediately executed via `execSync`.
**Required Behavior:** command/decision logic testable without publishing.
**Fix Required:** extract pure helpers into `src/provenance.ts` (AR PA-2).

## Dependencies

### Internal Dependencies
- `WorkspacePackage.data` (parsed `package.json`) supplies `publishConfig` and `repository`.

### External Dependencies
- No new runtime dependency. `--provenance` is a native npm (≥9.5.0) / pnpm flag; the OIDC exchange
  is performed by npm, not lockstep.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Refactor changes existing publish output | Low | High | ST-1 asserts baseline command equality when `--provenance` absent |
| CI detection false-negative (unlisted provider) | Med | Low | Skip-with-warning degrades safely (AR #6); providers documented |
| Provenance still fails at npm (missing OIDC perms) | Med | Low | lockstep detects env + validates `repository`; npm owns the authoritative OIDC/URL check; failure is npm's clear error |
