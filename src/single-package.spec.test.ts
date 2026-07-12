/**
 * Specification tests for single-package repository support.
 *
 * lockstep is primarily a monorepo tool, but a repository whose only `package.json` lives at the
 * root (source under `src/`, no `packages/` directory) must still be manageable so its version and
 * changelog can be produced. These tests derive from that requirement over a real temp git fixture.
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

/** A single-package repo: one root package.json, source in src/, no packages/ directory. */
function makeSinglePackageRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-single-'));
    dirs.push(dir);
    git(dir, 'init -q');
    git(dir, 'config user.email t@e.com');
    git(dir, 'config user.name T');
    git(dir, 'config commit.gpgsign false');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'solo', version: '1.0.0' }));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src/index.ts'), 'export const x = 1;\n');
    git(dir, 'add -A');
    git(dir, 'commit -q -m "chore: init"');
    git(dir, 'tag v1.0.0');
    fs.writeFileSync(path.join(dir, 'src/index.ts'), 'export const x = 2;\n');
    git(dir, 'add -A');
    git(dir, 'commit -q -m "fix: bump x"');
    return dir;
}

describe('single-package repository support', () => {
    it('should discover the root package when there is no packages/ directory', () => {
        const dir = makeSinglePackageRepo();
        const { packages } = new Lockstep({ root: dir }).buildWorkspace();
        expect(packages.map((p) => p.name)).toEqual(['solo']);
    });

    it('should version-bump and tag the root package', async () => {
        const dir = makeSinglePackageRepo();
        await new Lockstep({ root: dir }).version({ type: 'patch', noChangelog: true });
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        expect(pkg.version).toBe('1.0.1');
        expect(execSync('git tag', { cwd: dir }).toString()).toContain('v1.0.1');
    });

    it('should write a root CHANGELOG.md for the single package', async () => {
        const dir = makeSinglePackageRepo();
        const prevO = process.env.OPENAI_API_KEY;
        const prevA = process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        try {
            await new Lockstep({ root: dir }).changelog();
            expect(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')).toContain('Version bump');
        } finally {
            if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO;
            if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA;
        }
    });
});
