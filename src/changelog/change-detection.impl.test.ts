/**
 * Implementation tests for changelog change detection — edge cases and internals.
 */

import { describe, expect, it } from 'vitest';
import { attributeCommitToPackages } from './change-detection.js';
import type { ParsedCommit } from './types.js';
import type { WorkspacePackage } from '../types.js';

function pkg(name: string, dirName: string): WorkspacePackage {
    const dir = `/repo/packages/${dirName}`;
    return { dir, pkgPath: `${dir}/package.json`, name, version: '1.0.0', data: { name, version: '1.0.0' } };
}

function commit(over: Partial<ParsedCommit>): ParsedCommit {
    return { hash: 'h', type: '', scope: '', subject: 's', body: '', files: [], ...over };
}

describe('attributeCommitToPackages (edge cases)', () => {
    it('should match a scope against the unscoped name of a scoped package', () => {
        const pkgs = [pkg('@acme/a', 'a')];
        expect(attributeCommitToPackages(commit({ scope: 'a' }), pkgs, '/repo')).toEqual(['@acme/a']);
    });

    it('should match a scope against the directory basename', () => {
        const pkgs = [pkg('@acme/widget', 'widget-pkg')];
        expect(attributeCommitToPackages(commit({ scope: 'widget-pkg' }), pkgs, '/repo')).toEqual(['@acme/widget']);
    });

    it('should attribute to nothing when a commit touches no package', () => {
        const pkgs = [pkg('a', 'a')];
        expect(attributeCommitToPackages(commit({ files: ['README.md', 'scripts/x.ts'] }), pkgs, '/repo')).toEqual([]);
    });

    it('should fall back to file attribution when the scope matches no package', () => {
        const pkgs = [pkg('a', 'a'), pkg('b', 'b')];
        const c = commit({ scope: 'unknown', files: ['packages/b/src/y.ts'] });
        expect(attributeCommitToPackages(c, pkgs, '/repo')).toEqual(['b']);
    });
});
