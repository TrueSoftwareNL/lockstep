/**
 * Per-package CHANGELOG.md writer (Keep a Changelog format).
 *
 * Creates a new changelog with the standard header, or prepends a new version entry above the
 * existing ones. Empty or fence-wrapped LLM output is sanitized; empty content falls back to a
 * minimal "Version bump" entry so every release keeps an unbroken version history.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import fs from 'node:fs';
import path from 'node:path';

/** Standard Keep a Changelog header. */
const HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

/**
 * Strips markdown code fences and falls back to a minimal entry when content is empty.
 * @param content - Raw LLM output
 * @param version - Version used in the fallback message
 * @returns Non-empty, fence-free content
 */
function sanitize(content: string, version: string): string {
    const cleaned = content
        .replace(/^```(?:markdown|md)?\s*\n?/m, '')
        .replace(/\n?```\s*$/m, '')
        .trim();
    return cleaned || `### Changed\n- Version bump to ${version}`;
}

/**
 * Creates or prepends a per-package `CHANGELOG.md` entry for a version.
 * @param packageDir - The package directory
 * @param version - The version being released
 * @param date - Release date (YYYY-MM-DD)
 * @param content - The categorized changelog body (may be empty → fallback)
 *
 * @example
 * writeOrUpdateChangelog("packages/api", "1.2.0", "2026-07-12", "### Added\n- endpoint");
 */
export function writeOrUpdateChangelog(packageDir: string, version: string, date: string, content: string): void {
    const file = path.join(packageDir, 'CHANGELOG.md');
    const entry = `## [${version}] - ${date}\n\n${sanitize(content, version)}\n`;

    if (!fs.existsSync(file)) {
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(file, `${HEADER}\n${entry}`, 'utf8');
        return;
    }

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const at = lines.findIndex(l => l.startsWith('## ['));
    if (at >= 0) {
        lines.splice(at, 0, entry);
    } else {
        lines.push('', entry);
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
}
