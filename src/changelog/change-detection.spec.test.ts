/**
 * Specification tests for changelog change detection.
 *
 * Written before the implementation exists. If a test here disagrees with the implementation,
 * the implementation is wrong — not the test. Uses a real temporary git repository (no mocks).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    attributeCommitToPackages,
    buildPackageChangeSummary,
    getCommitsSinceRef,
    getLastReleaseRef,
    parseConventionalCommit
} from './change-detection.js';
import type { ParsedCommit } from './types.js';
import type { WorkspacePackage } from '../types.js';

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Runs a git command in a directory. */
function git(dir: string, cmd: string): void {
    execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

/** Writes a package.json for a package under packages/<name>. */
function writePkg(dir: string, name: string, extra: Record<string, unknown> = {}): void {
    const pdir = path.join(dir, 'packages', name);
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...extra }));
}

/** Creates a fresh git repo with two packages and an initial tagged commit. */
function makeRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-cl-'));
    tempDirs.push(dir);
    git(dir, 'init -q');
    git(dir, 'config user.email test@example.com');
    git(dir, 'config user.name Test');
    git(dir, 'config commit.gpgsign false');
    writePkg(dir, 'a');
    writePkg(dir, 'b');
    git(dir, 'add -A');
    git(dir, 'commit -q -m "chore: init"');
    git(dir, 'tag v1.0.0');
    return dir;
}

/** Builds a WorkspacePackage fixture rooted at dir. */
function pkg(dir: string, name: string): WorkspacePackage {
    const pdir = path.join(dir, 'packages', name);
    return { dir: pdir, pkgPath: path.join(pdir, 'package.json'), name, version: '1.0.0', data: { name, version: '1.0.0' } };
}

describe('parseConventionalCommit', () => {
    it('should parse type, scope and subject', () => {
        expect(parseConventionalCommit('feat(pkg): add x')).toEqual({ type: 'feat', scope: 'pkg', subject: 'add x' });
    });
    it('should parse a scopeless commit', () => {
        expect(parseConventionalCommit('fix: typo')).toEqual({ type: 'fix', scope: '', subject: 'typo' });
    });
    it('should parse a breaking-bang commit', () => {
        expect(parseConventionalCommit('feat!: breaking')).toEqual({ type: 'feat', scope: '', subject: 'breaking' });
    });
    it('should treat a non-conventional subject as plain', () => {
        expect(parseConventionalCommit('just a message')).toEqual({ type: '', scope: '', subject: 'just a message' });
    });
});

describe('attributeCommitToPackages', () => {
    it('should attribute by matching scope', () => {
        const dir = '/repo';
        const commit: ParsedCommit = { hash: 'h', type: 'fix', scope: 'a', subject: 's', body: '', files: [] };
        expect(attributeCommitToPackages(commit, [pkg(dir, 'a'), pkg(dir, 'b')], dir)).toEqual(['a']);
    });
    it('should attribute by changed files when there is no matching scope', () => {
        const dir = '/repo';
        const commit: ParsedCommit = {
            hash: 'h', type: '', scope: '', subject: 's', body: '',
            files: ['packages/a/src/x.ts', 'packages/b/src/y.ts']
        };
        expect(attributeCommitToPackages(commit, [pkg(dir, 'a'), pkg(dir, 'b')], dir).sort()).toEqual(['a', 'b']);
    });
});

describe('getLastReleaseRef', () => {
    it('should return the most recent tag', () => {
        const dir = makeRepo();
        expect(getLastReleaseRef(dir)).toBe('v1.0.0');
    });
    it('should bootstrap to the first commit when there are no tags', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-cl-'));
        tempDirs.push(dir);
        git(dir, 'init -q');
        git(dir, 'config user.email test@example.com');
        git(dir, 'config user.name Test');
        git(dir, 'config commit.gpgsign false');
        writePkg(dir, 'a');
        git(dir, 'add -A');
        git(dir, 'commit -q -m "chore: init"');
        const first = execSync('git rev-list --max-parents=0 HEAD', { cwd: dir }).toString().trim();
        expect(getLastReleaseRef(dir)).toBe(first);
    });
});

describe('getCommitsSinceRef', () => {
    it('should capture the commit body so BREAKING CHANGE footers are visible', () => {
        const dir = makeRepo();
        fs.writeFileSync(path.join(dir, 'packages/a/src.ts'), 'export const x = 1;\n');
        git(dir, 'add -A');
        git(dir, 'commit -q -m "feat(a): add feature" -m "BREAKING CHANGE: drops old API"');
        const commits = getCommitsSinceRef('v1.0.0', dir);
        expect(commits.length).toBe(1);
        expect(commits[0]!.type).toBe('feat');
        expect(commits[0]!.body).toContain('BREAKING CHANGE');
    });
});

describe('buildPackageChangeSummary', () => {
    it('should summarize only packages that changed', () => {
        const dir = makeRepo();
        fs.writeFileSync(path.join(dir, 'packages/a/src.ts'), 'export const x = 1;\n');
        git(dir, 'add -A');
        git(dir, 'commit -q -m "feat(a): add feature"');
        const summaries = buildPackageChangeSummary(dir, [pkg(dir, 'a'), pkg(dir, 'b')]);
        const names = summaries.map(s => s.packageName);
        expect(names).toContain('a');
        expect(names).not.toContain('b');
    });
});
