/**
 * Core Lockstep functionality
 * 
 * @author TrueSoftware B.V.
 * @license MIT
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
    BumpType,
    DependencyField,
    LockstepConfig,
    PackageJson,
    PackageManager,
    PublishOptions,
    VersionOptions,
    WorkspaceInfo,
    WorkspacePackage
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** All dependency fields to check when building dependency graph */
const DEP_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Reads and parses a JSON file
 * @param p - Path to the JSON file
 * @returns Parsed JSON object
 */
function readJSON(p: string): PackageJson {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Writes an object to a JSON file with proper formatting
 * @param p - Path to write the JSON file
 * @param obj - Object to serialize to JSON
 */
function writeJSON(p: string, obj: PackageJson): void {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
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
 * Executes a git command and returns the output
 * @param cmd - Git command to execute (without 'git' prefix)
 * @returns Command output as trimmed string
 */
function git(cmd: string): string {
  return execSync(`git ${cmd}`, { stdio: 'pipe' }).toString().trim();
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
    const packagesDirs = config.packagesDirs || ['packages'];
    
    // Create a temporary config for detectPackageManager
    this.config = {
      root,
      packagesDirs,
      packageManager: 'npm', // temporary default
    };
    
    // Now detect package manager with proper config in place
    this.config = {
      root,
      packagesDirs,
      packageManager: config.packageManager || this.detectPackageManager(),
    };
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
        if (entry.isDirectory()) {
          const entryPath = path.join(dirPath, entry.name);
          const pkgPath = path.join(entryPath, 'package.json');

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

    return dirs;
  }

  /**
   * Builds complete workspace information including packages and dependency graph
   * @returns WorkspaceInfo containing packages, lookup map, and dependency graph
   */
  buildWorkspace(): WorkspaceInfo {
    const dirs = this.findPackageDirs();
    const packages: WorkspacePackage[] = dirs.map(dir => {
      const pkg = readJSON(path.join(dir, 'package.json'));
      return {
        dir,
        pkgPath: path.join(dir, 'package.json'),
        name: pkg.name,
        version: pkg.version,
        data: pkg,
      };
    });

    const byName = new Map(packages.map(p => [p.name, p]));

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
    const set = new Set(packages.map(p => p.version));

    if (set.size !== 1) {
      throw new Error(
        `Lockstep requires all packages have the same version. Found: ${[...set].join(', ')}`
      );
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
  semverBump(v: string, type: Exclude<BumpType, 'auto'>): string {
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
    if (!m) throw new Error(`Not a semver version: ${v}`);

    const [, MA, MI, PA] = m;
    let major = +MA;
    let minor = +MI;
    let patch = +PA;

    // Apply version bump rules
    if (type === 'major') {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (type === 'minor') {
      minor += 1;
      patch = 0;
    } else if (type === 'patch') {
      patch += 1;
    }

    return `${major}.${minor}.${patch}`;
  }

  /**
   * Preserves the version range operator when updating dependency versions
   * @param oldRange - Original version range (e.g., "^1.2.3", "~1.2.3")
   * @param newVersion - New version to apply
   * @returns New version range with preserved operator
   */
  preserveOperator(oldRange: string, newVersion: string): string {
    if (oldRange.startsWith('^')) return `^${newVersion}`;
    if (oldRange.startsWith('~')) return `~${newVersion}`;
    if (oldRange.startsWith('>=')) return `>=${newVersion}`;
    if (oldRange.startsWith('=')) return `=${newVersion}`;
    // For exact versions, wildcards, or other formats, use exact version
    return newVersion;
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
    const inDeg = new Map(pkgs.map(p => [p.name, 0]));

    // Calculate in-degrees (number of dependencies for each package)
    for (const [, vs] of graph.entries()) {
      for (const v of vs) {
        inDeg.set(v, (inDeg.get(v) || 0) + 1);
      }
    }

    // Start with packages that have no dependencies
    const q = [...pkgs.map(p => p.name).filter(n => (inDeg.get(n) || 0) === 0)];
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
      throw new Error('Cycle detected in local dependency graph.');
    }

    return out;
  }

  /**
   * Checks if there are changes since the last git tag
   * @returns True if there are changes, false otherwise
   */
  changedSinceLastTag(): boolean {
    let lastTag = '';
    try {
      lastTag = git('describe --tags --abbrev=0');
    } catch {
      // No tags exist, assume changes
      return true;
    }

    const diff = execSync(`git diff --name-only ${lastTag}..HEAD`, { stdio: 'pipe' }).toString();
    return diff.split('\n').some(Boolean);
  }

  /**
   * Analyzes conventional commit messages to determine the appropriate version bump type
   * @returns The determined version bump type, defaults to 'patch' if uncertain
   */
  determineVersionType(): Exclude<BumpType, 'auto'> {
    let lastTag = '';
    try {
      lastTag = git('describe --tags --abbrev=0');
    } catch {
      // No tags exist, default to patch
      console.log('No previous tags found, defaulting to patch version bump');
      return 'patch';
    }

    // Get commit messages since last tag
    let commits: string;
    try {
      commits = git(`log ${lastTag}..HEAD --pretty=format:"%s"`);
    } catch {
      console.log('Unable to get commit history, defaulting to patch version bump');
      return 'patch';
    }

    if (!commits.trim()) {
      console.log('No commits since last tag, defaulting to patch version bump');
      return 'patch';
    }

    const commitLines = commits.split('\n').filter(line => line.trim());
    console.log(`Analyzing ${commitLines.length} commits since ${lastTag}:`);

    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;

    for (const commit of commitLines) {
      console.log(`  - ${commit}`);

      // Check for breaking changes
      if (commit.includes('BREAKING CHANGE') || commit.includes('!:')) {
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
      console.log('🔥 Breaking changes detected → major version bump');
      return 'major';
    } else if (hasFeature) {
      console.log('✨ New features detected → minor version bump');
      return 'minor';
    } else if (hasFix) {
      console.log('🐛 Fixes or maintenance detected → patch version bump');
      return 'patch';
    } else {
      console.log('📝 No conventional commits found → defaulting to patch version bump');
      return 'patch';
    }
  }

  /**
   * Detects the package manager being used in the project
   * @returns Detected package manager (npm, yarn, or pnpm)
   */
  detectPackageManager(): PackageManager {
    if (exists(path.join(this.config.root, 'pnpm-lock.yaml'))) return 'pnpm';
    if (exists(path.join(this.config.root, 'yarn.lock'))) return 'yarn';
    if (exists(path.join(this.config.root, 'package-lock.json'))) return 'npm';
    return 'npm'; // Default fallback
  }

  /**
   * Bumps versions of all packages in lockstep and optionally commits/tags
   * @param options - Version options including type, skipCi, and noGitCommit
   */
  async version(options: VersionOptions): Promise<void> {
    const { type, skipCi = false, noGitCommit = false } = options;

    // If auto is specified, determine the actual version type
    const actualType = type === 'auto' ? this.determineVersionType() : type;

    // Print the determined version type prominently when using auto
    if (type === 'auto') {
      console.log(`\n🎯 Automatic version detection determined: ${actualType.toUpperCase()}`);
      console.log(`────────────────────────────────────────────────────────────\n`);
    }

    const { packages } = this.buildWorkspace();
    const current = this.ensureAllSameVersion(packages);
    const next = this.semverBump(current, actualType);

    // Create set for quick internal package lookup
    const internalNames = new Set(packages.map(p => p.name));

    // Update version in all packages and their internal dependencies
    for (const p of packages) {
      const pkg = p.data;
      pkg.version = next;

      // Update internal dependency versions
      for (const field of DEP_FIELDS) {
        const deps = pkg[field];
        if (!deps) continue;

        for (const [dep, range] of Object.entries(deps)) {
          if (!internalNames.has(dep)) continue;
          if (typeof range !== 'string') continue;
          // Update internal dependency version while preserving range operator
          deps[dep] = this.preserveOperator(range, next);
        }
      }

      writeJSON(p.pkgPath, pkg);
      console.log(`✔ ${p.name} -> ${next}`);
    }

    // Update root package.json version if it exists
    const rootPkgPath = path.join(this.config.root, 'package.json');
    if (exists(rootPkgPath)) {
      const rootPkg = readJSON(rootPkgPath);
      if (rootPkg.version) {
        rootPkg.version = next;
        writeJSON(rootPkgPath, rootPkg);
        console.log(`✔ root -> ${next}`);
      }
    }

    // Perform git operations unless explicitly skipped
    if (!noGitCommit) {
      execSync(`git add .`, { stdio: 'inherit' });
      const commitMessage = `chore(release): v${next}${skipCi ? ' [skip ci]' : ''}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
      execSync(`git tag v${next}`, { stdio: 'inherit' });

      console.log(`\nAll packages bumped to v${next} and tagged.`);
    } else {
      console.log(`\nAll packages bumped to v${next}. Git commit and tag skipped.`);
    }
  }

  /**
   * Publishes all packages in dependency order with branch-prefixed dist-tags
   * @param options - Publishing options including access, dry run, tag, and git push
   */
  async publish(options: PublishOptions): Promise<void> {
    const { access = 'public', dry = false, tag, gitPush = false } = options;

    if (!tag) {
      throw new Error('--tag parameter is required for publish command');
    }

    const { packages, graph } = this.buildWorkspace();
    const order = this.topoSort(packages, graph); // Ensure dependencies publish first
    console.log('Publish order:', order.join(' -> '));

    // Create branch-prefixed dist-tag (except for 'latest')
    const currentBranch = git('rev-parse --abbrev-ref HEAD');
    const finalTag = tag === 'latest' ? 'latest' : `${currentBranch}-${tag}`;

    console.log(`Publishing with dist-tag: ${finalTag}`);
    if (tag !== 'latest') {
      console.log(`Branch: ${currentBranch}, Original tag: ${tag}`);
    }

    console.log(`Using package manager: ${this.config.packageManager}`);

    // Publish each package in dependency order
    for (const name of order) {
      const p = packages.find(x => x.name === name);
      if (!p) {
        throw new Error(`Package ${name} not found in workspace`);
      }

      // Build publish command arguments
      const args: string[] = [];
      args.push('--access', access);
      args.push('--tag', finalTag);

      // Generate appropriate publish command for package manager
      let cmd: string;
      if (this.config.packageManager === 'pnpm') {
        cmd = `pnpm publish ${args.join(' ')} ${dry ? '--dry-run' : ''}`;
      } else if (this.config.packageManager === 'yarn') {
        // Yarn uses npm publish under the hood
        cmd = `npm publish ${args.join(' ')} ${dry ? '--dry-run' : ''}`;
      } else {
        // Default to npm
        cmd = `npm publish ${args.join(' ')} ${dry ? '--dry-run' : ''}`;
      }

      execSync(cmd, { cwd: p.dir, stdio: 'inherit' });
    }

    // Push git changes and tags if requested (and not in dry run)
    if (gitPush && !dry) {
      console.log('\nPushing git changes and tags...');
      execSync('git push --follow-tags', { stdio: 'inherit' });
      console.log('✔ Git changes and tags pushed to remote');
    }
  }
}
