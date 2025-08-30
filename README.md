# @blendsdk/lockstep

A comprehensive monorepo package management tool that maintains synchronized versions across all packages (lockstep versioning) with flexible CI/CD integration.

## Features

- **Lockstep Versioning**: All packages maintain the same version number
- **Dependency-Aware Publishing**: Uses topological sorting to publish dependencies first
- **Branch-Based Dist-Tags**: Automatic prefixing based on git branch
- **Conventional Commits**: Automatic version detection from commit messages
- **CI Integration**: Skip CI loops and flexible git operations
- **Package Manager Detection**: Works with npm, yarn, and pnpm
- **TypeScript Support**: Full type definitions included

## Installation

### Global Installation (Recommended)

```bash
npm install -g @blendsdk/lockstep
# or
yarn global add @blendsdk/lockstep
# or
pnpm add -g @blendsdk/lockstep
```

### Local Installation

```bash
npm install --save-dev @blendsdk/lockstep
# or
yarn add -D @blendsdk/lockstep
# or
pnpm add -D @blendsdk/lockstep
```

## Quick Start

### Basic Usage

```bash
# Bump patch version for all packages
lockstep version --type patch

# Automatically determine version from conventional commits
lockstep version --type auto

# Publish all packages to latest
lockstep publish --tag latest

# Publish to next tag (for development releases)
lockstep publish --tag next
```

### CI/CD Integration

```bash
# Version with CI skip flag
lockstep version --type auto --ci

# Publish and push git changes
lockstep publish --tag latest --git-push
```

## Commands

### Version Command

Bumps versions of all packages in lockstep and optionally commits/tags.

```bash
lockstep version --type <patch|minor|major|auto> [options]
```

**Options:**
- `--type <patch|minor|major|auto>` - Type of version bump (required)
- `--ci` - Add [skip ci] to commit message
- `--no-git-commit` - Skip git commit and tag operations

**Examples:**
```bash
lockstep version --type patch
lockstep version --type minor --ci
lockstep version --type major --no-git-commit
lockstep version --type auto
lockstep version --type auto --ci
```

### Publish Command

Publishes all packages in dependency order with branch-prefixed dist-tags.

```bash
lockstep publish --tag <dist-tag> [options]
```

**Options:**
- `--tag <dist-tag>` - Distribution tag for publishing (required)
- `--access <public|restricted>` - NPM access level (default: public)
- `--dry` - Perform a dry run without publishing
- `--git-push` - Push git changes and tags after publish

**Examples:**
```bash
lockstep publish --tag latest
lockstep publish --tag alpha
lockstep publish --tag beta --dry
lockstep publish --tag latest --access restricted
lockstep publish --tag alpha --git-push
```

## Automatic Version Detection

When using `--type auto`, lockstep analyzes conventional commit messages since the last tag:

- `feat:` commits → **minor** version bump
- `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:` → **patch** version bump
- `BREAKING CHANGE` or `!:` → **major** version bump

```bash
# Analyzes commits and determines appropriate version bump
lockstep version --type auto
```

## Branch-Based Publishing

Non-main branches automatically get prefixed dist-tags:

- Main branches (`main`, `master`) → `latest` or specified tag
- Feature branches → `{branch-name}-{tag}`

```bash
# On main branch
lockstep publish --tag latest    # → publishes as "latest"

# On feature-branch
lockstep publish --tag alpha     # → publishes as "feature-branch-alpha"
```

## Configuration

Lockstep works out of the box but can be configured for specific needs:

### Package Manager Detection

Automatically detects your package manager:
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn  
- `package-lock.json` → npm
- Default → npm

### Workspace Structure

By default, searches for packages in:
- `packages/` directory (recursively)

Supports any monorepo structure with `package.json` files.

## Programmatic API

You can also use lockstep programmatically in Node.js:

```typescript
import { Lockstep } from '@blendsdk/lockstep';

const lockstep = new Lockstep({
  root: process.cwd(),
  packagesDirs: ['packages'],
  packageManager: 'yarn'
});

// Version all packages
await lockstep.version({
  type: 'auto',
  skipCi: true,
  noGitCommit: false
});

// Publish all packages
await lockstep.publish({
  tag: 'latest',
  access: 'public',
  dry: false,
  gitPush: true
});
```

## GitHub Actions Integration

Example workflow for automated releases:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm install -g @blendsdk/lockstep

      - name: Version packages
        run: lockstep version --type auto --ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish packages
        run: lockstep publish --tag latest --git-push
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Why Lockstep Versioning?

Lockstep versioning is ideal for:

- **Tightly coupled packages** that form a cohesive ecosystem
- **Enterprise internal tools** where consistency is paramount
- **Frequent breaking changes** that affect multiple packages
- **Simplified dependency management** and user experience

For a detailed analysis of when to use lockstep versioning, see our [comprehensive guide](./docs/lockstep-guide.md).

## Requirements

- Node.js 18.0.0 or higher
- Git repository with commit history
- Monorepo with `package.json` files

## License

MIT © [TrueSoftware B.V.](https://truesoftware.nl)

## Contributing

Contributions are welcome! Please read our [contributing guidelines](./CONTRIBUTING.md) first.

## Support

- [GitHub Issues](https://github.com/TrueSoftwareNL/lockstep/issues)
- [Documentation](https://github.com/TrueSoftwareNL/lockstep#readme)
- [Examples](./examples/)

---

Made with ❤️ by [TrueSoftware B.V.](https://truesoftware.nl)
