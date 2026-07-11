# Provenance & Publish Command: npm Provenance

> **Document**: 03-01-provenance-publish.md
> **Parent**: [Index](00-index.md)

## Overview

Owns the design of the provenance decision layer and the extracted publish-command builder. All
new logic is **pure** (no I/O, no `execSync`, environment passed in as an argument) so it is
directly unit-testable (AR PA-2). `publish()` becomes thin orchestration that consumes these.

## Architecture

### Current Architecture
`publish()` builds the publish command inline and calls `execSync` per package
(`src/lockstep.ts:489-505`). See `02-current-state.md`.

### Proposed Changes
A new module `src/provenance.ts` exports three pure functions. `publish()` calls `planProvenance`
once before the topo loop, logs the outcome, aborts if any provenance-enabled package is missing a
`repository` field, then calls `buildPublishCommand` per package with that package's effective
provenance.

## Implementation Details

### New Types/Interfaces (`src/provenance.ts` + `src/types.ts`)

```typescript
// src/provenance.ts
export type CiProvider = "github" | "gitlab";

export interface CiInfo {
  /** Whether a provenance-supported cloud CI was detected. */
  supported: boolean;
  /** The detected provider, or null when unsupported. */
  provider: CiProvider | null;
}

export interface ProvenancePlan {
  /** CI detection result. */
  ci: CiInfo;
  /** True if provenance was requested (flag) or any package opts in via publishConfig. */
  requested: boolean;
  /** True when provenance will actually be applied (requested AND supported CI). */
  effective: boolean;
  /** Names of packages that will publish WITH provenance (empty unless effective). */
  enabledPackages: Set<string>;
  /** Names of provenance-enabled packages missing a `repository` field (fail-fast list). */
  missingRepository: string[];
  /** Human-readable reason when provenance is requested but skipped (e.g. not in supported CI). */
  skippedReason: string | null;
}
```

```typescript
// src/types.ts — additive only
export interface PublishOptions {
  access?: string;
  dry?: boolean;
  tag: string;
  gitPush?: boolean;
  provenance?: boolean;   // NEW — the --provenance flag
}

export interface PackageJson {
  // ...existing fields...
  publishConfig?: { provenance?: boolean; access?: string };  // NEW — typed, was reachable via index signature
}
```

### New Functions/Methods (`src/provenance.ts`)

```typescript
/**
 * Detects whether the process runs in a provenance-supported cloud CI/CD.
 * Environment is passed in for testability; defaults to process.env.
 *
 * @example
 * detectSupportedCI({ GITHUB_ACTIONS: "true" }) // → { supported: true, provider: "github" }
 * detectSupportedCI({})                          // → { supported: false, provider: null }
 */
export function detectSupportedCI(env?: NodeJS.ProcessEnv): CiInfo;

/**
 * Computes the provenance plan for a publish set: CI detection, per-package enablement,
 * and the fail-fast repository preflight — all without side effects.
 *
 * Enablement per package = flag OR pkg.publishConfig?.provenance === true.
 * effective = requested AND ci.supported. When requested but not supported CI,
 * effective is false and skippedReason explains why (AR #6).
 * missingRepository lists ONLY provenance-enabled packages lacking a `repository` field (AR PA-3).
 */
export function planProvenance(
  packages: WorkspacePackage[],
  opts: { flag: boolean; env?: NodeJS.ProcessEnv }
): ProvenancePlan;

/**
 * Builds the publish command string for a package manager. Pure; `--provenance` is appended
 * as a fixed literal only when `provenance` is true — no package/env content is interpolated.
 * pnpm → `pnpm publish …`; npm and the yarn→npm path → `npm publish …`.
 */
export function buildPublishCommand(
  packageManager: PackageManager,
  opts: { access: string; tag: string; provenance: boolean; dry: boolean }
): string;

/**
 * Returns the single provenance-state log line for a plan, or null when nothing should be logged
 * (provenance not requested). Pure and secret-free — contains only the provider or the skip reason,
 * never any token — so the "log once" and "no token leak" behaviors are unit-testable without
 * running publish(). `publish()` prints this line verbatim when non-null.
 *
 * @example
 * provenanceLogLine(planOn)  // → "Provenance: ON (github)"
 * provenanceLogLine(planOff) // → "Provenance: SKIPPED — provenance requires GitHub Actions or GitLab CI"
 * provenanceLogLine(notRequested) // → null
 */
export function provenanceLogLine(plan: ProvenancePlan): string | null;
```

### Integration Points

`publish()` (`src/lockstep.ts:459`) is rewired to:

```
const plan = planProvenance(packages, { flag: options.provenance ?? false, env: process.env });

// log exactly once (ST-8) — the line is computed purely and is secret-free (ST-9)
const line = provenanceLogLine(plan);
if (line) console.log(line);

// fail-fast BEFORE the loop (ST-4)
if (plan.effective && plan.missingRepository.length > 0) {
  throw new Error(
    `--provenance requires a "repository" field in package.json. Missing in: ` +
    plan.missingRepository.join(", ")
  );
}

for (const name of order) {
  const prov = plan.effective && plan.enabledPackages.has(name);
  const cmd = buildPublishCommand(this.config.packageManager, {
    access, tag: finalTag, provenance: prov, dry,
  });
  execSync(cmd, { cwd: p.dir, stdio: "inherit" });
}
```

`--dry` runs `planProvenance` and the log/preflight normally, then each `execSync` carries
`--dry-run` (no real publish) — so dry-run reports the intended state and validates `repository`
without publishing (ST-7).

## Code Examples

### Example 1: Non-CI skip (AR #6)
```
planProvenance(pkgs, { flag: true, env: {} })
// → { requested: true, effective: false, enabledPackages: ∅,
//     skippedReason: "provenance requires GitHub Actions or GitLab CI", missingRepository: [] }
// publish() logs "Provenance: SKIPPED — …" and publishes without --provenance.
```

### Example 2: publishConfig subset (AR PA-3)
```
// pkgA.publishConfig.provenance = true; pkgB has no publishConfig; flag = false; in GitHub Actions
planProvenance([pkgA, pkgB], { flag: false, env: { GITHUB_ACTIONS: "true" } })
// → effective: true, enabledPackages: { "pkgA" }, missingRepository: (pkgA only, if it lacks repository)
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| `--provenance` requested, not in supported CI | Warn (`skippedReason`), continue publishing without provenance — never throw | RD-02 AR #6 |
| Provenance-enabled package missing `repository` | Throw a single aggregated error listing the package name(s) BEFORE any `execSync` | RD-02 AR #7, PA-3 |
| Non-provenance package missing `repository` | Ignored — not validated (only provenance-enabled packages are checked) | AR PA-3 |
| Unlisted CI provider | Treated as unsupported → skip-with-warning (safe default) | RD-02 AR #6 |
| Secret/token in a logged command | Never interpolate secret-bearing env into a log line; `--provenance` is a fixed literal | RD-03 |

> **Traceability:** every error-handling strategy references the register (RD-02 / plan AR).
> See `00-ambiguity-register.md` and `../../requirements/00-ambiguity-register.md`.

## Testing Requirements
- Unit tests for `detectSupportedCI` (each provider + none), `planProvenance` (flag/publishConfig,
  CI/no-CI, missing-repository scoping), and `buildPublishCommand` (each manager, provenance on/off, dry).
- Baseline regression: `buildPublishCommand(..., provenance:false)` equals the pre-feature command.
- Integration: `publish()` throws before the loop when `missingRepository` is non-empty.
