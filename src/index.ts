/**
 * Main entry point for the Lockstep versioning tool
 * 
 * @author TrueSoftware B.V.
 * @license MIT
 */

export { Lockstep } from './lockstep.js';
export type {
  PackageJson,
  WorkspacePackage,
  WorkspaceInfo,
  PublishOptions,
  VersionOptions,
  CliOptions,
  LockstepConfig,
  BumpType,
  DependencyField,
  PackageManager,
  Command
} from './types.js';
