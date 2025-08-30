# Lockstep Versioning: A Unified Approach to Monorepo Package Management

## Introduction

In the world of modern software development, monorepos have become increasingly popular for managing multiple related packages within a single repository. However, with this architectural choice comes the challenge of version management: How do you coordinate releases across dozens of interdependent packages? How do you ensure consistency while maintaining development velocity?

Enter **lockstep versioning** – a versioning strategy where all packages in a monorepo share the same version number and are released together as a cohesive unit. This article explores what lockstep versioning is, the problems it solves, when to use it, and importantly, when not to use it.

## What is Lockstep Versioning?

Lockstep versioning is a monorepo management strategy where:

- **All packages maintain identical version numbers** (e.g., all packages are at v4.2.1)
- **Packages are released together** as a coordinated unit
- **Version bumps affect all packages** regardless of individual changes
- **Dependencies between internal packages** use the same version

Think of it as treating your entire monorepo as a single, distributed product rather than a collection of independent packages.

### Example Structure

```
my-monorepo/
├── packages/
│   ├── core/           # v4.2.1
│   ├── ui/             # v4.2.1
│   ├── utils/          # v4.2.1
│   └── cli/            # v4.2.1
└── package.json        # v4.2.1
```

When you release, **all** packages move to v4.2.2 together, even if only one package had changes.

## The Problems Lockstep Versioning Solves

### 1. **Dependency Hell Prevention**

**The Problem:** In independent versioning, Package A might depend on Package B v2.1.0, while Package C depends on Package B v2.3.0. Users installing both A and C face version conflicts.

**Lockstep Solution:** All packages use the same version, eliminating version conflicts between internal dependencies.

```json
// Package A's dependencies
{
  "@myorg/package-b": "^4.2.1"
}

// Package C's dependencies  
{
  "@myorg/package-b": "^4.2.1"  // Same version!
}
```

### 2. **Simplified Release Coordination**

**The Problem:** Coordinating releases across multiple packages is complex. Which packages need updates? What order should they be released in? How do you handle circular dependencies?

**Lockstep Solution:** One command releases everything. No coordination needed.

```bash
# Instead of managing individual package releases
npm publish packages/core
npm publish packages/utils  
npm publish packages/ui
npm publish packages/cli

# Just one command
yarn lockstep:version:auto && yarn lockstep:publish:latest
```

### 3. **Consistent User Experience**

**The Problem:** Users struggle to understand which versions of different packages work together. Documentation becomes a nightmare of compatibility matrices.

**Lockstep Solution:** Simple rule: "Use the same version for all our packages."

```bash
# Clear and simple for users
npm install @myorg/core@4.2.1 @myorg/ui@4.2.1 @myorg/utils@4.2.1

# Instead of complex compatibility research
npm install @myorg/core@3.1.2 @myorg/ui@2.8.1 @myorg/utils@4.0.3  # Which versions work together?
```

### 4. **Reduced Testing Complexity**

**The Problem:** With independent versioning, you need to test every possible combination of package versions that users might install.

**Lockstep Solution:** Only one combination to test – the current lockstep version.

### 5. **Simplified CI/CD Pipelines**

**The Problem:** Complex release pipelines that need to determine which packages changed, calculate appropriate version bumps, and handle interdependencies.

**Lockstep Solution:** Uniform process for all packages with automatic dependency resolution.

## When Lockstep Versioning Excels

### 1. **Tightly Coupled Ecosystems**

Perfect for packages that form a cohesive system:

- **UI Component Libraries** (React components, themes, utilities)
- **Development Frameworks** (core, CLI, plugins, templates)
- **API SDKs** (client, auth, utilities, types)
- **Build Tools** (compiler, bundler, plugins, loaders)

**Example:** A React UI library where components, themes, and utilities are designed to work together.

### 2. **Enterprise Internal Tools**

Ideal for internal company packages where:

- **Consistency is paramount** over individual package optimization
- **Teams need predictable dependencies** across projects
- **Release coordination overhead** is more costly than occasional unnecessary releases

### 3. **Breaking Changes Are Frequent**

When your packages frequently introduce breaking changes that affect multiple packages:

- **API redesigns** that ripple across the ecosystem
- **Architectural changes** that require coordinated updates
- **Security updates** that need immediate, synchronized deployment

### 4. **Small to Medium Package Count**

Works best with **5-50 packages**. Large enough to benefit from coordination, small enough to avoid excessive overhead.

## What Lockstep Versioning Doesn't Solve

### 1. **Individual Package Optimization**

**Limitation:** Packages that rarely change still get version bumps, potentially confusing users about what actually changed.

**Impact:** Package A gets bumped from v4.2.1 to v4.2.2 even though only Package B had changes.

### 2. **Semantic Versioning Precision**

**Limitation:** A patch fix in one package might coincide with a major breaking change in another, making the overall version bump ambiguous.

**Impact:** Is v4.2.1 → v5.0.0 a major change for Package A? Users can't tell from the version alone.

### 3. **Storage and Bandwidth Efficiency**

**Limitation:** Users might install packages they don't need, or download updates for unchanged packages.

**Impact:** Larger bundle sizes and more frequent updates than necessary.

### 4. **Independent Package Lifecycles**

**Limitation:** Can't deprecate, archive, or dramatically change individual packages without affecting the entire ecosystem.

**Impact:** Legacy packages keep getting version bumps indefinitely.

## When NOT to Use Lockstep Versioning

