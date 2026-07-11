/**
 * Specification tests for changelog orchestration (Lockstep.changelog).
 *
 * Written before the implementation exists. Uses a real temp git repo and a stubbed provider seam
 * (no network, no SDK, no API keys used for real calls).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Lockstep } from '../lockstep.js';
import { LLMProvider } from './llm-provider.js';
import type { LLMResult } from './types.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function git(dir: string, cmd: string): void {
    execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

/** A git repo with packages a and b, tagged v1.0.0, then a feat commit changing package a. */
function makeRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-orch-'));
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

/** Provider that returns a fixed result without any real call. */
class StubProvider extends LLMProvider {
    constructor(private result: LLMResult | null) {
        super({ openaiModel: 'm', anthropicModel: 'm', openaiApiKey: 'stub' });
    }
    override async generate(): Promise<LLMResult | null> {
        return this.result;
    }
}

/** Lockstep whose changelog provider is replaced by a stub. */
class StubLockstep extends Lockstep {
    constructor(root: string, private stub: LLMProvider) {
        super({ root });
    }
    protected override createChangelogProvider(): LLMProvider {
        return this.stub;
    }
}

const aiResult: LLMResult = { content: '### Added\n- shiny AI feature', provider: 'openai', model: 'm', tokensUsed: { input: 1, output: 1 } };

describe('Lockstep.changelog', () => {
    it('should write per-package CHANGELOG.md and a root RELEASE_NOTES.md from provider content', async () => {
        const dir = makeRepo();
        await new StubLockstep(dir, new StubProvider(aiResult)).changelog();
        expect(fs.readFileSync(path.join(dir, 'packages/a/CHANGELOG.md'), 'utf8')).toContain('shiny AI feature');
        expect(fs.existsSync(path.join(dir, 'RELEASE_NOTES.md'))).toBe(true);
        // Package b did not change → no changelog written.
        expect(fs.existsSync(path.join(dir, 'packages/b/CHANGELOG.md'))).toBe(false);
    });

    it('should write no files in dry-run mode', async () => {
        const dir = makeRepo();
        await new StubLockstep(dir, new StubProvider(aiResult)).changelog({ dryRun: true });
        expect(fs.existsSync(path.join(dir, 'packages/a/CHANGELOG.md'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'RELEASE_NOTES.md'))).toBe(false);
    });

    it('should write fallback entries when no provider is available', async () => {
        const dir = makeRepo();
        const prevO = process.env.OPENAI_API_KEY;
        const prevA = process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        try {
            await new Lockstep({ root: dir }).changelog();
            expect(fs.readFileSync(path.join(dir, 'packages/a/CHANGELOG.md'), 'utf8')).toContain('Version bump');
        } finally {
            if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO;
            if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA;
        }
    });

    it('should never leak an API key into generated files', async () => {
        const dir = makeRepo();
        const secret = 'sk-SENTINEL-should-not-leak';
        const prev = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = secret;
        try {
            await new StubLockstep(dir, new StubProvider(aiResult)).changelog();
            expect(fs.readFileSync(path.join(dir, 'packages/a/CHANGELOG.md'), 'utf8')).not.toContain(secret);
            expect(fs.readFileSync(path.join(dir, 'RELEASE_NOTES.md'), 'utf8')).not.toContain(secret);
        } finally {
            if (prev === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = prev;
        }
    });
});

/** Lockstep whose changelog step always throws, to prove version() tolerates it. */
class ThrowingChangelogLockstep extends Lockstep {
    changelogCalled = false;
    override async changelog(): Promise<void> {
        this.changelogCalled = true;
        throw new Error('changelog boom');
    }
}

describe('version() with a failing changelog', () => {
    it('should complete the version bump, commit and tag even if changelog generation throws', async () => {
        const dir = makeRepo();
        const ls = new ThrowingChangelogLockstep({ root: dir });
        await ls.version({ type: 'patch' });

        expect(ls.changelogCalled).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'packages/a/package.json'), 'utf8'));
        expect(pkg.version).toBe('1.0.1');
        expect(execSync('git tag', { cwd: dir }).toString()).toContain('v1.0.1');
    });
});
