/**
 * Implementation tests for npm provenance — edge cases and internal behavior.
 */

import { describe, expect, it } from 'vitest';
import { buildPublishCommand, detectSupportedCI, planProvenance } from './provenance.js';
import type { WorkspacePackage } from './types.js';

function pkg(
    name: string,
    opts: { provenance?: boolean; repository?: string } = {}
): WorkspacePackage {
    const data: WorkspacePackage['data'] = { name, version: '1.0.0' };
    if (opts.provenance !== undefined) data.publishConfig = { provenance: opts.provenance };
    if (opts.repository !== undefined) data.repository = opts.repository;
    return { dir: `/repo/packages/${name}`, pkgPath: `/repo/packages/${name}/package.json`, name, version: '1.0.0', data };
}

describe('planProvenance (edge cases)', () => {
    it('should treat an empty publish set as no request', () => {
        const plan = planProvenance([], { flag: true, env: { GITHUB_ACTIONS: 'true' } });
        expect(plan.requested).toBe(false);
        expect(plan.effective).toBe(false);
        expect(plan.enabledPackages.size).toBe(0);
        expect(plan.missingRepository).toEqual([]);
    });

    it('should treat publishConfig.provenance:false as opted out', () => {
        const plan = planProvenance([pkg('a', { provenance: false, repository: 'x' })], {
            flag: false,
            env: { GITHUB_ACTIONS: 'true' }
        });
        expect(plan.requested).toBe(false);
        expect(plan.enabledPackages.size).toBe(0);
    });
});

describe('detectSupportedCI (precedence)', () => {
    it('should prefer GitHub when both GitHub and GitLab signals are set', () => {
        expect(detectSupportedCI({ GITHUB_ACTIONS: 'true', GITLAB_CI: 'true' })).toEqual({
            supported: true,
            provider: 'github'
        });
    });
});

describe('buildPublishCommand (passthrough)', () => {
    it('should pass the access level through unchanged', () => {
        expect(buildPublishCommand('npm', { access: 'restricted', tag: 'next', provenance: false, dry: false })).toBe(
            'npm publish --access restricted --tag next'
        );
    });

    it('should append --dry-run without --provenance on a plain dry run', () => {
        const cmd = buildPublishCommand('npm', { access: 'public', tag: 'latest', provenance: false, dry: true });
        expect(cmd).toContain('--dry-run');
        expect(cmd).not.toContain('--provenance');
    });
});

describe('buildPublishCommand (baseline without provenance)', () => {
    // Without provenance the publish behavior is unchanged: pnpm uses its own CLI; npm and yarn
    // publish via npm; dry runs add --dry-run — and never a --provenance token.
    it('should match the expected non-provenance command per manager', () => {
        const opts = { access: 'public', tag: 'latest', provenance: false, dry: false } as const;
        expect(buildPublishCommand('npm', opts)).toBe('npm publish --access public --tag latest');
        expect(buildPublishCommand('pnpm', opts)).toBe('pnpm publish --access public --tag latest');
        expect(buildPublishCommand('yarn', opts)).toBe('npm publish --access public --tag latest');
        expect(buildPublishCommand('npm', { ...opts, dry: true })).toBe(
            'npm publish --access public --tag latest --dry-run'
        );
    });
});
