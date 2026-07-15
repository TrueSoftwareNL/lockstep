# LockStep

A comprehensive monorepo package management tool that maintains synchronized versions across all packages (lockstep versioning) with flexible CI/CD integration.

## Features

- **Lockstep Versioning**: All packages maintain the same version number
- **Drift Recovery**: `sync` realigns packages that fell out of lockstep to the highest version found
- **Dependency-Aware Publishing**: Uses topological sorting to publish dependencies first
- **Branch-Based Dist-Tags**: Automatic prefixing based on git branch
- **Conventional Commits**: Automatic version detection from commit messages
- **AI Changelog & Release Notes**: LLM-drafted per-package `CHANGELOG.md` and root `RELEASE_NOTES.md`
- **npm Provenance**: Signed, verifiable build attestations from supported CI
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

# Realign packages that drifted out of lockstep to the highest version
lockstep sync

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
- `--no-changelog` - Skip AI changelog generation during the bump

**Examples:**
```bash
lockstep version --type patch
lockstep version --type minor --ci
lockstep version --type major --no-git-commit
lockstep version --type auto
lockstep version --type auto --ci
lockstep version --type patch --no-changelog
```

By default a version bump also generates changelog and release-notes files and folds them into the
release commit. See [AI Changelog & Release Notes](#ai-changelog--release-notes) below.

### Sync Command

Realigns packages that have drifted out of lockstep by setting every package — and its internal
dependency ranges — to the **highest** version found across the workspace. This is the recovery
path for when `version`, `changelog`, or `publish` fail because the packages no longer share a
single version.

```bash
lockstep sync [options]
```

Unlike `version`, `sync` mints no new version and touches no git state: it rewrites `package.json`
files only, leaving the commit and tag to you. When the workspace is already uniform it reports so
and changes nothing. The highest version is chosen by numeric semver precedence, so `1.10.0`
correctly wins over `1.9.0`.

**Options:**
- `--dry-run` - Print which packages would change; write nothing

**Examples:**
```bash
lockstep sync
lockstep sync --dry-run
```

### Changelog Command

Generates a per-package `CHANGELOG.md` and a root `RELEASE_NOTES.md` for the current release,
without bumping any versions. Useful for previewing notes or regenerating them on demand.

```bash
lockstep changelog [options]
```

**Options:**
- `--dry-run` - Print what would be generated; write nothing
- `--verbose` - Print detailed progress and token usage

**Examples:**
```bash
lockstep changelog
lockstep changelog --dry-run
lockstep changelog --verbose
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
- `--provenance` - Generate npm provenance attestations (requires supported CI)

**Examples:**
```bash
lockstep publish --tag latest
lockstep publish --tag alpha
lockstep publish --tag beta --dry
lockstep publish --tag latest --access restricted
lockstep publish --tag alpha --git-push
lockstep publish --tag latest --provenance
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

## AI Changelog & Release Notes

Lockstep can write your changelog for you. It inspects the conventional commits since the last
release tag, attributes each commit to the package(s) it touched, and asks an LLM to draft the
entries — producing a [Keep a Changelog](https://keepachangelog.com/)-style `CHANGELOG.md` per
package plus a reader-friendly `RELEASE_NOTES.md` at the repo root.

Generation runs automatically during `lockstep version` (opt out with `--no-changelog`), or on
demand via `lockstep changelog`.

### Providers and configuration

The SDKs are **optional dependencies** — install whichever provider you use:

```bash
npm install openai            # OpenAI (primary)
npm install @anthropic-ai/sdk # Anthropic (fallback)
```

Configure via environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Enables the OpenAI provider (tried first) | — |
| `ANTHROPIC_API_KEY` | Enables the Anthropic provider (fallback) | — |
| `LOCKSTEP_OPENAI_MODEL` | Override the OpenAI model | `gpt-4o-mini` |
| `LOCKSTEP_ANTHROPIC_MODEL` | Override the Anthropic model | `claude-haiku-4-5-20251001` |

OpenAI is tried first; if it is unavailable or errors, Anthropic is used.

### Never blocks a release

Changelog generation is best-effort and is designed to never stop a release:

- **No API key / SDK not installed** → deterministic fallback entries are written (a plain
  version-bump note), and the release continues.
- **Provider error** → the same fallback path is taken.
- **A `version`-triggered failure** degrades to a warning; the bump, commit, and tag still complete.

### Privacy

Only commit **metadata** is sent to the LLM — commit subjects/types, scopes, and changed file
**paths** (capped). File **contents** and diffs are never transmitted, and API keys are never
logged or written to any generated file.

## npm Provenance

[npm provenance](https://docs.npmjs.com/generating-provenance-statements) attaches a signed,
publicly verifiable record linking each published package to the source commit and CI build that
produced it. Enable it with `--provenance`:

```bash
lockstep publish --tag latest --provenance
```

Provenance is opt-in and has requirements enforced by npm:

- **Supported CI only.** It works exclusively from GitHub Actions or GitLab CI on a cloud-hosted
  runner. Outside a supported CI, lockstep prints a warning and publishes **without** provenance
  rather than failing — a local `--provenance` never blocks the publish.
- **`repository` field required.** Every package that publishes with provenance must declare a
  `repository` field in its `package.json`. Lockstep validates this **before** publishing anything
  and aborts the whole run if a provenance-enabled package is missing it, so a partial publish can't
  strand the monorepo.
- **OIDC permission.** In GitHub Actions the job needs `permissions: id-token: write`.

A single package can also opt in via `"publishConfig": { "provenance": true }` in its
`package.json`, independent of the flag.

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

// Realign drifted packages to the highest version found (rewrites package.json only)
await lockstep.syncVersions({ dryRun: false });

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
      id-token: write   # required for npm provenance
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
        run: lockstep publish --tag latest --git-push --provenance
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
