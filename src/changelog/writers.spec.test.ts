/**
 * Specification tests for the changelog and release-notes writers.
 *
 * Written before the implementation exists. Uses real temp directories (no mocks).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeOrUpdateChangelog } from './changelog-writer.js';
import { writeReleaseNotes } from './release-notes-writer.js';

const dirs: string[] = [];
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-w-'));
    dirs.push(d);
    return d;
}

describe('writeOrUpdateChangelog', () => {
    it('should create a new CHANGELOG.md with header and version entry', () => {
        const d = tmp();
        writeOrUpdateChangelog(d, '1.2.0', '2026-07-12', '### Added\n- new thing');
        const content = fs.readFileSync(path.join(d, 'CHANGELOG.md'), 'utf8');
        expect(content).toContain('# Changelog');
        expect(content).toContain('## [1.2.0] - 2026-07-12');
        expect(content).toContain('### Added');
    });

    it('should prepend a new version above existing entries', () => {
        const d = tmp();
        writeOrUpdateChangelog(d, '1.2.0', '2026-07-12', '### Added\n- first');
        writeOrUpdateChangelog(d, '1.3.0', '2026-07-13', '### Fixed\n- second');
        const content = fs.readFileSync(path.join(d, 'CHANGELOG.md'), 'utf8');
        expect(content.indexOf('## [1.3.0]')).toBeLessThan(content.indexOf('## [1.2.0]'));
        expect(content).toContain('- first');
        expect(content).toContain('- second');
    });

    it('should write a fallback entry when content is empty', () => {
        const d = tmp();
        writeOrUpdateChangelog(d, '1.2.0', '2026-07-12', '');
        expect(fs.readFileSync(path.join(d, 'CHANGELOG.md'), 'utf8')).toContain('Version bump');
    });

    it('should strip markdown code fences from content', () => {
        const d = tmp();
        writeOrUpdateChangelog(d, '1.2.0', '2026-07-12', '```markdown\n### Added\n- x\n```');
        const content = fs.readFileSync(path.join(d, 'CHANGELOG.md'), 'utf8');
        expect(content).toContain('### Added');
        expect(content).not.toContain('```');
    });
});

describe('writeReleaseNotes', () => {
    it('should overwrite with the latest release and fall back to a placeholder when empty', () => {
        const root = tmp();
        writeReleaseNotes(root, '1.2.0', '2026-07-12', 'First notes.');
        writeReleaseNotes(root, '1.3.0', '2026-07-13', '');
        const content = fs.readFileSync(path.join(root, 'RELEASE_NOTES.md'), 'utf8');
        expect(content).toContain('1.3.0');
        expect(content).not.toContain('First notes.');
        expect(content.trim().length).toBeGreaterThan(0);
    });
});
