/**
 * Implementation tests for single-package repository support — the boundary conditions of the
 * root-package fallback in workspace discovery.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-single-impl-'));
    dirs.push(dir);
    return dir;
}

describe('root-package fallback boundaries', () => {
    it('should NOT include the root package when packages/ has entries (monorepo unaffected)', () => {
        const dir = tmp();
        // A private workspace-root manifest must never be swept into a monorepo's package set.
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0', private: true }));
        for (const name of ['a', 'b']) {
            fs.mkdirSync(path.join(dir, 'packages', name), { recursive: true });
            fs.writeFileSync(path.join(dir, 'packages', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
        }
        const { packages } = new Lockstep({ root: dir }).buildWorkspace();
        expect(packages.map((p) => p.name).sort()).toEqual(['a', 'b']);
    });

    it('should find no packages when neither packages/ nor a root package.json exists', () => {
        const dir = tmp();
        const { packages } = new Lockstep({ root: dir }).buildWorkspace();
        expect(packages).toEqual([]);
    });
});
