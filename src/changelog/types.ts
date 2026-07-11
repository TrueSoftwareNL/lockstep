/**
 * Shared type definitions for the AI changelog generator.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

/**
 * A parsed conventional commit with structured metadata.
 *
 * Conventional format: `type(scope): subject`, optionally with a `!` breaking marker and a body.
 */
export interface ParsedCommit {
    /** Short commit hash. */
    hash: string;
    /** Conventional type (feat, fix, …), or "" when the subject is not conventional. */
    type: string;
    /** Conventional scope, or "" when absent. */
    scope: string;
    /** Subject line without the type/scope prefix. */
    subject: string;
    /** Full commit body; captured so `BREAKING CHANGE:` footers remain visible. */
    body: string;
    /** Repo-relative files changed in this commit. */
    files: string[];
}

/**
 * Summary of a single package's changes since the last release — the unit sent to the LLM.
 */
export interface PackageChangeSummary {
    /** Full package name from package.json. */
    packageName: string;
    /** Unscoped name / directory basename used for scope matching. */
    shortName: string;
    /** Absolute package directory. */
    packageDir: string;
    /** Repo-relative package directory, for display. */
    packagePath: string;
    /** Commits attributed to this package. */
    commits: ParsedCommit[];
    /** Repo-relative files changed within this package. */
    changedFiles: string[];
}

/**
 * Configuration for the LLM provider. API keys come from the environment; model names default to
 * current low-cost models and are overridable.
 */
export interface LLMConfig {
    openaiApiKey?: string | undefined;
    openaiModel: string;
    anthropicApiKey?: string | undefined;
    anthropicModel: string;
}

/**
 * Result of a single LLM generation call.
 */
export interface LLMResult {
    /** Generated text content. */
    content: string;
    /** Which provider produced the content. */
    provider: 'openai' | 'anthropic';
    /** The model used. */
    model: string;
    /** Token usage for cost visibility. */
    tokensUsed: { input: number; output: number };
}

/**
 * Options for changelog generation.
 */
export interface ChangelogOptions {
    /** Print what would be generated without writing files. */
    dryRun?: boolean;
    /** Print detailed progress, provider/model, and token usage. */
    verbose?: boolean;
}
