/**
 * Core Lockstep functionality
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildPackageChangeSummary } from "./changelog/change-detection.js";
import { writeOrUpdateChangelog } from "./changelog/changelog-writer.js";
import { createLLMConfig, LLMProvider } from "./changelog/llm-provider.js";
import { buildChangelogPrompt, buildReleaseNotesPrompt } from "./changelog/prompts.js";
import { writeReleaseNotes } from "./changelog/release-notes-writer.js";
import type { ChangelogOptions } from "./changelog/types.js";
import { buildPublishCommand, planProvenance, provenanceLogLine } from "./provenance.js";
import type {
    BumpType,
    DependencyField,
    LockstepConfig,
    PackageJson,
    PackageManager,
    PublishOptions,
    SyncOptions,
    TagMode,
    VersionOptions,
    WorkspaceInfo,
    WorkspacePackage
} from "./types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** All dependency fields to check when building dependency graph */
const DEP_FIELDS: DependencyField[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/**
 * Shell-safe npm dist-tag shape. npm itself rejects tags that encode differently in a URL and
 * tags that parse as semver; this conservative allowlist also keeps CLI input out of shell
 * metacharacters, because publish commands are executed through a shell.
 */
const DIST_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Reads and parses a JSON file
 * @param p - Path to the JSON file
 * @returns Parsed JSON object
 */
function readJSON(p: string): PackageJson {
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Writes an object to a JSON file with proper formatting
 * @param p - Path to write the JSON file
 * @param obj - Object to serialize to JSON
 */
function writeJSON(p: string, obj: PackageJson): void {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Checks if a file or directory exists
 * @param p - Path to check
 * @returns True if path exists, false otherwise
 */
function exists(p: string): boolean {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Runs a git command in the given working directory and returns the output.
 *
 * The command is passed as an argument vector and executed without a shell, so repository data
 * such as tag names can never be interpreted as shell syntax.
 *
 * @param args - Git arguments, without the leading "git"
 * @param cwd - Working directory the command runs in
 * @returns Command output as trimmed string
 */
function git(args: string[], cwd: string): string {
    return execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}

/**
 * Returns today's date as a local YYYY-MM-DD string, used to stamp changelog entries.
 * @returns The formatted date
 */
function todayDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ============================================================================
// LOCKSTEP CLASS
// ============================================================================

/**
 * Main Lockstep class that handles monorepo versioning and publishing
 */
export class Lockstep {
    private config: Required<LockstepConfig>;

    constructor(config: LockstepConfig = {}) {
        // Set up basic config first
        const root = config.root || process.cwd();
        const packagesDirs = config.packagesDirs || ["packages"];

        // Create a temporary config for detectPackageManager
        this.config = {
            root,
            packagesDirs,
            packageManager: "npm" // temporary default
        };

        // Now detect package manager with proper config in place
        this.config = {
            root,
            packagesDirs,
            packageManager: config.packageManager || this.detectPackageManager()
        };
    }

    /**
     * Executes a side-effecting command in the given directory, inheriting its output.
     *
     * Package-manager and publish commands live behind this seam so tests can record or fail
     * them without invoking a real registry client. Git commands are executed directly because
     * their behavior (tags, pushes, commits) is part of what the tests need to observe.
     *
     * @param cmd - Command to execute
     * @param cwd - Working directory the command runs in
     */
    protected execCommand(cmd: string, cwd: string): void {
        execSync(cmd, { cwd, stdio: "inherit" });
    }

    /**
     * Recursively finds all directories containing package.json files
     * @returns Array of absolute paths to package directories
     */
    private findPackageDirs(): string[] {
        const dirs: string[] = [];

        const searchRecursively = (dirPath: string): void => {
            if (!exists(dirPath)) return;

            for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (entry.isDirectory() && entry.name !== "node_modules") {
                    const entryPath = path.join(dirPath, entry.name);
                    const pkgPath = path.join(entryPath, "package.json");

                    // If this directory has a package.json, it's a package
                    if (exists(pkgPath)) {
                        dirs.push(entryPath);
                    }

                    // Continue searching recursively in subdirectories
                    searchRecursively(entryPath);
                }
            }
        };

        // Search all configured package directories
        for (const base of this.config.packagesDirs) {
            const basePath = path.join(this.config.root, base);
            searchRecursively(basePath);
        }

        // Single-package repositories keep their only package.json at the repository root with no
        // packages/ directory. When workspace discovery finds nothing, fall back to that root
        // package so version, changelog, and publish still operate on it. Monorepos are unaffected:
        // their packages/ entries are discovered above, so this fallback never triggers — and a
        // monorepo's (often private) workspace-root package.json is never swept in.
        if (dirs.length === 0 && exists(path.join(this.config.root, "package.json"))) {
            dirs.push(this.config.root);
        }

        return dirs;
    }

    /**
     * Builds complete workspace information including packages and dependency graph
     * @returns WorkspaceInfo containing packages, lookup map, and dependency graph
     */
    buildWorkspace(): WorkspaceInfo {
        const dirs = this.findPackageDirs();
        const packages: WorkspacePackage[] = dirs.map((dir) => {
            const pkg = readJSON(path.join(dir, "package.json"));
            return {
                dir,
                pkgPath: path.join(dir, "package.json"),
                name: pkg.name,
                version: pkg.version,
                data: pkg
            };
        });

        const byName = new Map(packages.map((p) => [p.name, p]));

        // Build dependency graph: package -> dependents (for topological sorting)
        const graph = new Map<string, string[]>();
        for (const p of packages) graph.set(p.name, []);

        // Analyze all dependency fields to build the graph
        for (const p of packages) {
            for (const field of DEP_FIELDS) {
                const deps = p.data[field] || {};
                for (const depName of Object.keys(deps)) {
                    if (byName.has(depName)) {
                        // Add edge: dependency -> dependent
                        graph.get(depName)!.push(p.name);
                    }
                }
            }
        }

        return { packages, byName, graph };
    }

    /**
     * Ensures all packages have the same version (lockstep requirement)
     * @param packages - Array of workspace packages
     * @returns The common version string
     * @throws Error if packages have different versions
     */
    ensureAllSameVersion(packages: WorkspacePackage[]): string {
        const set = new Set(packages.map((p) => p.version));

        if (set.size !== 1) {
            throw new Error(`Lockstep requires all packages have the same version. Found: ${[...set].join(", ")}`);
        }

        return [...set][0]!;
    }

    /**
     * Bumps a semantic version according to the specified type
     * @param v - Current version string (e.g., "1.2.3")
     * @param type - Type of bump (patch, minor, major)
     * @returns New version string
     * @throws Error if version is not valid semver
     */
    semverBump(v: string, type: Exclude<BumpType, "auto">): string {
        const m = v.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
        if (!m) throw new Error(`Not a semver version: ${v}`);

        const [, MA, MI, PA] = m;
        let major = +MA;
        let minor = +MI;
        let patch = +PA;

        // Apply version bump rules
        if (type === "major") {
            major += 1;
            minor = 0;
            patch = 0;
        } else if (type === "minor") {
            minor += 1;
            patch = 0;
        } else if (type === "patch") {
            patch += 1;
        }

        return `${major}.${minor}.${patch}`;
    }

    /**
     * Compares two semantic versions by precedence.
     *
     * The three numeric fields are compared as integers, so `1.10.0` correctly outranks `1.9.0` —
     * a plain string comparison would get this backwards. A normal release outranks its own
     * pre-release (`1.0.0` > `1.0.0-alpha`, per semver); when both carry a pre-release and their
     * numeric cores are equal, the pre-release identifiers are compared as plain strings. That last
     * step is a deliberate simplification: it orders the common cases (`alpha` < `beta`) without a
     * full dot-separated precedence walk, which lockstep's uniform versions never need.
     *
     * @param a - First version string
     * @param b - Second version string
     * @returns Negative if a precedes b, positive if a follows b, zero if equal in precedence
     * @throws Error if either argument is not a valid semver version
     *
     * @example
     * lockstep.semverCompare("1.10.0", "1.9.0"); // > 0 (10 is greater than 9 numerically)
     */
    semverCompare(a: string, b: string): number {
        const parse = (v: string): { nums: number[]; pre: string } => {
            const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
            if (!m) throw new Error(`Not a semver version: ${v}`);
            return { nums: [+m[1], +m[2], +m[3]], pre: m[4] ?? "" };
        };

        const pa = parse(a);
        const pb = parse(b);

        for (let i = 0; i < 3; i++) {
            if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
        }

        // Equal numeric cores: a missing pre-release ranks above any present one.
        if (pa.pre === pb.pre) return 0;
        if (pa.pre === "") return 1;
        if (pb.pre === "") return -1;
        return pa.pre < pb.pre ? -1 : 1;
    }

    /**
     * Returns the highest-precedence version from a non-empty list, using {@link semverCompare}.
     * @param versions - Version strings to compare (at least one)
     * @returns The greatest version by semver precedence
     * @throws Error if the list is empty or any entry is not a valid semver version
     *
     * @example
     * lockstep.highestVersion(["1.0.0", "1.10.0", "1.9.0"]); // "1.10.0"
     */
    highestVersion(versions: string[]): string {
        if (versions.length === 0) {
            throw new Error("highestVersion requires at least one version");
        }
        // Seed the reduction with the first entry and compare every element, so an invalid version
        // anywhere — including a lone entry — is rejected by semverCompare rather than passed through.
        return versions.reduce((max, v) => (this.semverCompare(v, max) > 0 ? v : max), versions[0]);
    }

    /**
     * Preserves the version range operator when updating dependency versions.
     *
     * `workspace:` ranges are intentionally returned untouched. That protocol is resolved by
     * pnpm from the local workspace, and pnpm rewrites it to a concrete range when the package
     * is packed. Rewriting it here would break the workspace link.
     *
     * @param oldRange - Original version range (e.g., "^1.2.3", "~1.2.3")
     * @param newVersion - New version to apply
     * @returns New version range with preserved operator
     */
    preserveOperator(oldRange: string, newVersion: string): string {
        if (oldRange.startsWith("workspace:")) return oldRange;
        if (oldRange.startsWith("^")) return `^${newVersion}`;
        if (oldRange.startsWith("~")) return `~${newVersion}`;
        if (oldRange.startsWith(">=")) return `>=${newVersion}`;
        if (oldRange.startsWith("=")) return `=${newVersion}`;
        // For exact versions, wildcards, or other formats, use exact version
        return newVersion;
    }

    /**
     * Validates an npm dist-tag before it is interpolated into a shell command.
     *
     * @param tag - The final tag that will be passed to the package manager
     * @throws Error when the tag is empty or contains characters npm or the shell cannot accept
     */
    private validateDistTag(tag: string): void {
        if (!DIST_TAG_PATTERN.test(tag)) {
            throw new Error(
                `Invalid npm dist-tag "${tag}". Tags must start with a letter and contain only ` +
                    `letters, digits, dots, underscores, and hyphens. Use --tag-mode exact or a ` +
                    `branch name without "/" or other special characters.`
            );
        }
    }

    /**
     * Validates the npm access level before it is interpolated into a shell command.
     *
     * @param access - The requested access level
     * @throws Error when the value is not "public" or "restricted"
     */
    private validateAccess(access: string): void {
        if (access !== "public" && access !== "restricted") {
            throw new Error(`--access must be "public" or "restricted", received "${access}"`);
        }
    }

    /**
     * Resolves the dist-tag that publish will send to the registry.
     *
     * `latest` is always used verbatim. In `exact` mode every tag is used verbatim, which is how
     * a `next` or `beta` release gets its expected global tag. In `branch` mode (the default),
     * non-`latest` tags are prefixed with the current branch for backward compatibility.
     *
     * @param tag - The tag supplied by the caller
     * @param mode - Tag derivation mode
     * @param branch - Current git branch, used only by branch mode
     * @returns The final dist-tag
     *
     * @example
     * lockstep.resolveDistTag("next", "exact", "main");     // "next"
     * lockstep.resolveDistTag("next", "branch", "main");    // "main-next"
     */
    resolveDistTag(tag: string, mode: TagMode, branch: string): string {
        if (tag === "latest") return "latest";
        return mode === "exact" ? tag : `${branch}-${tag}`;
    }

    /**
     * Performs topological sorting on packages based on their dependencies
     * Uses Kahn's algorithm to ensure dependencies are published before dependents
     * @param pkgs - Array of workspace packages
     * @param graph - Dependency graph (package -> dependents)
     * @returns Array of package names in dependency order
     * @throws Error if circular dependencies are detected
     */
    topoSort(pkgs: WorkspacePackage[], graph: Map<string, string[]>): string[] {
        // Initialize in-degree count for each package
        const inDeg = new Map(pkgs.map((p) => [p.name, 0]));

        // Calculate in-degrees (number of dependencies for each package)
        for (const [, vs] of graph.entries()) {
            for (const v of vs) {
                inDeg.set(v, (inDeg.get(v) || 0) + 1);
            }
        }

        // Start with packages that have no dependencies
        const q = [...pkgs.map((p) => p.name).filter((n) => (inDeg.get(n) || 0) === 0)];
        const out: string[] = [];

        // Process packages in dependency order
        while (q.length) {
            const n = q.shift()!;
            out.push(n);

            // Update in-degrees for dependents
            for (const v of graph.get(n) || []) {
                const currentDeg = inDeg.get(v)! - 1;
                inDeg.set(v, currentDeg);
                if (currentDeg === 0) q.push(v);
            }
        }

        // Check for circular dependencies
        if (out.length !== pkgs.length) {
            throw new Error("Cycle detected in local dependency graph.");
        }

        return out;
    }

    /**
     * Checks if there are changes since the last git tag
     * @returns True if there are changes, false otherwise
     */
    changedSinceLastTag(): boolean {
        let lastTag = "";
        try {
            lastTag = git(["describe", "--tags", "--abbrev=0"], this.config.root);
        } catch {
            // No tags exist, assume changes
            return true;
        }

        const diff = git(["diff", "--name-only", `${lastTag}..HEAD`], this.config.root);
        return diff.split("\n").some(Boolean);
    }

    /**
     * Analyzes conventional commit messages to determine the appropriate version bump type
     * @returns The determined version bump type, defaults to 'patch' if uncertain
     */
    determineVersionType(): Exclude<BumpType, "auto"> {
        let lastTag = "";
        try {
            lastTag = git(["describe", "--tags", "--abbrev=0"], this.config.root);
        } catch {
            // No tags exist, default to patch
            console.log("No previous tags found, defaulting to patch version bump");
            return "patch";
        }

        // Get commit messages since last tag
        let commits: string;
        try {
            commits = git(["log", `${lastTag}..HEAD`, "--pretty=format:%s"], this.config.root);
        } catch {
            console.log("Unable to get commit history, defaulting to patch version bump");
            return "patch";
        }

        if (!commits.trim()) {
            console.log("No commits since last tag, defaulting to patch version bump");
            return "patch";
        }

        const commitLines = commits.split("\n").filter((line) => line.trim());
        console.log(`Analyzing ${commitLines.length} commits since ${lastTag}:`);

        let hasBreaking = false;
        let hasFeature = false;
        let hasFix = false;

        for (const commit of commitLines) {
            console.log(`  - ${commit}`);

            // Check for breaking changes
            if (commit.includes("BREAKING CHANGE") || commit.includes("!:")) {
                hasBreaking = true;
                continue;
            }

            // Check for features
            if (commit.match(/^feat(\(.+\))?:/)) {
                hasFeature = true;
                continue;
            }

            // Check for fixes and other patch-level changes
            if (commit.match(/^(fix|docs|style|refactor|test|chore)(\(.+\))?:/)) {
                hasFix = true;
                continue;
            }
        }

        // Determine version bump based on conventional commit analysis
        if (hasBreaking) {
            console.log("🔥 Breaking changes detected → major version bump");
            return "major";
        } else if (hasFeature) {
            console.log("✨ New features detected → minor version bump");
            return "minor";
        } else if (hasFix) {
            console.log("🐛 Fixes or maintenance detected → patch version bump");
            return "patch";
        } else {
            console.log("📝 No conventional commits found → defaulting to patch version bump");
            return "patch";
        }
    }

    /**
     * Detects the package manager being used in the project
     * @returns Detected package manager (npm, yarn, or pnpm)
     */
    detectPackageManager(): PackageManager {
        if (exists(path.join(this.config.root, "pnpm-lock.yaml"))) return "pnpm";
        if (exists(path.join(this.config.root, "yarn.lock"))) return "yarn";
        if (exists(path.join(this.config.root, "package-lock.json"))) return "npm";
        return "npm"; // Default fallback
    }

    /**
     * Regenerates the pnpm lockfile importer specifiers after package manifests changed.
     *
     * A pnpm workspace lockfile records each workspace package's version and internal dependency
     * ranges. Rewriting `package.json` without refreshing it leaves the two out of sync, so the
     * next `pnpm install --frozen-lockfile` fails. `--lockfile-only` updates just the lockfile,
     * without touching `node_modules`.
     *
     * The refresh is skipped when no `pnpm-lock.yaml` exists. When pnpm is unavailable or the
     * command fails, the error is fatal: continuing would commit a lockfile that does not match
     * the manifests.
     *
     * @throws Error with recovery guidance when the refresh fails
     */
    protected refreshLockfile(): void {
        if (!exists(path.join(this.config.root, "pnpm-lock.yaml"))) return;

        console.log("Refreshing pnpm lockfile...");
        try {
            this.execCommand("pnpm install --lockfile-only", this.config.root);
        } catch {
            throw new Error(
                "Failed to refresh pnpm-lock.yaml with `pnpm install --lockfile-only`. " +
                    "Ensure pnpm is installed and the workspace is valid, or rerun with " +
                    "--no-lockfile-refresh to skip the refresh."
            );
        }
    }

    /**
     * Bumps versions of all packages in lockstep and optionally commits/tags.
     *
     * After rewriting the manifests, a pnpm workspace's lockfile is refreshed so a later
     * `pnpm install --frozen-lockfile` remains valid. The release tag is annotated, which lets
     * `git push --follow-tags` push it.
     *
     * @param options - Bump type plus skip/no-op switches and the lockfile refresh toggle
     */
    async version(options: VersionOptions): Promise<void> {
        const { type, skipCi = false, noGitCommit = false, noChangelog = false, lockfileRefresh = true } = options;

        // If auto is specified, determine the actual version type
        const actualType = type === "auto" ? this.determineVersionType() : type;

        // Print the determined version type prominently when using auto
        if (type === "auto") {
            console.log(`\n🎯 Automatic version detection determined: ${actualType.toUpperCase()}`);
            console.log(`────────────────────────────────────────────────────────────\n`);
        }

        const { packages } = this.buildWorkspace();
        const current = this.ensureAllSameVersion(packages);
        const next = this.semverBump(current, actualType);

        this.applyVersion(packages, next);

        // Keep the pnpm lockfile's importer specifiers aligned with the manifests before the
        // release commit is created, so `pnpm install --frozen-lockfile` continues to pass.
        if (lockfileRefresh) this.refreshLockfile();

        // Generate the changelog into the release commit, unless opted out. A changelog failure
        // must never abort a release that already succeeded, so any error degrades to a warning.
        if (!noChangelog) {
            try {
                await this.changelog({});
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                console.warn(`Changelog generation failed, continuing release: ${detail}`);
            }
        }

        // Perform git operations unless explicitly skipped
        if (!noGitCommit) {
            execFileSync("git", ["add", "."], { cwd: this.config.root, stdio: "inherit" });
            const commitMessage = `chore(release): v${next}${skipCi ? " [skip ci]" : ""}`;
            execFileSync("git", ["commit", "-m", commitMessage], { cwd: this.config.root, stdio: "inherit" });
            // Annotated tags are required for `git push --follow-tags` to push the release tag.
            execFileSync("git", ["tag", "-a", `v${next}`, "-m", `v${next}`], {
                cwd: this.config.root,
                stdio: "inherit"
            });

            console.log(`\nAll packages bumped to v${next} and tagged.`);
        } else {
            console.log(`\nAll packages bumped to v${next}. Git commit and tag skipped.`);
        }
    }

    /**
     * Writes a single target version across every workspace package and the repository-root
     * package.json, rewriting internal cross-dependency ranges to match while preserving each
     * range's operator. Shared by the lockstep bump and the drift-recovery sync so both apply a
     * version identically.
     * @param packages - The workspace packages to rewrite
     * @param next - The version string to apply everywhere
     */
    protected applyVersion(packages: WorkspacePackage[], next: string): void {
        // Internal package names drive which dependency ranges get rewritten; external dependencies
        // are left untouched so only the monorepo's own cross-references move in lockstep.
        const internalNames = new Set(packages.map((p) => p.name));

        for (const p of packages) {
            const pkg = p.data;
            pkg.version = next;

            for (const field of DEP_FIELDS) {
                const deps = pkg[field];
                if (!deps) continue;

                for (const [dep, range] of Object.entries(deps)) {
                    if (!internalNames.has(dep)) continue;
                    if (typeof range !== "string") continue;
                    deps[dep] = this.preserveOperator(range, next);
                }
            }

            writeJSON(p.pkgPath, pkg);
            console.log(`✔ ${p.name} -> ${next}`);
        }

        // A monorepo's workspace-root package.json is not part of `packages`; keep it in step so its
        // version never drifts from the packages it aggregates.
        const rootPkgPath = path.join(this.config.root, "package.json");
        if (exists(rootPkgPath)) {
            const rootPkg = readJSON(rootPkgPath);
            if (rootPkg.version) {
                rootPkg.version = next;
                writeJSON(rootPkgPath, rootPkg);
                console.log(`✔ root -> ${next}`);
            }
        }
    }

    /**
     * Realigns every package to the highest version found, recovering a workspace whose packages
     * have drifted out of lockstep.
     *
     * Unlike {@link version} this mints no new version and touches no git state: it scans all
     * packages (and the repository-root package.json), selects the greatest version by semver
     * precedence, and rewrites every package plus its internal dependency ranges to that version.
     * When the workspace is already uniform it reports so and writes nothing. This is the recovery
     * path for the "all packages share a version" invariant that {@link version}, changelog
     * generation, and {@link publish} all depend on.
     *
     * @param options - Dry-run switch and the lockfile refresh toggle
     *
     * @example
     * await lockstep.syncVersions();                 // realign every package to the highest version
     * await lockstep.syncVersions({ dryRun: true });  // preview which packages would change
     */
    async syncVersions(options: SyncOptions = {}): Promise<void> {
        const { dryRun = false, lockfileRefresh = true } = options;

        const { packages } = this.buildWorkspace();
        if (packages.length === 0) {
            console.log("No packages found; nothing to sync.");
            return;
        }

        // A single-package repo discovers its root as the package itself; a monorepo keeps a
        // separate aggregator root outside `packages`. Only that separate root needs folding into
        // the candidate set and drift check — otherwise the root is already covered by `packages`.
        const rootPkgPath = path.join(this.config.root, "package.json");
        const rootIsPackage = packages.some((p) => p.pkgPath === rootPkgPath);

        let rootVersion: string | undefined;
        if (!rootIsPackage && exists(rootPkgPath)) {
            const v = readJSON(rootPkgPath).version;
            if (v) rootVersion = v;
        }

        const candidates = packages.map((p) => p.version);
        if (rootVersion) candidates.push(rootVersion);

        const target = this.highestVersion(candidates);

        const behind = packages.filter((p) => p.version !== target);
        const rootBehind = rootVersion !== undefined && rootVersion !== target;

        if (behind.length === 0 && !rootBehind) {
            console.log(`All packages already in sync at v${target}.`);
            return;
        }

        if (dryRun) {
            console.log(`[dry-run] Would sync to v${target}:`);
            for (const p of behind) console.log(`  ${p.name}: ${p.version} -> ${target}`);
            if (rootBehind) console.log(`  (root package.json): ${rootVersion} -> ${target}`);
            return;
        }

        console.log(`Syncing all packages to the highest version found: v${target}`);
        this.applyVersion(packages, target);
        if (lockfileRefresh) this.refreshLockfile();
        console.log(`\nAll packages synced to v${target}.`);
    }

    /**
     * Publishes all packages in dependency order, skipping private packages.
     *
     * By default non-`latest` tags are branch-prefixed for backward compatibility. Pass
     * `tagMode: "exact"` to publish the supplied tag verbatim. When `preflight` is set, every
     * publishable package is dry-run first so a packaging failure cannot strand earlier packages
     * on the registry.
     *
     * @param options - Publishing options including access, tag, tag mode, preflight, and git push
     */
    async publish(options: PublishOptions): Promise<void> {
        const {
            access = "public",
            dry = false,
            tag,
            tagMode = "branch",
            preflight = false,
            gitPush = false,
            provenance = false
        } = options;

        if (!tag) {
            throw new Error("--tag parameter is required for publish command");
        }
        if (tagMode !== "branch" && tagMode !== "exact") {
            throw new Error('--tag-mode must be "branch" or "exact"');
        }
        this.validateAccess(access);

        const { packages, byName, graph } = this.buildWorkspace();
        const order = this.topoSort(packages, graph); // Ensure dependencies publish first

        // Private packages stay in the graph so their dependents still sort correctly, but they
        // are never handed to a registry. npm refuses to publish a package marked private.
        const publishable: WorkspacePackage[] = [];
        const skipped: string[] = [];
        for (const name of order) {
            const p = byName.get(name);
            if (!p) {
                throw new Error(`Package ${name} not found in workspace`);
            }
            if (p.data.private === true) skipped.push(name);
            else publishable.push(p);
        }

        if (skipped.length > 0) {
            console.log(`Skipping private packages: ${skipped.join(", ")}`);
        }
        if (publishable.length === 0) {
            console.warn("No publishable packages found; every discovered package is private.");
            return;
        }

        console.log("Publish order:", publishable.map((p) => p.name).join(" -> "));

        // Resolve provenance up front: detect the CI, decide which packages get attestation, and
        // validate their repository fields before anything is published — a missing field aborts
        // the whole run rather than stranding half the monorepo on the registry. Private packages
        // are excluded because they are not part of the publish set.
        const provenancePlan = planProvenance(publishable, { flag: provenance, env: process.env });
        const provenanceLine = provenanceLogLine(provenancePlan);
        if (provenanceLine) console.log(provenanceLine);

        if (provenancePlan.effective && provenancePlan.missingRepository.length > 0) {
            throw new Error(
                `--provenance requires a "repository" field in package.json. Missing in: ` +
                    provenancePlan.missingRepository.join(", ")
            );
        }

        const currentBranch = git(["rev-parse", "--abbrev-ref", "HEAD"], this.config.root);
        if (tagMode === "branch" && tag !== "latest" && currentBranch === "HEAD") {
            throw new Error(
                "Cannot derive a branch-prefixed dist-tag in detached HEAD. Use --tag-mode exact."
            );
        }

        const finalTag = this.resolveDistTag(tag, tagMode, currentBranch);
        this.validateDistTag(finalTag);

        console.log(`Publishing with dist-tag: ${finalTag}`);
        if (tagMode === "branch" && tag !== "latest") {
            console.log(`Branch: ${currentBranch}, Original tag: ${tag}`);
        }

        console.log(`Using package manager: ${this.config.packageManager}`);

        const publishPackage = (p: WorkspacePackage, isDry: boolean): void => {
            // pnpm publishes with its own CLI; npm and yarn both publish via `npm publish`.
            // Provenance is applied only to the packages the plan enabled.
            const cmd = buildPublishCommand(this.config.packageManager, {
                access,
                tag: finalTag,
                provenance: provenancePlan.effective && provenancePlan.enabledPackages.has(p.name),
                dry: isDry
            });

            this.execCommand(cmd, p.dir);
        };

        // Dry-run every package first so a packaging error in a later package aborts the run
        // before any earlier package is irreversibly published.
        if (preflight && !dry) {
            console.log("\nPreflight: dry-running every package before publishing...");
            for (const p of publishable) publishPackage(p, true);
            console.log("Preflight passed; starting real publish.");
        }

        // Publish each package in dependency order
        for (const p of publishable) {
            publishPackage(p, dry);
        }

        // Push git changes and tags if requested (and not in dry run)
        if (gitPush && !dry) {
            console.log("\nPushing git changes and tags...");
            execFileSync("git", ["push", "--follow-tags"], { cwd: this.config.root, stdio: "inherit" });
            console.log("✔ Git changes and tags pushed to remote");
        }
    }

    /**
     * Creates the LLM provider used for changelog generation. Isolated so tests can substitute a
     * stub provider without configuring real API keys.
     * @returns A provider built from environment configuration
     */
    protected createChangelogProvider(): LLMProvider {
        return new LLMProvider(createLLMConfig());
    }

    /**
     * Generates a per-package `CHANGELOG.md` and a root `RELEASE_NOTES.md` for the current release.
     *
     * Detects which packages changed since the last release tag, attributes commits to packages,
     * asks the LLM to write each entry, and writes the files. It never throws on an expected
     * failure: with no API key or on any provider error it writes deterministic fallback entries so
     * a release always has a changelog.
     *
     * @param options - Dry-run and verbose switches
     *
     * @example
     * await lockstep.changelog();                 // write changelog + release notes
     * await lockstep.changelog({ dryRun: true });  // preview only, write nothing
     */
    async changelog(options: ChangelogOptions = {}): Promise<void> {
        const { dryRun = false, verbose = false } = options;

        const { packages } = this.buildWorkspace();
        const version = this.ensureAllSameVersion(packages);
        const date = todayDate();

        const summaries = buildPackageChangeSummary(this.config.root, packages);
        if (summaries.length === 0) {
            console.log("No package changes detected since the last release; nothing to generate.");
            return;
        }

        const provider = this.createChangelogProvider();
        const available = provider.getAvailableProviders();
        if (available.length === 0) {
            console.warn("No LLM API keys configured; writing fallback changelog entries.");
        } else if (verbose) {
            console.log(`LLM providers available: ${available.join(", ")}`);
        }

        let tokensIn = 0;
        let tokensOut = 0;

        // Per-package changelog entries.
        for (const summary of summaries) {
            const { system, user } = buildChangelogPrompt(summary);
            const result = await provider.generate(system, user);
            if (result) {
                tokensIn += result.tokensUsed.input;
                tokensOut += result.tokensUsed.output;
            }
            const content = result?.content ?? "";

            if (dryRun) {
                console.log(`[dry-run] ${summary.packageName} CHANGELOG:\n${content || "(fallback entry)"}`);
            } else {
                writeOrUpdateChangelog(summary.packageDir, version, date, content);
                if (verbose) console.log(`✔ ${summary.packageName} -> ${summary.packagePath}/CHANGELOG.md`);
            }
        }

        // Root non-technical release notes.
        const notes = buildReleaseNotesPrompt(version, summaries);
        const notesResult = await provider.generate(notes.system, notes.user);
        if (notesResult) {
            tokensIn += notesResult.tokensUsed.input;
            tokensOut += notesResult.tokensUsed.output;
        }
        const notesContent = notesResult?.content ?? "";

        if (dryRun) {
            console.log(`[dry-run] RELEASE_NOTES:\n${notesContent || "(placeholder)"}`);
        } else {
            writeReleaseNotes(this.config.root, version, date, notesContent);
            if (verbose) console.log("✔ RELEASE_NOTES.md");
        }

        if (verbose) console.log(`Changelog tokens: ~${tokensIn} in, ~${tokensOut} out`);
    }
}
