/**
 * Type definitions for the Lockstep versioning tool
 * 
 * @author TrueSoftware B.V.
 * @license MIT
 */

/**
 * Standard package.json structure with required and optional fields
 */
export interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  /** Source repository. npm matches this against the build origin when attaching provenance. */
  repository?: string | { type?: string; url?: string; directory?: string };
  /** npm publish overrides; `provenance` opts an individual package into attestation. */
  publishConfig?: { provenance?: boolean; access?: string };
  [key: string]: any;
}

/**
 * Represents a workspace package with its metadata and file paths
 */
export interface WorkspacePackage {
  /** Absolute path to the package directory */
  dir: string;
  /** Absolute path to the package.json file */
  pkgPath: string;
  /** Package name from package.json */
  name: string;
  /** Current version from package.json */
  version: string;
  /** Full package.json data */
  data: PackageJson;
}

/**
 * Complete workspace information including dependency graph
 */
export interface WorkspaceInfo {
  /** Array of all workspace packages */
  packages: WorkspacePackage[];
  /** Map for quick package lookup by name */
  byName: Map<string, WorkspacePackage>;
  /** Dependency graph: package -> dependents (for topological sorting) */
  graph: Map<string, string[]>;
}

/**
 * Options for the publish command
 */
export interface PublishOptions {
  /** NPM access level (public/restricted) */
  access?: string;
  /** Whether to perform a dry run */
  dry?: boolean;
  /** Distribution tag for publishing */
  tag: string;
  /** Whether to push git changes after publish */
  gitPush?: boolean;
  /** Enable npm provenance attestation (requires a supported CI environment) */
  provenance?: boolean;
}

/**
 * Options for the version command
 */
export interface VersionOptions {
  /** Type of version bump */
  type: BumpType;
  /** Whether to add [skip ci] to commit message */
  skipCi?: boolean;
  /** Whether to skip git operations entirely */
  noGitCommit?: boolean;
  /** Whether to skip AI changelog generation during the version bump */
  noChangelog?: boolean;
}

/**
 * Parsed CLI options from command line arguments
 */
export interface CliOptions {
  [key: string]: string | boolean;
}

/**
 * Configuration options for lockstep behavior
 */
export interface LockstepConfig {
  /** Root directory of the monorepo */
  root?: string;
  /** Directories to search for packages */
  packagesDirs?: string[];
  /** Default package manager to use */
  packageManager?: PackageManager;
}

/** Semantic version bump types */
export type BumpType = 'patch' | 'minor' | 'major' | 'auto';

/** Package.json dependency field names */
export type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

/** Supported package managers */
export type PackageManager = 'npm' | 'yarn' | 'pnpm';

/** CLI command types */
export type Command = 'version' | 'publish' | 'help';
