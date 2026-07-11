/**
 * npm provenance support.
 *
 * npm provenance produces a signed, publicly verifiable record binding a published package to the
 * source commit and CI build that produced it. Generating it requires publishing from a supported
 * cloud CI/CD (GitHub Actions or GitLab CI), where the CI's OIDC identity is exchanged by npm.
 *
 * The logic here is pure: it takes the environment as an argument and returns plain values, so the
 * publish command, the CI decision, and the repository-field preflight can be verified without
 * running a real publish.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import type { PackageManager, WorkspacePackage } from "./types.js";

// ============================================================================
// TYPES
// ============================================================================

/** A cloud CI/CD provider capable of generating npm provenance. */
export type CiProvider = "github" | "gitlab";

/** Result of probing the environment for a provenance-supported CI. */
export interface CiInfo {
    /** True when a provenance-supported cloud CI was detected. */
    supported: boolean;
    /** The detected provider, or null when unsupported. */
    provider: CiProvider | null;
}

/** The resolved provenance decision for a publish set. */
export interface ProvenancePlan {
    /** CI detection result. */
    ci: CiInfo;
    /** True when provenance was asked for — via the flag or any package's publishConfig. */
    requested: boolean;
    /** True when provenance will actually be applied (requested AND in supported CI). */
    effective: boolean;
    /** Names of packages that will publish with provenance (empty unless effective). */
    enabledPackages: Set<string>;
    /** Provenance-enabled packages missing a repository field — the fail-fast list. */
    missingRepository: string[];
    /** Why provenance was skipped despite being requested, or null. */
    skippedReason: string | null;
}

// ============================================================================
// CI DETECTION
// ============================================================================

/** Human-readable list of the CI environments that can generate provenance. */
const SUPPORTED_CI_LABEL = "GitHub Actions or GitLab CI";

/**
 * Detects whether the process runs in a provenance-supported cloud CI/CD.
 *
 * Only GitHub Actions and GitLab CI can generate provenance; each advertises itself with a
 * standard environment variable set to the literal string "true".
 *
 * @param env - Environment to inspect (defaults to `process.env`); injected for testability
 * @returns Whether a supported CI was detected and which provider
 *
 * @example
 * detectSupportedCI({ GITHUB_ACTIONS: "true" }); // → { supported: true, provider: "github" }
 * detectSupportedCI({});                          // → { supported: false, provider: null }
 */
export function detectSupportedCI(env: NodeJS.ProcessEnv = process.env): CiInfo {
    if (env.GITHUB_ACTIONS === "true") return { supported: true, provider: "github" };
    if (env.GITLAB_CI === "true") return { supported: true, provider: "gitlab" };
    return { supported: false, provider: null };
}

// ============================================================================
// REPOSITORY FIELD
// ============================================================================

/**
 * Reports whether a package declares a usable `repository` field. npm requires it to attach
 * provenance and performs the authoritative match itself; here we only assert its presence.
 * @param pkg - The workspace package to check
 * @returns True when a non-empty repository string or object URL is present
 */
function hasRepositoryField(pkg: WorkspacePackage): boolean {
    const repo = pkg.data.repository;
    if (!repo) return false;
    if (typeof repo === "string") return repo.trim().length > 0;
    return typeof repo.url === "string" && repo.url.trim().length > 0;
}

// ============================================================================
// PROVENANCE PLANNING
// ============================================================================

/**
 * Computes the provenance decision for a publish set without side effects.
 *
 * A package is provenance-enabled when the flag is set or its `publishConfig.provenance` is true.
 * Provenance only takes effect in a supported CI; when requested outside one, `effective` is false
 * and `skippedReason` explains why. The repository preflight validates only the packages that will
 * actually publish with provenance.
 *
 * @param packages - The packages in the publish set
 * @param opts - `flag` is the `--provenance` switch; `env` is injected for testability
 * @returns The resolved plan: CI info, enablement, the missing-repository list, and skip reason
 *
 * @example
 * // In GitHub Actions with the flag set and every package carrying a repository field:
 * planProvenance(packages, { flag: true }).effective; // → true
 */
export function planProvenance(
    packages: WorkspacePackage[],
    opts: { flag: boolean; env?: NodeJS.ProcessEnv }
): ProvenancePlan {
    const ci = detectSupportedCI(opts.env);

    const isEnabled = (pkg: WorkspacePackage): boolean =>
        opts.flag || pkg.data.publishConfig?.provenance === true;

    const requested = packages.some(isEnabled);
    const effective = requested && ci.supported;

    const enabledPackages = new Set<string>();
    const missingRepository: string[] = [];

    if (effective) {
        for (const pkg of packages) {
            if (!isEnabled(pkg)) continue;
            enabledPackages.add(pkg.name);
            if (!hasRepositoryField(pkg)) missingRepository.push(pkg.name);
        }
    }

    const skippedReason =
        requested && !ci.supported ? `provenance requires ${SUPPORTED_CI_LABEL}` : null;

    return { ci, requested, effective, enabledPackages, missingRepository, skippedReason };
}

/**
 * Produces the single provenance-state line to log for a plan, or null when nothing was requested.
 * The line carries only the provider name or the skip reason — never a token — so it is safe to log.
 *
 * @param plan - The resolved provenance plan
 * @returns The log line, or null when provenance was not requested
 *
 * @example
 * provenanceLogLine(plan); // → "Provenance: ON (github)"  |  "Provenance: SKIPPED — provenance requires …"  |  null
 */
export function provenanceLogLine(plan: ProvenancePlan): string | null {
    if (!plan.requested) return null;
    if (plan.effective) return `Provenance: ON (${plan.ci.provider})`;
    return `Provenance: SKIPPED — ${plan.skippedReason ?? "provenance unavailable"}`;
}

// ============================================================================
// PUBLISH COMMAND
// ============================================================================

/**
 * Builds the publish command string for a package manager. `--provenance` is appended only when
 * requested, as a fixed literal — no package or environment content is interpolated into the
 * command. pnpm publishes with its own CLI; npm and yarn both publish via `npm publish`.
 *
 * @param packageManager - The detected package manager
 * @param opts - Access level, dist-tag, and the provenance / dry-run switches
 * @returns The full publish command string
 *
 * @example
 * buildPublishCommand("npm", { access: "public", tag: "latest", provenance: true, dry: false });
 * // → "npm publish --access public --tag latest --provenance"
 */
export function buildPublishCommand(
    packageManager: PackageManager,
    opts: { access: string; tag: string; provenance: boolean; dry: boolean }
): string {
    const bin = packageManager === "pnpm" ? "pnpm" : "npm";
    const parts = [bin, "publish", "--access", opts.access, "--tag", opts.tag];
    if (opts.provenance) parts.push("--provenance");
    if (opts.dry) parts.push("--dry-run");
    return parts.join(" ");
}
