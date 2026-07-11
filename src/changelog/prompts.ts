/**
 * Prompt templates for changelog and release-notes generation.
 *
 * Prompts include only commit metadata — type, subject, a truncated body, and changed-file paths —
 * never file contents, bounding what leaves the machine and keeping token cost predictable.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import type { PackageChangeSummary, ParsedCommit } from './types.js';

/** Max body characters included per commit. */
const MAX_BODY_CHARS = 200;
/** Max changed files listed per commit. */
const MAX_FILES_PER_COMMIT = 10;

const CHANGELOG_SYSTEM = `You are a technical writer generating a changelog entry for a software package.
You write in Keep a Changelog format (https://keepachangelog.com/).
Categorize changes into: Added, Changed, Deprecated, Removed, Fixed, Security.
Only include categories that have entries. Be concise but descriptive; one line per entry.
Do not include the version header — only the categorized entries.
Do not wrap the output in markdown code fences.`;

const RELEASE_NOTES_SYSTEM = `You are a communications writer generating release notes for a software project.
Write in clear, non-technical language for stakeholders and non-developer audiences.
Focus on WHAT changed and WHY it matters, not HOW it was implemented. Avoid jargon.
Structure as a brief summary followed by highlights. Do not wrap the output in markdown code fences.`;

/**
 * Formats one commit as a metadata line (type, subject, hash, truncated body, capped file paths).
 * @param commit - The parsed commit
 * @returns A human-readable line for the prompt
 */
function formatCommit(commit: ParsedCommit): string {
    const label = commit.type ? `[${commit.type}]` : '[other]';
    let line = `- ${label} ${commit.subject} (${commit.hash})`;
    if (commit.body) {
        const body = commit.body.length > MAX_BODY_CHARS ? commit.body.slice(0, MAX_BODY_CHARS) + '…' : commit.body;
        line += `\n  Body: ${body}`;
    }
    if (commit.files.length > 0) {
        const shown = commit.files.slice(0, MAX_FILES_PER_COMMIT);
        const extra = commit.files.length > MAX_FILES_PER_COMMIT ? ` (+${commit.files.length - MAX_FILES_PER_COMMIT} more)` : '';
        line += `\n  Files: ${shown.join(', ')}${extra}`;
    }
    return line;
}

/**
 * Builds the system + user prompts for a per-package changelog entry.
 * @param summary - The package change summary
 * @returns The system and user prompt strings
 *
 * @example
 * const { system, user } = buildChangelogPrompt(summary);
 */
export function buildChangelogPrompt(summary: PackageChangeSummary): { system: string; user: string } {
    const commits = summary.commits.map(formatCommit).join('\n') || '(no commits attributed to this package)';
    const files = summary.changedFiles.length > 0 ? summary.changedFiles.join('\n') : '(no file-level changes detected)';
    const user = `Generate a changelog entry for package "${summary.packageName}" based on these commits:

${commits}

Changed files in this package:
${files}

Output ONLY the categorized changelog entries in Keep a Changelog format.
Do not include version headers, dates, or any other text.`;
    return { system: CHANGELOG_SYSTEM, user };
}

/**
 * Builds the system + user prompts for the root release notes.
 * @param version - The version being released
 * @param summaries - The per-package change summaries
 * @returns The system and user prompt strings
 *
 * @example
 * const { system, user } = buildReleaseNotesPrompt("1.2.0", summaries);
 */
export function buildReleaseNotesPrompt(
    version: string,
    summaries: PackageChangeSummary[]
): { system: string; user: string } {
    const sections = summaries
        .map(s => {
            const lines = s.commits.map(c => `- ${c.subject}`).join('\n') || '- (file changes only)';
            return `## ${s.packageName}\nCommits:\n${lines}\nChanged files: ${s.changedFiles.length}`;
        })
        .join('\n\n');
    const user = `Generate release notes for version ${version}.

The following packages were updated:

${sections}

Write a brief, non-technical summary of this release. Focus on user-facing improvements.
Keep it concise — aim for 150-350 words.`;
    return { system: RELEASE_NOTES_SYSTEM, user };
}
