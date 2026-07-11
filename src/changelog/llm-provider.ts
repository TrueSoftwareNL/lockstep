/**
 * LLM provider for changelog generation.
 *
 * Abstracts over OpenAI (primary) and Anthropic (fallback). It is designed to never block a
 * release: on any failure — missing key, missing SDK, API error, timeout — `generate` returns null
 * so the caller writes a deterministic fallback entry. SDKs are loaded through a dynamic import with
 * a runtime-resolved specifier, so the tool builds and runs without them installed; they are
 * declared as optional dependencies and only needed to actually call a model.
 *
 * @author TrueSoftware B.V.
 * @license MIT
 */

import type { LLMConfig, LLMResult } from './types.js';

/** Default OpenAI model when OPENAI_MODEL is unset (a current low-cost model). */
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
/** Default Anthropic model when ANTHROPIC_MODEL is unset (a current low-cost model). */
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
/** Default per-call request timeout (ms). */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Default max output tokens — sufficient for a changelog entry. */
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

/**
 * Builds an LLMConfig from environment variables. Only API keys are strictly required; model names
 * default to current low-cost models.
 * @param env - Environment to read (defaults to `process.env`)
 * @returns The resolved configuration
 *
 * @example
 * createLLMConfig({ OPENAI_API_KEY: "sk-..." }); // → { openaiApiKey: "sk-...", openaiModel: "gpt-4o-mini", … }
 */
export function createLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig {
    return {
        openaiApiKey: env.OPENAI_API_KEY || undefined,
        openaiModel: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
        anthropicModel: env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    };
}

/** Dynamically imports an optional module by a runtime-resolved name (untyped by design). */
async function loadOptional(moduleName: string): Promise<any> {
    return import(moduleName);
}

/**
 * LLM provider with automatic OpenAI→Anthropic fallback.
 *
 * @example
 * const provider = new LLMProvider(createLLMConfig());
 * const result = await provider.generate("You are a changelog writer.", "Summarize these commits…");
 * if (result) console.log(result.content); // null when no provider is available
 */
export class LLMProvider {
    /** The provider configuration (keys + model names). */
    protected config: LLMConfig;

    /**
     * @param config - API keys and model names
     */
    constructor(config: LLMConfig) {
        this.config = config;
    }

    /**
     * Providers with a configured key, in preference order (OpenAI first).
     * @returns The available provider names
     */
    getAvailableProviders(): Array<'openai' | 'anthropic'> {
        const providers: Array<'openai' | 'anthropic'> = [];
        if (this.config.openaiApiKey) providers.push('openai');
        if (this.config.anthropicApiKey) providers.push('anthropic');
        return providers;
    }

    /**
     * Sends a prompt to the first available provider, falling back to the next on failure. Never
     * throws — returns null when no provider is available or all fail.
     * @param systemPrompt - System/instruction prompt
     * @param userPrompt - The request
     * @param options - Optional token/timeout overrides
     * @returns The generation result, or null
     */
    async generate(
        systemPrompt: string,
        userPrompt: string,
        options?: { maxTokens?: number; timeout?: number }
    ): Promise<LLMResult | null> {
        const maxTokens = options?.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
        const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

        if (this.config.openaiApiKey) {
            try {
                return await this.callOpenAI(systemPrompt, userPrompt, maxTokens, timeout);
            } catch (error) {
                console.warn(`OpenAI generation failed, trying Anthropic: ${message(error)}`);
            }
        }

        if (this.config.anthropicApiKey) {
            try {
                return await this.callAnthropic(systemPrompt, userPrompt, maxTokens, timeout);
            } catch (error) {
                console.warn(`Anthropic generation failed: ${message(error)}`);
            }
        }

        return null;
    }

    /**
     * Calls OpenAI. Isolated as a protected seam so tests can stub it without network or SDK.
     * @throws If the SDK is unavailable or the API call fails
     */
    protected async callOpenAI(
        systemPrompt: string,
        userPrompt: string,
        maxTokens: number,
        timeout: number
    ): Promise<LLMResult> {
        const { default: OpenAI } = await loadOptional('openai');
        const client = new OpenAI({ apiKey: this.config.openaiApiKey, timeout });
        const response = await client.chat.completions.create({
            model: this.config.openaiModel,
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        });
        return {
            content: response.choices[0]?.message?.content ?? '',
            provider: 'openai',
            model: this.config.openaiModel,
            tokensUsed: {
                input: response.usage?.prompt_tokens ?? 0,
                output: response.usage?.completion_tokens ?? 0
            }
        };
    }

    /**
     * Calls Anthropic. Isolated as a protected seam so tests can stub it without network or SDK.
     * @throws If the SDK is unavailable or the API call fails
     */
    protected async callAnthropic(
        systemPrompt: string,
        userPrompt: string,
        maxTokens: number,
        timeout: number
    ): Promise<LLMResult> {
        const { default: Anthropic } = await loadOptional('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: this.config.anthropicApiKey, timeout });
        const response = await client.messages.create({
            model: this.config.anthropicModel,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });
        const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
        return {
            content: textBlock && 'text' in textBlock ? textBlock.text : '',
            provider: 'anthropic',
            model: this.config.anthropicModel,
            tokensUsed: {
                input: response.usage?.input_tokens ?? 0,
                output: response.usage?.output_tokens ?? 0
            }
        };
    }
}

/** Extracts a readable message from an unknown error. */
function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
