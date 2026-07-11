/**
 * Package change detection for the AI changelog generator.
 *
 * Turns "everything since the last release tag" into per-package change summaries: it resolves the
 * base ref, reads and parses the conventional commits (body included), and attributes each commit to
 * packages by conventional-commit scope or by the files it touched. All git-reading functions accept
 * the repository directory so they can be exercised against a fixture repo.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import type { ParsedCommit, PackageChangeSummary } from './types.js';
import type { WorkspacePackage } from '../types.js';

/** Field/record separators chosen to be improbable in commit messages. */
const FIELD_SEP = '<<--LS-CL-FIELD-->>';
const RECORD_SEP = '<<--LS-CL-RECORD-->>';

/**
 * Runs a git command in a directory and returns its trimmed output.
 * @param cmd - The git subcommand (without the `git` prefix)
 * @param cwd - Directory to run in
 * @returns Trimmed stdout
 */
function runGit(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

/**
 * Resolves the last release ref: the most recent annotated/lightweight tag, else the repository's
 * first commit (bootstrap for a repo with no tags yet).
 * @param cwd - Repository directory (defaults to the current working directory)
 * @returns A tag name or commit hash to diff against
 *
 * @example
 * getLastReleaseRef(repoDir); // → "v1.2.0"  (or the first-commit hash if untagged)
 */
export function getLastReleaseRef(cwd: string = process.cwd()): string {
    try {
        const tag = runGit('describe --tags --abbrev=0', cwd);
        if (tag) return tag;
    } catch {
        // No tags — fall through to bootstrap.
    }
    return runGit('rev-list --max-parents=0 HEAD', cwd).split('\n')[0]!.trim();
}

/**
 * Lists repo-relative files changed between a ref and HEAD.
 * @param lastRef - The base ref
 * @param cwd - Repository directory
 * @returns Repo-relative file paths (empty on failure)
 */
export function getChangedFiles(lastRef: string, cwd: string = process.cwd()): string[] {
    try {
        const out = runGit(`diff --name-only ${lastRef}..HEAD`, cwd);
        return out.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    } catch {
        return [];
    }
}

/** Conventional-commit subject pattern: `type(scope)?!?: subject`. */
const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;

/**
 * Parses a conventional-commit subject line. A non-conventional subject yields empty type/scope and
 * the full subject.
 * @param subject - The commit subject line
 * @returns The parsed type, scope, and cleaned subject
 *
 * @example
 * parseConventionalCommit("feat(api): add x"); // → { type: "feat", scope: "api", subject: "add x" }
 */
export function parseConventionalCommit(subject: string): { type: string; scope: string; subject: string } {
    const m = subject.match(CONVENTIONAL_RE);
    if (!m) return { type: '', scope: '', subject: subject.trim() };
    return { type: m[1]!, scope: m[2] ?? '', subject: m[3]!.trim() };
}

/**
 * Reads and parses all commits since a ref, capturing hash, subject, body, and the files each
 * commit changed.
 * @param lastRef - The base ref
 * @param cwd - Repository directory
 * @returns Parsed commits, newest first (empty on failure)
 */
export function getCommitsSinceRef(lastRef: string, cwd: string = process.cwd()): ParsedCommit[] {
    let raw: string;
    try {
        const format = `%h${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`;
        raw = runGit(`log ${lastRef}..HEAD --pretty=format:"${format}"`, cwd);
    } catch {
        return [];
    }
    if (!raw) return [];

    const commits: ParsedCommit[] = [];
    for (const record of raw.split(RECORD_SEP)) {
        const parts = record.trim().split(FIELD_SEP);
        if (parts.length < 2) continue;
        const hash = parts[0]!.trim();
        const parsed = parseConventionalCommit(parts[1]!.trim());
        const body = (parts[2] ?? '').trim();

        let files: string[] = [];
        try {
            files = runGit(`diff-tree --no-commit-id --name-only -r ${hash}`, cwd)
                .split('\n').map(f => f.trim()).filter(f => f.length > 0);
        } catch {
            // Leave files empty if the diff-tree read fails.
        }

        commits.push({ hash, type: parsed.type, scope: parsed.scope, subject: parsed.subject, body, files });
    }
    return commits;
}

/** The scope-match keys for a package: its directory basename and its unscoped name. */
function matchKeys(pkg: WorkspacePackage): string[] {
    return [path.basename(pkg.dir), pkg.name.split('/').pop() ?? pkg.name];
}

/** Repo-relative directory of a package, with forward slashes. */
function relDir(pkg: WorkspacePackage, root: string): string {
    return path.relative(root, pkg.dir).split(path.sep).join('/');
}

/**
 * Attributes a commit to package names. If the commit's scope matches a package's directory basename
 * or unscoped name, it is attributed there; otherwise it is attributed by which packages its changed
 * files fall under. A commit may map to several packages.
 * @param commit - The parsed commit
 * @param packages - The discovered workspace packages
 * @param root - Repository root (to relativize file paths)
 * @returns The full names of the packages this commit belongs to
 */
export function attributeCommitToPackages(commit: ParsedCommit, packages: WorkspacePackage[], root: string): string[] {
    if (commit.scope) {
        const scoped = packages.filter(p => matchKeys(p).includes(commit.scope));
        if (scoped.length > 0) return scoped.map(p => p.name);
    }
    const matched = new Set<string>();
    for (const p of packages) {
        const prefix = relDir(p, root) + '/';
        if (commit.files.some(f => f.startsWith(prefix))) matched.add(p.name);
    }
    return [...matched];
}

/**
 * Builds per-package change summaries since the last release. Only packages with attributed commits
 * or changed files are included; summaries are sorted by package name for deterministic output.
 * @param root - Repository root
 * @param packages - The discovered workspace packages
 * @returns One summary per changed package
 */
export function buildPackageChangeSummary(root: string, packages: WorkspacePackage[]): PackageChangeSummary[] {
    const lastRef = getLastReleaseRef(root);
    const changedFiles = getChangedFiles(lastRef, root);
    const commits = getCommitsSinceRef(lastRef, root);

    const byName = new Map(packages.map(p => [p.name, { commits: [] as ParsedCommit[], files: [] as string[] }]));

    for (const commit of commits) {
        for (const name of attributeCommitToPackages(commit, packages, root)) {
            byName.get(name)?.commits.push(commit);
        }
    }
    for (const file of changedFiles) {
        for (const p of packages) {
            if (file.startsWith(relDir(p, root) + '/')) byName.get(p.name)!.files.push(file);
        }
    }

    const summaries: PackageChangeSummary[] = [];
    for (const p of packages) {
        const entry = byName.get(p.name)!;
        if (entry.commits.length === 0 && entry.files.length === 0) continue;
        summaries.push({
            packageName: p.name,
            shortName: path.basename(p.dir),
            packageDir: p.dir,
            packagePath: relDir(p, root),
            commits: entry.commits,
            changedFiles: entry.files
        });
    }
    summaries.sort((a, b) => a.packageName.localeCompare(b.packageName));
    return summaries;
}
