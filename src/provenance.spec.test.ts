/**
 * Specification tests for npm provenance support.
 *
 * These derive from the provenance behavior contract and are written before the
 * implementation exists. If a test here disagrees with the implementation, the
 * implementation is wrong — not the test.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep.js';
import {
    buildPublishCommand,
    detectSupportedCI,
    planProvenance,
    provenanceLogLine
} from './provenance.js';
import type { WorkspacePackage } from './types.js';

/**
 * Builds a minimal WorkspacePackage fixture for provenance planning.
 * `provenance` seeds publishConfig.provenance; `repository` seeds the repository field.
 */
function pkg(
    name: string,
    opts: { provenance?: boolean; repository?: string } = {}
): WorkspacePackage {
    const data: WorkspacePackage['data'] = { name, version: '1.0.0' };
    if (opts.provenance !== undefined) data.publishConfig = { provenance: opts.provenance };
    if (opts.repository !== undefined) data.repository = opts.repository;
    return { dir: `/repo/packages/${name}`, pkgPath: `/repo/packages/${name}/package.json`, name, version: '1.0.0', data };
}

const REPO = 'git+https://github.com/TrueSoftwareNL/lockstep.git';

describe('buildPublishCommand', () => {
    it('should build the baseline npm command without provenance when provenance is off', () => {
        // The no-provenance command must be unchanged: no --provenance, no --dry-run.
        expect(buildPublishCommand('npm', { access: 'public', tag: 'latest', provenance: false, dry: false })).toBe(
            'npm publish --access public --tag latest'
        );
    });

    it('should use pnpm and include --provenance for the pnpm manager', () => {
        const cmd = buildPublishCommand('pnpm', { access: 'public', tag: 'latest', provenance: true, dry: false });
        expect(cmd.startsWith('pnpm publish')).toBe(true);
        expect(cmd).toContain('--provenance');
    });

    it('should use npm publish and include --provenance for the npm manager', () => {
        const cmd = buildPublishCommand('npm', { access: 'public', tag: 'latest', provenance: true, dry: false });
        expect(cmd.startsWith('npm publish')).toBe(true);
        expect(cmd).toContain('--provenance');
    });

    it('should use npm publish for the yarn manager (yarn publishes via npm)', () => {
        const cmd = buildPublishCommand('yarn', { access: 'public', tag: 'latest', provenance: true, dry: false });
        expect(cmd.startsWith('npm publish')).toBe(true);
        expect(cmd).toContain('--provenance');
    });

    it('should include both --provenance and --dry-run on a provenance dry run', () => {
        const cmd = buildPublishCommand('npm', { access: 'public', tag: 'latest', provenance: true, dry: true });
        expect(cmd).toContain('--provenance');
        expect(cmd).toContain('--dry-run');
    });
});

describe('detectSupportedCI', () => {
    it('should detect GitHub Actions', () => {
        expect(detectSupportedCI({ GITHUB_ACTIONS: 'true' })).toEqual({ supported: true, provider: 'github' });
    });

    it('should detect GitLab CI', () => {
        expect(detectSupportedCI({ GITLAB_CI: 'true' })).toEqual({ supported: true, provider: 'gitlab' });
    });

    it('should report unsupported when no CI signal is present', () => {
        expect(detectSupportedCI({})).toEqual({ supported: false, provider: null });
    });

    it('should require the literal "true" and reject other values', () => {
        expect(detectSupportedCI({ GITHUB_ACTIONS: 'false' })).toEqual({ supported: false, provider: null });
    });
});

