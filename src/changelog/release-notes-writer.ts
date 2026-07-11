/**
 * Root RELEASE_NOTES.md writer.
 *
 * Always overwrites the file so it holds only the latest release's non-technical notes; previous
 * notes remain in git history. Fence-wrapped output is sanitized and empty output falls back to a
 * short placeholder.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the root `RELEASE_NOTES.md` for a release.
 * @param root - Repository root
 * @param version - The version being released
 * @param date - Release date (YYYY-MM-DD)
 * @param content - The non-technical notes (may be empty → placeholder)
 *
 * @example
 * writeReleaseNotes(process.cwd(), "1.2.0", "2026-07-12", "This release adds …");
 */
export function writeReleaseNotes(root: string, version: string, date: string, content: string): void {
    const cleaned =
        content
            .replace(/^```(?:markdown|md)?\s*\n?/m, '')
            .replace(/\n?```\s*$/m, '')
            .trim() || 'This release includes various improvements and bug fixes.';

    const file = path.join(root, 'RELEASE_NOTES.md');
    fs.writeFileSync(file, `# Release Notes — v${version}\n\n**Released**: ${date}\n\n${cleaned}\n`, 'utf8');
}
