# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-30

### Added

- Initial release of @blendsdk/lockstep
- Lockstep versioning for monorepo packages
- Automatic version detection from conventional commits
- Branch-based dist-tag publishing
- Support for npm, yarn, and pnpm package managers
- Dependency-aware publishing with topological sorting
- CI/CD integration with skip CI and git push options
- Comprehensive TypeScript support
- CLI interface with help and version commands
- Programmatic API for Node.js integration
- GitHub Actions workflow examples
- Complete documentation and usage guides

### Features

- **Version Command**: Bump all package versions in lockstep
  - `--type patch|minor|major|auto` - Version bump type
  - `--ci` - Add [skip ci] to commit message
  - `--no-git-commit` - Skip git operations
  
- **Publish Command**: Publish packages in dependency order
  - `--tag <dist-tag>` - Distribution tag
  - `--access public|restricted` - NPM access level
  - `--dry` - Dry run mode
  - `--git-push` - Push git changes after publish

- **Automatic Version Detection**: Analyze conventional commits
  - `feat:` → minor version bump
  - `fix:`, `docs:`, etc. → patch version bump
  - `BREAKING CHANGE` → major version bump

- **Branch-Based Publishing**: Automatic dist-tag prefixing
  - Main branches → `latest` or specified tag
  - Feature branches → `{branch-name}-{tag}`

- **Package Manager Detection**: Auto-detect npm/yarn/pnpm
- **Workspace Discovery**: Recursive package.json detection
- **Dependency Graph**: Topological sorting for publish order
- **Git Integration**: Commit, tag, and push automation

[1.0.0]: https://github.com/TrueSoftwareNL/lockstep/releases/tag/v1.0.0
