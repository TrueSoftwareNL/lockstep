# LLM Provider & Prompts: AI Changelog

> **Document**: 03-02-llm-provider-and-prompts.md
> **Parent**: [Index](00-index.md)

## Overview

Owns `src/changelog/llm-provider.ts` and `src/changelog/prompts.ts`. The provider is an abstraction
over OpenAI (primary) and Anthropic (fallback) that **never throws** — on any failure it returns
null so the caller writes a fallback entry. SDKs are dynamically imported so the tool runs without
them installed. Prompts are separated from logic so they can be tuned without touching provider code.

## Implementation Details

### Types (`src/changelog/types.ts`, added here)

```typescript
export interface LLMConfig {
  openaiApiKey?: string;
  openaiModel: string;      // default: a current low-cost model (env-overridable)
  anthropicApiKey?: string;
  anthropicModel: string;   // default: a current low-cost Claude model (env-overridable)
}

export interface LLMResult {
  content: string;
  provider: "openai" | "anthropic";
  model: string;
  tokensUsed: { input: number; output: number };
}
```

### LLM Provider (`src/changelog/llm-provider.ts`)

```typescript
/** Builds an LLMConfig from environment variables; model names default to current low-cost models. */
export function createLLMConfig(env?: NodeJS.ProcessEnv): LLMConfig;

export class LLMProvider {
  constructor(config: LLMConfig);

  /** Providers with a configured key, in preference order: ["openai", "anthropic"]. */
  getAvailableProviders(): Array<"openai" | "anthropic">;

  /**
   * Sends a prompt: tries OpenAI first, falls back to Anthropic on failure/absence, returns null
   * if both are unavailable or fail. NEVER throws.
   */
  async generate(systemPrompt: string, userPrompt: string, options?: { maxTokens?: number; timeout?: number }): Promise<LLMResult | null>;

  /** The real SDK calls — protected so tests subclass and stub them without network (AR PA-4). */
  protected callOpenAI(system: string, user: string, maxTokens: number, timeout: number): Promise<LLMResult>;
  protected callAnthropic(system: string, user: string, maxTokens: number, timeout: number): Promise<LLMResult>;
}
```

`callOpenAI` / `callAnthropic` use dynamic `import("openai")` / `import("@anthropic-ai/sdk")`; a
missing module or API error is caught by `generate` and routed to fallback. Default request timeout
30 s; default max output tokens ~2048. **Exact default model IDs are pinned at implementation to the
current generation** (per the claude-api reference for the Claude model), remaining env-overridable
(RD-01 AR #13). Keys are read only from the environment and never logged.

### Prompts (`src/changelog/prompts.ts`)

```typescript
/** System + user prompt for a per-package changelog entry (Keep a Changelog categories). */
export function buildChangelogPrompt(summary: PackageChangeSummary): { system: string; user: string };

/** System + user prompt for the root non-technical release notes. */
export function buildReleaseNotesPrompt(version: string, summaries: PackageChangeSummary[]): { system: string; user: string };
```

The user prompt includes only **commit metadata** — type, subject, truncated body (≤ ~200 chars),
and changed-file **paths** (capped) — and the changed-file list. **No file contents** are included
(RD-01, RD-03). Commit formatting caps body length and file counts to bound token cost.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| No API key configured | `getAvailableProviders` empty; `generate` returns null → caller writes fallback | RD-01 AR #9 |
| OpenAI call throws | Caught; fall back to Anthropic if keyed | RD-01 AR #4 |
| Both providers fail | `generate` returns null; caller writes fallback; never throws | RD-01 AR #9, RD-03 |
| SDK not installed (dynamic import fails) | Caught like any provider error → fallback | RD-03 |
| Request hangs | Per-call timeout (default 30 s) bounds it → fallback | RD-03 |

> **Traceability:** references the registers. Only exceptions: universally obvious facts.

## Testing Requirements
- A test subclass overrides `callOpenAI`/`callAnthropic` to assert: OpenAI is tried first; Anthropic
  is used when OpenAI throws; null is returned when both fail; `generate` never throws.
- `createLLMConfig` reads keys/models from an injected env; `getAvailableProviders` reflects keys.
- `buildChangelogPrompt` / `buildReleaseNotesPrompt` include only metadata (assert no file-content
  string in the payload).