describe('planProvenance', () => {
    it('should enable provenance for all packages when the flag is set in supported CI', () => {
        const plan = planProvenance([pkg('a', { repository: REPO }), pkg('b', { repository: REPO })], {
            flag: true,
            env: { GITHUB_ACTIONS: 'true' }
        });
        expect(plan.effective).toBe(true);
        expect([...plan.enabledPackages].sort()).toEqual(['a', 'b']);
        expect(plan.missingRepository).toEqual([]);
    });

    it('should skip provenance with a reason when requested outside supported CI', () => {
        const plan = planProvenance([pkg('a', { repository: REPO })], { flag: true, env: {} });
        expect(plan.requested).toBe(true);
        expect(plan.effective).toBe(false);
        expect(plan.enabledPackages.size).toBe(0);
        expect(plan.skippedReason).toMatch(/GitHub Actions/);
        expect(plan.skippedReason).toMatch(/GitLab/);
    });

    it('should list provenance-enabled packages missing a repository field', () => {
        const plan = planProvenance([pkg('a', { repository: REPO }), pkg('b')], {
            flag: true,
            env: { GITHUB_ACTIONS: 'true' }
        });
        expect(plan.effective).toBe(true);
        expect(plan.missingRepository).toEqual(['b']);
    });

    it('should enable provenance only for packages opting in via publishConfig when no flag is set', () => {
        const plan = planProvenance([pkg('a', { provenance: true, repository: REPO }), pkg('b')], {
            flag: false,
            env: { GITHUB_ACTIONS: 'true' }
        });
        expect(plan.requested).toBe(true);
        expect(plan.effective).toBe(true);
        expect([...plan.enabledPackages]).toEqual(['a']);
    });

    it('should not validate the repository field of packages that publish without provenance', () => {
        // pkgB lacks a repository but is not provenance-enabled, so it must not fail the preflight.
        const plan = planProvenance([pkg('a', { provenance: true, repository: REPO }), pkg('b')], {
            flag: false,
            env: { GITHUB_ACTIONS: 'true' }
        });
        expect(plan.missingRepository).toEqual([]);
    });

    it('should not request provenance when neither the flag nor any publishConfig opts in', () => {
        const plan = planProvenance([pkg('a'), pkg('b')], { flag: false, env: { GITHUB_ACTIONS: 'true' } });
        expect(plan.requested).toBe(false);
        expect(plan.effective).toBe(false);
        expect(plan.enabledPackages.size).toBe(0);
    });
});

describe('provenanceLogLine', () => {
    it('should report ON with the provider when provenance is effective', () => {
        const plan = planProvenance([pkg('a', { repository: REPO })], { flag: true, env: { GITHUB_ACTIONS: 'true' } });
        expect(provenanceLogLine(plan)).toBe('Provenance: ON (github)');
    });

    it('should report SKIPPED with the reason when requested but not effective', () => {
        const plan = planProvenance([pkg('a', { repository: REPO })], { flag: true, env: {} });
        const line = provenanceLogLine(plan);
        expect(line).toMatch(/^Provenance: SKIPPED — /);
    });

    it('should return null when provenance was not requested', () => {
        const plan = planProvenance([pkg('a', { repository: REPO })], { flag: false, env: { GITHUB_ACTIONS: 'true' } });
        expect(provenanceLogLine(plan)).toBeNull();
    });

    it('should never leak a secret token into the log line or the publish command', () => {
        const secret = 'npm_SECRETTOKEN_should_not_leak';
        const plan = planProvenance([pkg('a', { repository: REPO })], {
            flag: true,
            env: { GITHUB_ACTIONS: 'true', NODE_AUTH_TOKEN: secret }
        });
        expect(provenanceLogLine(plan)).not.toContain(secret);
        expect(buildPublishCommand('npm', { access: 'public', tag: 'latest', provenance: true, dry: false })).not.toContain(secret);
    });
});

describe('publish provenance preflight', () => {
    it('should abort before publishing when a provenance-enabled package lacks a repository field', async () => {
        // A fixture workspace: one package with a repository, one without. In a supported CI with
        // --provenance, the publish must fail during the preflight — before any package is published.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-prov-'));
        fs.mkdirSync(path.join(dir, 'packages/a'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'packages/b'), { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'packages/a/package.json'),
            JSON.stringify({ name: 'a', version: '1.0.0', repository: REPO })
        );
        fs.writeFileSync(
            path.join(dir, 'packages/b/package.json'),
            JSON.stringify({ name: 'b', version: '1.0.0' })
        );

        const previous = process.env.GITHUB_ACTIONS;
        process.env.GITHUB_ACTIONS = 'true';
        try {
            const lockstep = new Lockstep({ root: dir });
            await expect(lockstep.publish({ tag: 'latest', provenance: true, dry: true })).rejects.toThrow(
                /"repository" field/
            );
        } finally {
            if (previous === undefined) delete process.env.GITHUB_ACTIONS;
            else process.env.GITHUB_ACTIONS = previous;
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
