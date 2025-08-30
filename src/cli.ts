#!/usr/bin/env node

/**
 * CLI interface for the Lockstep versioning tool
 * 
 * @author TrueSoftware B.V.
 * @license MIT
 */

import { Lockstep } from './lockstep.js';
import type { BumpType, CliOptions } from './types.js';

// ============================================================================
// CLI PARSING FUNCTIONS
// ============================================================================

/**
 * Parses command line arguments into a key-value object
 * @param args - Array of command line arguments
 * @returns Parsed options object
 */
function parseCliOptions(args: string[]): CliOptions {
  return Object.fromEntries(
    args.reduce<Array<[string, string | boolean]>>((acc, x, i, arr) => {
      if (x.startsWith('--')) {
        const key = x.replace(/^--/, '');
        const nextArg = arr[i + 1];
        const value = nextArg && !nextArg.startsWith('--') ? nextArg : true;
        acc.push([key, value]);
      }
      return acc;
    }, [])
  );
}

/**
 * Displays help information
 */
function showHelp(): void {
  console.log(`@blendsdk/lockstep - Monorepo Lockstep Versioning Tool

USAGE:
  lockstep <command> [options]

COMMANDS:
  version --type <patch|minor|major|auto> [options]
    Bump versions of all packages in lockstep
    
  publish --tag <dist-tag> [options]
    Publish all packages in dependency order
    
  help
    Show this help message

VERSION OPTIONS:
  --type <patch|minor|major|auto>  Type of version bump (required)
  --ci                             Add [skip ci] to commit message
  --no-git-commit                  Skip git commit and tag operations

PUBLISH OPTIONS:
  --tag <dist-tag>                 Distribution tag for publishing (required)
  --access <public|restricted>     NPM access level (default: public)
  --dry                            Perform a dry run without publishing
  --git-push                       Push git changes and tags after publish

EXAMPLES:
  lockstep version --type patch
  lockstep version --type minor --ci
  lockstep version --type major --no-git-commit
  lockstep version --type auto
  lockstep version --type auto --ci
  
  lockstep publish --tag latest
  lockstep publish --tag alpha
  lockstep publish --tag beta --dry
  lockstep publish --tag latest --access restricted
  lockstep publish --tag alpha --git-push

NOTES:
  • --type auto analyzes conventional commits to determine version bump:
    - feat: commits → minor version bump
    - fix:, docs:, style:, refactor:, test:, chore: → patch version bump
    - BREAKING CHANGE or !: → major version bump
  
  • Branch-based dist-tags: Non-main branches get prefixed with branch name
    Example: 'alpha' on 'feature-branch' becomes 'feature-branch-alpha'
  
  • Package manager detection: Automatically detects npm, yarn, or pnpm
  
  • Lockstep versioning: All packages maintain the same version number

For more information, visit: https://github.com/TrueSoftwareNL/lockstep
`);
}

/**
 * Displays version information
 */
function showVersion(): void {
  // This will be replaced during build with actual version
  console.log('1.0.0');
}

// ============================================================================
// MAIN CLI FUNCTION
// ============================================================================

/**
 * Main CLI entry point - handles command routing and argument parsing
 */
async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const opts = parseCliOptions(rest);

  // Handle help and version commands
  if (!cmd || cmd === 'help' || opts.help) {
    showHelp();
    return;
  }

  if (cmd === 'version' && (opts.version || opts.v)) {
    showVersion();
    return;
  }

  try {
    const lockstep = new Lockstep();

    if (cmd === 'version') {
      // Handle version command
      const type = String(opts.type || 'patch') as BumpType;
      if (!['patch', 'minor', 'major', 'auto'].includes(type)) {
        throw new Error('--type must be patch|minor|major|auto');
      }

      // Skip version bump if no changes since last tag
      if (!lockstep.changedSinceLastTag()) {
        console.log('No changes since last tag; skipping version bump.');
        process.exit(0);
      }

      const skipCi = Boolean(opts.ci);
      const noGitCommit = Boolean(opts['no-git-commit']);
      
      await lockstep.version({ type, skipCi, noGitCommit });
      
    } else if (cmd === 'publish') {
      // Handle publish command
      const access = opts.access === true ? 'public' : String(opts.access || 'public');
      const dry = Boolean(opts.dry);
      const tag = opts.tag === true ? '' : String(opts.tag || '');
      const gitPush = Boolean(opts['git-push']);

      if (!tag) {
        throw new Error('--tag parameter is required for publish command');
      }

      await lockstep.publish({ access, dry, tag, gitPush });
      
    } else {
      console.error(`Unknown command: ${cmd}`);
      console.error('Run "lockstep help" for usage information.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

/**
 * Execute the CLI when this file is run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
