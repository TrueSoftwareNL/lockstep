/**
 * Specification tests for the `sync` command — version-drift reconciliation.
 *
 * lockstep requires every package to share one version; the moment they drift, `version`,
 * `changelog`, and `publish` all fail. `sync` is the recovery path: it finds the highest version
 * present and realigns every package (and its internal dependency ranges) to it, rewriting
 * package.json files only — no git commit, tag, or changelog. These tests derive from that
 * contract over real temp git fixtures.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function git(dir: string, cmd: string): void {
    execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

/**
 * A two-package monorepo (`@scope/a`, `@scope/b` where b depends on a) plus a private aggregator
 * root, each at the caller-chosen version, committed once so git side effects are observable.
 */
function makeDriftedMonorepo(versions: { root?: string; a: string; b: string }): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-sync-'));
    dirs.push(dir);
    git(dir, 'init -q');
    git(dir, 'config user.email t@e.com');
    git(dir, 'config user.name T');
    git(dir, 'config commit.gpgsign false');

    fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'root', version: versions.root ?? '1.0.0', private: true }, null, 2)
    );
    fs.mkdirSync(path.join(dir, 'packages', 'a'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'packages', 'a', 'package.json'),
        JSON.stringify({ name: '@scope/a', version: versions.a }, null, 2)
    );
    fs.mkdirSync(path.join(dir, 'packages', 'b'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'packages', 'b', 'package.json'),
        JSON.stringify({ name: '@scope/b', version: versions.b, dependencies: { '@scope/a': `^${versions.a}` } }, null, 2)
    );

    git(dir, 'add -A');
    git(dir, 'commit -q -m "chore: init"');
    return dir;
}

/** Reads a package.json relative to the repo root (use '.' for the root package). */
function readPkg(dir: string, rel: string): any {
    return JSON.parse(fs.readFileSync(path.join(dir, rel, 'package.json'), 'utf8'));
}

function readVersion(dir: string, rel: string): string {
    return readPkg(dir, rel).version;
}

/** A comparable snapshot of every version and the internal dependency range in the fixture. */
function snapshotVersions(dir: string): Record<string, string> {
    return {
        root: readVersion(dir, '.'),
        a: readVersion(dir, 'packages/a'),
        b: readVersion(dir, 'packages/b'),
        bDependsOnA: readPkg(dir, 'packages/b').dependencies['@scope/a']
    };
}

describe('sync command — version reconciliation', () => {
    // Drifted packages must all move up to the highest version present.
    it('should set all packages to the highest version when versions have drifted', async () => {
        const dir = makeDriftedMonorepo({ a: '1.0.0', b: '1.2.0' });
        await new Lockstep({ root: dir }).syncVersions();
        expect(readVersion(dir, 'packages/a')).toBe('1.2.0');
        expect(readVersion(dir, 'packages/b')).toBe('1.2.0');
    });

    // "Highest" is decided by numeric semver precedence, not lexical order: 1.10.0 is newer than
    // 1.9.0 even though the string "1.10.0" sorts before "1.9.0".
    it('should pick the highest version by numeric precedence, not string order', async () => {
        const dir = makeDriftedMonorepo({ a: '1.9.0', b: '1.10.0' });
        await new Lockstep({ root: dir }).syncVersions();
        expect(readVersion(dir, 'packages/a')).toBe('1.10.0');
        expect(readVersion(dir, 'packages/b')).toBe('1.10.0');
    });

    // Internal cross-dependency ranges follow the synced version, keeping their range operator.
    it('should update internal dependency ranges to the highest version, preserving operators', async () => {
        const dir = makeDriftedMonorepo({ a: '1.0.0', b: '1.2.0' });
        await new Lockstep({ root: dir }).syncVersions();
        expect(readPkg(dir, 'packages/b').dependencies['@scope/a']).toBe('^1.2.0');
    });

    // The workspace-root package.json is kept in step even though it is not part of `packages`.
    it('should update the root package.json to the highest version', async () => {
        const dir = makeDriftedMonorepo({ root: '1.0.0', a: '1.0.0', b: '1.2.0' });
        await new Lockstep({ root: dir }).syncVersions();
        expect(readVersion(dir, '.')).toBe('1.2.0');
    });

    // Even when every package already agrees, a lagging aggregator root is brought up to match.
    it('should bring a lagging root up when all packages already agree', async () => {
        const dir = makeDriftedMonorepo({ root: '1.0.0', a: '1.2.0', b: '1.2.0' });
        await new Lockstep({ root: dir }).syncVersions();
        expect(readVersion(dir, '.')).toBe('1.2.0');
    });

    // An already-uniform workspace is a no-op: nothing on disk changes.
    it('should leave files unchanged when all packages already share a version', async () => {
        const dir = makeDriftedMonorepo({ root: '2.0.0', a: '2.0.0', b: '2.0.0' });
        const before = snapshotVersions(dir);
        await new Lockstep({ root: dir }).syncVersions();
        expect(snapshotVersions(dir)).toEqual(before);
    });

    // sync rewrites files only; it must never create a commit or a tag.
    it('should not create any git commit or tag (files-only)', async () => {
        const dir = makeDriftedMonorepo({ a: '1.0.0', b: '1.2.0' });
        const commitsBefore = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();

        await new Lockstep({ root: dir }).syncVersions();

        const commitsAfter = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
        expect(commitsAfter).toBe(commitsBefore);
        expect(execSync('git tag', { cwd: dir }).toString().trim()).toBe('');
        // The edits live in the working tree, proving sync wrote the files but did not commit them.
        expect(execSync('git status --porcelain', { cwd: dir }).toString()).toContain('package.json');
    });

    // dry-run previews the change set without touching any file.
    it('should write nothing in dry-run mode', async () => {
        const dir = makeDriftedMonorepo({ a: '1.0.0', b: '1.2.0' });
        await new Lockstep({ root: dir }).syncVersions({ dryRun: true });
        expect(readVersion(dir, 'packages/a')).toBe('1.0.0');
        expect(readVersion(dir, 'packages/b')).toBe('1.2.0');
    });

    // A non-semver version anywhere is a hard error, never a silent mis-sort.
    it('should throw when a package has a non-semver version', async () => {
        const dir = makeDriftedMonorepo({ a: 'not-a-version', b: '1.2.0' });
        await expect(new Lockstep({ root: dir }).syncVersions()).rejects.toThrow('Not a semver version');
    });
});
