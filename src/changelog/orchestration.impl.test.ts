/**
 * Implementation tests for changelog orchestration with the optional SDKs absent.
 *
 * These run against the REAL provider (no stubbed call seam) so the dynamic import genuinely fails
 * — the SDKs are declared as optional dependencies and are not installed in this environment. That
 * proves the release path degrades to deterministic fallback entries instead of throwing, and that
 * `version()` still completes its bump/commit/tag.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Lockstep } from '../lockstep.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function git(dir: string, cmd: string): void {
    execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

/** A git repo with packages a and b, tagged v1.0.0, then a feat commit changing package a. */
function makeRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-orch-impl-'));
    dirs.push(dir);
    git(dir, 'init -q');
    git(dir, 'config user.email t@e.com');
    git(dir, 'config user.name T');
    git(dir, 'config commit.gpgsign false');
    for (const name of ['a', 'b']) {
        fs.mkdirSync(path.join(dir, 'packages', name), { recursive: true });
        fs.writeFileSync(path.join(dir, 'packages', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    }
    git(dir, 'add -A');
    git(dir, 'commit -q -m "chore: init"');
    git(dir, 'tag v1.0.0');
    fs.writeFileSync(path.join(dir, 'packages/a/index.ts'), 'export const x = 1;\n');
    git(dir, 'add -A');
    git(dir, 'commit -q -m "feat(a): add feature"');
    return dir;
}

/** Runs `fn` with only OPENAI_API_KEY set to a placeholder, restoring the environment afterward. */
async function withKeyButNoSdk(fn: () => Promise<void>): Promise<void> {
    const prevO = process.env.OPENAI_API_KEY;
    const prevA = process.env.ANTHROPIC_API_KEY;
    // A key is present, so the provider *attempts* a call; the SDK import is what fails.
    process.env.OPENAI_API_KEY = 'sk-placeholder-never-used';
    delete process.env.ANTHROPIC_API_KEY;
    try {
        await fn();
    } finally {
        if (prevO === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prevO;
        if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA;
    }
}

describe('changelog() with the SDKs absent (real provider)', () => {
    it('should write fallback entries when the provider SDK cannot be imported', async () => {
        const dir = makeRepo();
        await withKeyButNoSdk(async () => {
            await new Lockstep({ root: dir }).changelog();
        });
        // The dynamic import failed, generate() returned null, and the writer emitted the fallback.
        const changelog = fs.readFileSync(path.join(dir, 'packages/a/CHANGELOG.md'), 'utf8');
        expect(changelog).toContain('Version bump to 1.0.0');
        expect(fs.existsSync(path.join(dir, 'RELEASE_NOTES.md'))).toBe(true);
    });
});

describe('version() with the SDKs absent (real provider)', () => {
    it('should complete the bump, commit and tag even though changelog generation falls back', async () => {
        const dir = makeRepo();
        await withKeyButNoSdk(async () => {
            await new Lockstep({ root: dir }).version({ type: 'patch' });
        });

        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'packages/a/package.json'), 'utf8'));
        expect(pkg.version).toBe('1.0.1');
        expect(execSync('git tag', { cwd: dir }).toString()).toContain('v1.0.1');
        // The changelog step ran inside version() and produced fallback content, not an error.
        expect(fs.readFileSync(path.join(dir, 'packages/a/CHANGELOG.md'), 'utf8')).toContain('Version bump');
    });
});