### 1. **Loosely Coupled Packages**

Avoid lockstep for packages that:

- **Serve different domains** (e.g., database tools + UI components)
- **Have different audiences** (e.g., developer tools + end-user applications)
- **Evolve independently** with minimal cross-dependencies

### 2. **Large Package Collections**

With **50+ packages**, lockstep becomes unwieldy:

- **Release noise** becomes overwhelming
- **Coordination overhead** outweighs benefits
- **User confusion** about what actually changed

### 3. **Stable, Mature Packages**

For packages that:

- **Rarely change** (utilities, polyfills)
- **Have reached API stability** 
- **Serve as foundational dependencies** for external projects

### 4. **Public Open Source Libraries**

When packages are consumed independently by external users who:

- **Need granular control** over which packages to update
- **Have different update cadences** for different packages
- **Want to minimize dependency bloat**

## Implementation Best Practices

### 1. **Automated Version Detection**

Use conventional commits to automatically determine version bumps:

```bash
# Analyzes commit messages since last tag
yarn lockstep:version:auto

# Examples:
# feat: new feature     → minor bump
# fix: bug fix         → patch bump  
# BREAKING CHANGE:     → major bump
```

### 2. **Branch-Based Development**

Use branch prefixes for development releases:

```bash
# Main branch → latest tag
yarn lockstep:publish:latest

# Feature branch → prefixed tag
yarn lockstep:publish:next  # → "feature-branch-next"
```

### 3. **GitHub Actions Integration**

A complete CI/CD pipeline that handles quality checks, testing, and automated releases:

```yaml
name: Build & Test & Release

on:
  push:
    branches: ['*']
  pull_request:
    branches: ['*']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality_check:
    name: Quality Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Lint
        run: yarn lint

      - name: Type check
        run: yarn type-check

  build_and_test:
    name: Build & Test
    runs-on: ubuntu-latest
    needs: [quality_check]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Build all packages
        run: yarn build

      - name: Run tests
        run: yarn test

  release:
    name: Release
    runs-on: ubuntu-latest
    needs: [build_and_test]
    if: github.event_name == 'push'  # Only on push, not PRs
    permissions:
      contents: write
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Needed for git history analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Build packages
        run: yarn build

      # Main branches: Auto-version and publish to latest
      - name: Version packages (main branches)
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        run: yarn lockstep:version:auto
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to latest
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        run: yarn lockstep:publish:latest
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Feature branches: Publish to next tag (no versioning)
      - name: Publish to next tag
        if: github.ref != 'refs/heads/main' && github.ref != 'refs/heads/master'
        run: yarn lockstep:publish:next
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Key Features of this Pipeline:**

- **Quality Gates**: Linting and type checking before builds
- **Parallel Jobs**: Quality checks run independently of builds
- **Branch-Specific Logic**: Main branches get versioned and published to `latest`, feature branches publish to `next`
- **Git History Access**: `fetch-depth: 0` enables conventional commit analysis
- **Secure Publishing**: Uses GitHub and NPM tokens for authentication
- **Concurrency Control**: Prevents multiple workflows from interfering

**Required Secrets:**
- `NPM_TOKEN`: NPM authentication token for publishing
- `GITHUB_TOKEN`: Automatically provided by GitHub for git operations

**Package.json Scripts:**
```json
{
  "scripts": {
    "lockstep:version:auto": "tsx scripts/lockstep.ts version --type auto --ci",
    "lockstep:publish:latest": "tsx scripts/lockstep.ts publish --tag latest --git-push",
    "lockstep:publish:next": "tsx scripts/lockstep.ts publish --tag next --git-push"
  }
}
```

### 4. **Comprehensive Testing**

Test the entire ecosystem as a unit:

```yaml
# CI Pipeline
- name: Test All Packages
  run: yarn test  # Tests entire monorepo together

- name: Integration Tests  
  run: yarn test:integration  # Cross-package functionality
```

### 5. **Clear Documentation**

Document what changes in each release:

```markdown
## v4.2.1

### @myorg/core
- Fixed memory leak in event handling

### @myorg/ui  
- No changes (version bump for consistency)

### @myorg/utils
- Added new string formatting utilities
```

## Real-World Examples

### Success Stories

1. **Babel** - Uses lockstep versioning for its plugin ecosystem
2. **Jest** - Coordinates releases across core, CLI, and plugins
3. **Lerna** - Ironically, uses lockstep for its own packages
4. **Angular** - Uses lockstep for framework packages

### When They Switched Away

1. **React** - Moved to independent versioning as packages matured
2. **Webpack** - Split into independent packages for different use cases

## Conclusion

Lockstep versioning is a powerful tool for managing tightly coupled monorepo packages, but it's not a universal solution. It excels when:

- **Packages form a cohesive ecosystem**
- **Consistency trumps individual optimization**
- **Release coordination is complex**
- **Breaking changes are frequent**

However, it struggles with:

- **Loosely coupled packages**
- **Large package collections**
- **Mature, stable packages**
- **Independent consumption patterns**

The key is understanding your specific use case. If your packages are designed to work together as a unified system, lockstep versioning can dramatically simplify your development and release process. If your packages serve different purposes or audiences, independent versioning might be more appropriate.

Remember: the best versioning strategy is the one that reduces friction for both maintainers and users while maintaining the reliability and predictability your project needs.

---

*This article was written based on real-world experience implementing lockstep versioning for the BlendSDK monorepo, which manages 15+ tightly coupled packages for web application development.*
