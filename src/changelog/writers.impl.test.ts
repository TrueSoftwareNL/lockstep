/**
 * Implementation tests for the writers and orchestration edge cases.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeOrUpdateChangelog } from './changelog-writer.js';
import { writeReleaseNotes } from './release-notes-writer.js';
import { Lockstep } from '../lockstep.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(prefix: string): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(d);
    return d;
}

describe('writer edge cases', () => {
    it('should create a missing package directory before writing', () => {
        const root = tmp('lockstep-wi-');
        const pkgDir = path.join(root, 'packages', 'new-pkg');
        writeOrUpdateChangelog(pkgDir, '1.0.0', '2026-07-12', '### Added\n- x');
        expect(fs.existsSync(path.join(pkgDir, 'CHANGELOG.md'))).toBe(true);
    });

    it('should strip fences from release notes', () => {
        const root = tmp('lockstep-wi-');
        writeReleaseNotes(root, '1.0.0', '2026-07-12', '```markdown\nGreat release.\n```');
        const content = fs.readFileSync(path.join(root, 'RELEASE_NOTES.md'), 'utf8');
        expect(content).toContain('Great release.');
        expect(content).not.toContain('```');
    });
});

describe('changelog early return', () => {
    it('should write nothing when there are no changes since the last tag', async () => {
        const dir = tmp('lockstep-wi-');
        const git = (cmd: string): void => { execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' }); };
        git('init -q');
        git('config user.email t@e.com');
        git('config user.name T');
        git('config commit.gpgsign false');
        fs.mkdirSync(path.join(dir, 'packages', 'a'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'packages/a/package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }));
        git('add -A');
        git('commit -q -m "chore: init"');
        git('tag v1.0.0'); // tag is at HEAD → no changes since

        await new Lockstep({ root: dir }).changelog();
        expect(fs.existsSync(path.join(dir, 'packages/a/CHANGELOG.md'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'RELEASE_NOTES.md'))).toBe(false);
    });
});
