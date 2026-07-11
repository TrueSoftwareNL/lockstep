# Change Detection: AI Changelog

> **Document**: 03-01-change-detection.md
> **Parent**: [Index](00-index.md)

## Overview

Owns `src/changelog/change-detection.ts` and the shared `src/changelog/types.ts`. Pure/deterministic
git-driven logic that turns "everything since the last release" into per-package change summaries.
Environment is git state; functions take the repo root and the discovered packages as arguments (no
hardcoded `packages/` path or `@scope/`), so they are testable against a fixture repo.

## Implementation Details

### New Types (`src/changelog/types.ts`)

```typescript
export interface ParsedCommit {
  hash: string;      // short hash
  type: string;      // conventional type (feat, fix, …) or "" if not conventional
  scope: string;     // conventional scope or ""
  subject: string;   // cleaned subject line
  body: string;      // full body (may be "") — captured so BREAKING CHANGE footers are visible
  files: string[];   // repo-relative files changed in this commit
}

export interface PackageChangeSummary {
  packageName: string;   // full name from package.json (e.g. "@scope/pkg")
  shortName: string;     // unscoped name / directory basename used for matching
  packageDir: string;    // absolute package directory
  packagePath: string;   // repo-relative package directory (for display)
  commits: ParsedCommit[];
  changedFiles: string[];
}

export interface ChangelogOptions {
  dryRun?: boolean;
  verbose?: boolean;
}
```

### New Functions (`src/changelog/change-detection.ts`)

```typescript
/** Resolves the last release ref: the most recent vX.Y.Z tag, else the repo's first commit. */
export function getLastReleaseRef(): string;

/** Repo-relative files changed between ref and HEAD (git diff --name-only). */
export function getChangedFiles(lastRef: string): string[];

/** Parses a conventional-commit subject into { type, scope, subject }; non-conventional → type/scope "". */
export function parseConventionalCommit(subject: string): { type: string; scope: string; subject: string };

/** All commits since ref, parsed with hash/subject/body and per-commit changed files. */
export function getCommitsSinceRef(lastRef: string): ParsedCommit[];

/**
 * Attributes a commit to package short-names. If the commit's scope equals a package's directory
 * basename or unscoped name, it is attributed there; otherwise it is attributed by which packages
 * its changed files fall under. (No hardcoded cross-package scope list.)
 */
export function attributeCommitToPackages(commit: ParsedCommit, packages: WorkspacePackage[], root: string): string[];

/** Builds per-package change summaries; only packages with commits OR changed files are included. */
export function buildPackageChangeSummary(root: string, packages: WorkspacePackage[]): PackageChangeSummary[];
```

### Base ref & commit reading

`getLastReleaseRef` reuses lockstep's existing scheme: `git describe --tags --abbrev=0`; on failure
(no tags), `git rev-list --max-parents=0 HEAD` (first commit). Commits are read with
`git log <ref>..HEAD --pretty=<hash SEP subject SEP body END>` using improbable separators, then
parsed with `^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$`. Per-commit files come from
`git diff-tree --no-commit-id --name-only -r <hash>`. Because the body is captured, `BREAKING CHANGE:`
footers are visible (fixing the subject-only gap in `determineVersionType`).

### Attribution (generic — AR PA-3)

A package's match keys are `path.basename(pkg.dir)` and the unscoped package name
(`pkg.name.split("/").pop()`). Rule: if `commit.scope` matches a key of a discovered package →
attribute to that package. Otherwise, for each changed file, find the package whose repo-relative
`dir` prefixes the file path, and attribute to those. A commit may map to several packages.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| No tags in the repo | Bootstrap to the first commit as the base ref | RD-01 AR #10 |
| `git log` / `diff-tree` fails | Return an empty list for that step; a package with no commits/files is omitted | RD-01 AR #9 |
| Non-conventional commit subject | `type`/`scope` = ""; the full subject is used as-is | RD-01 §attribution |
| Commit touches no discovered package | Attributed to no package (dropped from summaries) | RD-01 AR #11 |

> **Traceability:** references the registers. See `00-ambiguity-register.md` and
> `../../requirements/00-ambiguity-register.md`.

## Testing Requirements
- Unit tests over a temp fixture git repo: base-ref resolution (with/without tags), conventional
  parsing (incl. body/BREAKING footer), scope-vs-file attribution, and summary assembly.
